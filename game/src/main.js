// Boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; nothing game-logic happens in the render callback. This file
// wires the modules together and owns the hitscan battle (player shots against
// bots, bot shots against the player), the small visual-effect pools, and the
// ?shot= capture scenes used for the entry's screenshots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createGrenades } from './grenade.js';
import { createBots } from './bots.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

// ---- Renderer / scene / camera --------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 95);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// ---- Systems ---------------------------------------------------------------
const world = createWorld(scene);
const audio = createAudio();

let game;
let started = false;
const hud = createHud({
  onStart() {
    audio.unlock();
    started = true;
    input.requestLock();
    game.g.phase = 'buy';
    game.g.phaseT = 0;
    game.g.buyOpen = false;
    hud.showOverlay(null);
    hud.showBuy(false);
  },
  onResume() {
    audio.unlock();
    input.requestLock();
    hud.showOverlay(null);
  },
  onBuyClose() {
    game.g.buyOpen = false;
    hud.showBuy(false);
  },
  onBuyNext() {
    game.g.buyOpen = false;
    hud.showBuy(false);
    game.startRound();
  },
  onEndNext() {
    game.startRound();
    hud.showOverlay(null);
  },
  onBuy(key) {
    game.buy(key);
    hud.showBuy(true);
  },
  onBuyList() {
    return game.buyList();
  },
  onBuyMoney() {
    return game.g.money;
  },
});
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && game.g.phase === 'live' && !shot && player.state.alive && !game.g.bomb.defusing) {
    hud.showOverlay('paused');
  }
});
const player = createPlayer(world);
const weapon = createWeapon(camera);
const grenades = createGrenades(scene, world, {
  onExplode(pos) {
    effects.explosion(pos);
    audio.play('explosion');
    // Radius damage to bots and the player.
    const r = 6;
    for (const b of bots.bots) {
      if (!b.alive) continue;
      const d = b.pos.distanceTo(pos);
      if (d < r) bots.damage(b, 90 * (1 - d / r));
    }
    const p = player.state;
    if (p.alive) {
      const pd = p.position.distanceTo(pos);
      if (pd < r + 1) {
        player.damage(70 * Math.max(0, 1 - pd / (r + 1)));
        if (p.alive) audio.play('hurt');
      }
    }
  },
});
const effects = createEffects(scene);
const bots = createBots(scene, world, {
  player,
  hooks: {
    onBotFire(bot, origin, dir) {
      audio.play('shot_rifle');
      resolveShot(origin, dir, false, bot);
    },
    onBotStep() {
      audio.play('footstep');
    },
    onBotPlant(bot, siteKey) {
      game.plantBomb(bot, siteKey);
    },
  },
});

const playerHit = buildPlayerProxy();
scene.add(playerHit.group);

const S = {
  scene,
  player,
  bots,
  weapon,
  grenades,
  world,
  audio,
  hud,
  input,
};
game = createGame(S);

// ---- The hitscan battle ----------------------------------------------------
const raycaster = new THREE.Raycaster();
function resolveShot(origin, dir, fromPlayer, bot) {
  raycaster.set(origin, dir);
  raycaster.far = 140;
  let targets;
  if (fromPlayer) {
    targets = world.shootables.concat(bots.collectShootables());
  } else {
    targets = world.shootables.concat(playerHit.meshes);
  }
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length === 0) {
    if (fromPlayer) effects.tracer(origin, dir, 60, true);
    return;
  }
  const hit = hits[0];
  if (fromPlayer) {
    effects.tracer(origin, hit.point, undefined, true);
    const ud = hit.object.userData;
    if (ud && ud.bot) {
      const def = weapon.currentDef();
      const mult = ud.part === 'head' ? def.head : 1;
      const falloff = Math.max(0.55, 1 - hit.distance / 70);
      const dmg = def.dmg * mult * falloff;
      const died = bots.damage(ud.bot, dmg);
      const headshot = ud.part === 'head';
      audio.play(died ? 'kill' : 'hit');
      hud.hitMarker(headshot, died ? 600 : 160);
      effects.blood(hit.point);
      if (died) {
        game.onKill('YOU', 'RAIDER', headshot, def.name);
      }
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal.clone() : null);
    }
  } else {
    const ud = hit.object.userData;
    if (ud && ud.player) {
      const mult = ud.part === 'head' ? 2.2 : 1;
      player.damage((bot ? bot.damage : 22) * mult);
      effects.blood(hit.point);
      if (player.state.alive) audio.play('hurt');
      else audio.play('kill');
      if (!player.state.alive) {
        document.body.classList.add('dead');
      }
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal.clone() : null);
    }
  }
}

function buildPlayerProxy() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.7, 8), bodyMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
  head.position.y = 1.6;
  group.add(body, head);
  body.userData = { player: true, part: 'body' };
  head.userData = { player: true, part: 'head' };
  return { group, meshes: [body, head] };
}

