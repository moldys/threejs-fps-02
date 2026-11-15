// Weapons: definitions, the loadout, firing timing, recoil/spread, and the
// first-person viewmodel (a small mesh family bolted to the camera). Spread
// penalises moving and rewards standing still, crouching and pacing shots —
// accuracy counts more than speed. One module owns every weapon rule.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'V-9 Sidearm', cost: 0, slot: 2,
    dmg: 24, head: 3.5, mag: 12, reserve: 48,
    fireInterval: 0.21, reload: 1.3, auto: false,
    spreadBase: 0.008, spreadMove: 0.022, spreadJump: 0.05, spreadCrouch: 0.6,
    bloomPerShot: 0.006, bloomDecay: 5.5, bloomMax: 0.045,
    kickP: 0.012, kickY: 0.004,
  },
  deagle: {
    key: 'deagle', name: 'B-12 Heavy Pistol', cost: 700, slot: 1,
    dmg: 54, head: 4, mag: 7, reserve: 35,
    fireInterval: 0.34, reload: 1.8, auto: false,
    spreadBase: 0.01, spreadMove: 0.03, spreadJump: 0.06, spreadCrouch: 0.65,
    bloomPerShot: 0.012, bloomDecay: 4, bloomMax: 0.06,
    kickP: 0.024, kickY: 0.006,
  },
  smg: {
    key: 'smg', name: 'K-7 Submachine Gun', cost: 1500, slot: 1,
    dmg: 21, head: 3.4, mag: 30, reserve: 120,
    fireInterval: 0.09, reload: 1.9, auto: true,
    spreadBase: 0.012, spreadMove: 0.03, spreadJump: 0.055, spreadCrouch: 0.6,
    bloomPerShot: 0.004, bloomDecay: 6, bloomMax: 0.05,
    kickP: 0.008, kickY: 0.003,
  },
  rifle: {
    key: 'rifle', name: 'R-4 Assault Rifle', cost: 2700, slot: 1,
    dmg: 32, head: 3.8, mag: 30, reserve: 90,
    fireInterval: 0.105, reload: 2.2, auto: true,
    spreadBase: 0.0045, spreadMove: 0.018, spreadJump: 0.05, spreadCrouch: 0.55,
    bloomPerShot: 0.005, bloomDecay: 6, bloomMax: 0.04,
    kickP: 0.011, kickY: 0.0035,
  },
};

export const GRENADE = {
  key: 'nade', name: 'HE Frag Grenade', cost: 300, max: 2,
};

const SLOT_ORDER = [1, 2, 3];