// ---- Visual effect pools ----------------------------------------------------
function createEffects(scene) {
  const sparks = [];
  const tracers = [];
  const bloodPool = [];
  const explosions = [];

  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0xe05a4e, transparent: true });
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true });
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xf2b53c, transparent: true, opacity: 0.9 });

  function pool(arr, make, n) {
    for (let i = 0; i < n; i += 1) {
      const o = make();
      o.active = false;
      scene.add(o.obj);
      arr.push(o);
    }
  }

  pool(sparks, () => ({
    obj: new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), sparkMat.clone()),
    t: 0, life: 0.18, active: false,
  }), 24);
  pool(tracers, () => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    return { obj: new THREE.Line(geo, tracerMat.clone()), t: 0, life: 0.09, active: false };
  }, 24);
  pool(bloodPool, () => ({
    obj: new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), bloodMat.clone()),
    t: 0, life: 0.3, active: false,
  }), 24);
  pool(explosions, () => ({
    obj: new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), boomMat.clone()),
    t: 0, life: 0.45, active: false,
  }), 8);

  function tracer(origin, dirOrPoint, length, big) {
    const o = tracers.find((e) => !e.active);
    if (!o) return;
    o.active = true;
    o.t = 0;
    const end = dirOrPoint.isVector3 ? dirOrPoint : origin.clone().addScaledVector(dirOrPoint, length);
    const pos = o.obj.geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    o.obj.material.opacity = big ? 0.9 : 0.5;
  }

  function impact(point, normal) {
    const o = sparks.find((e) => !e.active);
    if (!o) return;
    o.active = true;
    o.t = 0;
    o.obj.position.copy(point);
    if (normal) o.obj.position.addScaledVector(normal, 0.02);
    o.obj.scale.setScalar(1);
    o.obj.material.opacity = 1;
  }

  function blood(point) {
    const o = bloodPool.find((e) => !e.active);
    if (!o) return;
    o.active = true;
    o.t = 0;
    o.obj.position.copy(point);
    o.obj.scale.setScalar(1);
    o.obj.material.opacity = 1;
  }

  function explosion(point) {
    const o = explosions.find((e) => !e.active);
    if (!o) return;
    o.active = true;
    o.t = 0;
    o.obj.position.copy(point);
    o.obj.scale.setScalar(0.3);
    o.obj.material.opacity = 0.9;
  }

  function update(dt) {
    for (const poolArr of [sparks, tracers, bloodPool, explosions]) {
      for (const e of poolArr) {
        if (!e.active) continue;
        e.t += dt;
        if (e.t >= e.life) {
          e.active = false;
          e.obj.visible = false;
          continue;
        }
        e.obj.visible = true;
        const k = 1 - e.t / e.life;
        e.obj.material.opacity = k;
        if (e.life > 0.2) e.obj.scale.setScalar(0.3 + (1 - k) * 2.2);
      }
    }
  }

  return { tracer, impact, blood, explosion, update };
}

// ---- The simulation step ----------------------------------------------------
function step(dt) {
  // Input → weapon actions.
  const keys = input.state.keys;
  if (keys.has('_reloadTap')) {
    keys.delete('_reloadTap');
    weapon.tryReload();
  }
  if (keys.has('_slot1')) {
    keys.delete('_slot1');
    weapon.selectSlot(1);
  }
  if (keys.has('_slot2')) {
    keys.delete('_slot2');
    weapon.selectSlot(2);
  }
  if (keys.has('_slot3')) {
    keys.delete('_slot3');
    weapon.selectSlot(3);
  }
  if (input.state.nade) {
    const thrown = weapon.tryThrow();
    if (thrown) {
      audio.play('nade_throw');
      grenades.throwGrenade(thrown.origin, thrown.dir);
    }
  }

  // Buy menu toggle during the buy phase.
  if (input.state.buy && game.g.phase === 'buy') {
    game.g.buyOpen = !game.g.buyOpen;
    hud.showBuy(game.g.buyOpen);
  }

  // Primary fire.
  const firingHeld = input.state.firing;
  if (firingHeld && player.state.alive && game.g.phase === 'live') {
    const canAuto = weapon.firemode();
    if (canAuto || weapon.state.cooldown <= 0) {
      const fired = weapon.tryFire(player);
      if (fired) {
        if (fired.dry) {
          audio.play('dry');
        } else {
          audio.play('shot_' + fired.key);
          resolveShot(fired.origin, fired.dir, true);
        }
      }
    }
  }

  weapon.step(dt, player);
  player.step(dt, input.state);
  bots.step(dt);
  grenades.step(dt);
  effects.update(dt);
  game.step(dt);

  // Keep the player proxy glued to the player.
  const p = player.state;
  playerHit.group.position.set(p.position.x, p.position.y, p.position.z);
  playerHit.group.rotation.y = p.yaw;
}

// ---- Render ------------------------------------------------------------------
function syncCamera() {
  const p = player.state;
  camera.position.set(p.position.x, p.position.y + p.eyeHeight, p.position.z);
  camera.rotation.set(p.pitch + p.kickPitch, p.yaw + p.kickYaw, 0, 'YXZ');
}

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let deadOverlayShown = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (started && !shot) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    } else if (shot) {
      // In shot mode, keep the sim running at a slow rate so animations play.
      accumulator += dt;
      while (accumulator >= 0.033 && accumulator < 10) {
        step(0.033);
        accumulator -= 0.033;
      }
    }
    syncCamera();
    presentHud();
    if (game.g.phase === 'live' && !player.state.alive && !deadOverlayShown) {
      deadOverlayShown = true;
      hud.showOverlay('dead');
    } else if (game.g.phase !== 'live' && deadOverlayShown) {
      deadOverlayShown = false;
    }
  }
  renderer.render(scene, camera);
}

// ---- HUD snapshot --------------------------------------------------------------
function presentHud() {
  const w = weapon.state;
  const g = game.g;
  const p = player.state;
  const def = weapon.currentDef();
  const bloomMax = def && def.bloomMax ? def.bloomMax : 0.04;
  let interactHint = '';
  if (g.phase === 'live' && g.bomb.planted && p.alive) {
    const d = p.position.distanceTo(g.bomb.core.position);
    if (d < 3.2) {
      interactHint = g.bomb.defusing ? 'DEFUSING…' : 'HOLD [E] TO DEFUSE';
    }
  }
  hud.render({
    health: p.health,
    armor: p.armor,
    mag: w.mag,
    reserve: w.reserve,
    weaponName: w.weapon === 'nade' ? 'HE GRENADE ×' + w.reserve : def ? def.name : '',
    money: g.money,
    wins: g.wins,
    losses: g.losses,
    round: g.round,
    phase: g.phase,
    roundTime: g.phase === 'live' ? game.clock(g.roundTime) : '—',
    bombPlanted: g.bomb.planted,
    bombSite: g.bomb.site,
    bombTime: game.clock(g.bomb.timer),
    defusing: g.bomb.defusing,
    defuseT: g.bomb.defuseT,
    buyOpen: g.buyOpen,
    interactHint,
    bloom01: Math.min(1, w.bloom / bloomMax),
  });
  // Keep the end-of-round panel in sync with the match state.
  if (g.phase === 'end') {
    hud.setText('end-wins', String(g.wins));
    hud.setText('end-losses', String(g.losses));
    hud.setText('end-money', '$' + String(g.money));
  }
}

// ---- Resize ---------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Shot capture scenes ----------------------------------------------------------
function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eyeHeight);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(0.033);
}

function runShot(name) {
  hud.showOverlay(null);
  game.g.phase = 'live';
  game.g.roundTime = 60;
  bots.resetAll(0);
  for (const b of bots.bots) b.frozen = true;

  if (name === 'start') {
    player.reset();
    aimAt(new THREE.Vector3(0, 1, 10));
    game.g.phase = 'buy';
    hud.showOverlay('start');
  } else if (name === 'play') {
    player.reset();
    // The firefight happens in the mid lane, close and readable.
    player.state.position.set(0, 0, -10);
    const b = bots.bots[0];
    b.pos.set(0, 0, 2);
    b.yaw = Math.PI;
    b.health = 100;
    bots.bots[1].pos.set(3.4, 0, 3); // peeking from behind the east crate
    bots.bots[1].yaw = Math.PI * 1.06;
    bots.bots[2].pos.set(-4.5, 0, 7);
    bots.bots[2].yaw = Math.PI * 0.94;
    aimAt(b.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
    for (let i = 0; i < 3; i += 1) {
      const fired = weapon.tryFire(player);
      if (fired && !fired.dry) {
        resolveShot(fired.origin, fired.dir, true);
        weapon.step(0.033, player);
      }
    }
    game.g.money = 2400;
    game.g.wins = 2;
    game.g.losses = 1;
    presentHud();
  } else if (name === 'bomb') {
    player.reset();
    const site = world.sites[0];
    game.plantBomb(bots.bots[0], 'A');
    player.state.position.set(site.center.x + 0.8, 0, site.center.z + 0.6);
    aimAt(new THREE.Vector3(site.center.x, 0.2, site.center.z));
    player.state.health = 80;
    game.g.money = 3100;
    game.g.wins = 3;
    game.g.losses = 2;
    game.g.bomb.defusing = true;
    game.g.bomb.defuseT = 2.1;
    presentHud();
  } else if (name === 'end') {
    player.reset();
    game.g.phase = 'end';
    game.endRound(true, 'The RAIDERS were eliminated.');
    hud.showOverlay('end');
    game.g.money = 5400;
    game.g.wins = 5;
    game.g.losses = 2;
    presentHud();
  }

  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    presentHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 3) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
hud.bindStart();
hud.showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