export function createWeapon(camera) {
  const state = {
    primary: null, // weapon key in slot 1
    secondary: 'pistol',
    nades: 0,
    slot: 2, // active slot
    weapon: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloading: false,
    reloadT: 0,
    bloom: 0,
    switchT: 0,
    kickT: 0,
    flashT: 0,
    bobPhase: 0,
  };

  const view = buildViewmodel();
  camera.add(view.group);

  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _right = new THREE.Vector3();

  function currentDef() {
    return WEAPONS[state.weapon] || null;
  }

  function selectSlot(slot) {
    if (slot === state.slot || state.switchT > 0) return;
    let key = null;
    if (slot === 1 && state.primary) key = state.primary;
    else if (slot === 2) key = state.secondary;
    else if (slot === 3 && state.nades > 0) key = 'nade';
    if (!key) return;
    state.slot = slot;
    state.weapon = key;
    state.switchT = 0.28;
    state.reloading = false;
    state.reloadT = 0;
    state.bloom = 0;
    state.cooldown = Math.max(state.cooldown, 0.15);
    if (key === 'nade') {
      state.mag = 0;
      state.reserve = state.nades;
    } else {
      const def = WEAPONS[key];
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    view.showFor(key === 'nade' ? 'nade' : 'gun');
  }

  function buyPrimary(key) {
    const def = WEAPONS[key];
    if (!def || def.slot !== 1) return;
    state.primary = key;
    if (state.slot === 1 || state.weapon === key) {
      state.weapon = key;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.reloading = false;
    }
  }

  function buyNade() {
    state.nades = Math.min(GRENADE.max, state.nades + 1);
    if (state.slot === 3) {
      state.reserve = state.nades;
    }
  }

  function resetForRound(boughtPrimary, nades, armor) {
    state.primary = boughtPrimary || null;
    state.nades = nades;
    state.slot = 2;
    state.weapon = 'pistol';
    const def = WEAPONS.pistol;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloading = false;
    state.reloadT = 0;
    state.bloom = 0;
    state.switchT = 0;
    view.showFor('gun');
  }

  function step(dt, player) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.switchT > 0) {
      state.switchT -= dt;
      if (state.switchT < 0) state.switchT = 0;
    }
    if (state.reloading) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) {
        state.reloading = false;
        state.reloadT = 0;
        const def = currentDef();
        if (def) {
          const need = def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    }
    state.bloom *= Math.max(0, 1 - (state.weapon === 'nade' ? 0 : WEAPONS[state.weapon] ? WEAPONS[state.weapon].bloomDecay : 5) * dt);
    if (state.kickT > 0) state.kickT -= dt * 4;
    if (state.kickT < 0) state.kickT = 0;
    if (state.flashT > 0) state.flashT -= dt * 10;
    if (state.flashT < 0) state.flashT = 0;
    player.settleRecoil(dt);
    updateViewmodel(dt, player);
  }

  function spreadFor(player) {
    const def = currentDef();
    if (!def) return 0;
    const speed = player.groundSpeed();
    const move = Math.min(1, speed / 5.4) * def.spreadMove;
    const air = player.state.onGround ? 0 : def.spreadJump;
    const crouch = player.state.crouching ? 1 - def.spreadCrouch : 1;
    return (def.spreadBase + move + air) * crouch + state.bloom;
  }

  function tryFire(player) {
    if (state.switchT > 0 || state.cooldown > 0) return null;
    if (state.reloading) return null;
    if (state.weapon === 'nade') return null; // thrown via tryThrow
    const def = currentDef();
    if (!def) return null;
    if (state.mag <= 0) {
      state.cooldown = 0.25;
      return { dry: true };
    }
    state.mag -= 1;
    state.cooldown = def.fireInterval;
    state.bloom = Math.min(def.bloomMax, state.bloom + def.bloomPerShot);
    const kickP = def.kickP * (0.8 + Math.random() * 0.4);
    const kickY = def.kickY * (Math.random() * 2 - 1);
    player.applyRecoil(kickP, kickY);
    player.state.pitch += kickP * 0.35;
    state.kickT = 1;
    state.flashT = 1;

    // Ray direction with spread.
    const spread = spreadFor(player);
    camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, _up).normalize();
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - u * u - v * v)) || 0;
    _dir.addScaledVector(_right, u * spread);
    _dir.addScaledVector(_up, v * spread);
    _dir.normalize();

    return { origin: camera.position.clone(), dir: _dir.clone(), weapon: def, key: state.weapon };
  }

  function tryReload() {
    const def = currentDef();
    if (!def || state.reloading || state.switchT > 0) return false;
    if (state.mag >= def.mag || state.reserve <= 0) return false;
    state.reloading = true;
    state.reloadT = def.reload;
    view.reloadDip = 1;
    return true;
  }

  function tryThrow() {
    if (state.weapon !== 'nade' || state.nades <= 0 || state.switchT > 0) return null;
    state.nades -= 1;
    state.reserve = state.nades;
    state.cooldown = 0.5;
    state.kickT = 1;
    if (state.nades <= 0) {
      state.slot = 2;
      state.weapon = state.secondary;
      const def = WEAPONS[state.secondary];
      state.mag = def.mag;
      state.reserve = def.reserve;
      view.showFor('gun');
    }
    camera.getWorldDirection(_dir);
    return { origin: camera.position.clone(), dir: _dir.clone() };
  }

  function firemode() {
    const def = currentDef();
    return def ? def.auto : false;
  }

  function buildViewmodel() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c3545, roughness: 0.45, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x171d28, roughness: 0.6, metalness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.9 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xf2b53c, emissive: 0xf2b53c, emissiveIntensity: 2 });

    const gun = new THREE.Group();
    // Receiver
    add(gun, 0, 0, 0, 0.07, 0.09, 0.34, metal);
    // Barrel
    add(gun, 0, 0.02, -0.24, 0.045, 0.05, 0.28, dark);
    // Muzzle
    const muzzle = add(gun, 0, 0.02, -0.4, 0.05, 0.055, 0.05, dark);
    // Magazine
    add(gun, 0, -0.11, 0.05, 0.055, 0.14, 0.09, grip);
    // Grip
    add(gun, 0, -0.12, 0.12, 0.05, 0.1, 0.06, grip);
    // Front sight
    add(gun, 0, 0.07, -0.2, 0.02, 0.05, 0.02, dark);
    // Rear sight
    add(gun, 0, 0.06, 0.14, 0.025, 0.04, 0.03, dark);
    // Stock
    add(gun, 0, 0, 0.2, 0.055, 0.07, 0.16, metal);

    // Grenade model (slot 3)
    const nade = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), metal);
    nade.add(sphere);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.12), dark);
    lever.position.set(0, 0.02, -0.08);
    nade.add(lever);

    // Muzzle flash: emissive plane at the barrel tip.
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), glow);
    flash.position.set(0, 0.02, -0.46);
    flash.rotation.x = Math.PI / 2;
    flash.visible = false;
    gun.add(flash);

    group.add(gun);
    group.add(nade);
    group.position.set(0.26, -0.24, -0.42);
    group.rotation.y = -0.06;
    nade.visible = false;
    gun.visible = true;

    const flashLight = new THREE.PointLight(0xf2b53c, 0, 3, 2);
    flashLight.position.set(0, 0.02, -0.5);
    gun.add(flashLight);

    function add(parent, x, y, z, w, h, d, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }

    return {
      group,
      gun,
      nade,
      flash,
      flashLight,
      reloadDip: 0,
      showFor(kind) {
        gun.visible = kind === 'gun';
        nade.visible = kind === 'nade';
        this.kind = kind;
      },
    };
  }

  function updateViewmodel(dt, player) {
    const speed = player.groundSpeed();
    state.bobPhase += dt * (4 + speed * 1.6);
    const bob = Math.sin(state.bobPhase) * Math.min(0.02, speed * 0.012);
    const bobX = Math.cos(state.bobPhase * 0.5) * Math.min(0.012, speed * 0.008);

    const reloadDip = view.reloadDip > 0 ? (view.reloadDip -= dt * 3, Math.max(0, view.reloadDip)) : 0;
    const kick = state.kickT * 0.06;
    const switchSwing = state.switchT > 0 ? Math.sin((0.28 - state.switchT) / 0.28 * Math.PI) * 0.18 : 0;

    view.group.position.set(
      0.26 + bobX + switchSwing * 0.4,
      -0.24 + bob - reloadDip * 0.05 - switchSwing * 0.1,
      -0.42 + kick + reloadDip * 0.06 - switchSwing * 0.12
    );
    view.group.rotation.set(
      -bob * 0.6 + kick * 0.8 + reloadDip * 0.5,
      -0.06 + bobX * 0.5 + switchSwing * 0.6,
      kick * 1.2
    );

    view.flash.visible = state.flashT > 0;
    view.flashLight.intensity = state.flashT > 0 ? 6 * state.flashT : 0;
  }

  return {
    state,
    WEAPONS,
    selectSlot,
    buyPrimary,
    buyNade,
    resetForRound,
    step,
    tryFire,
    tryReload,
    tryThrow,
    firemode,
    spreadFor,
    currentDef,
  };
}
