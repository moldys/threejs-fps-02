// The RAIDERS. Each bot is a small state machine: it advances along a route to
// its target site, holds a position, reacts to what it sees (a vision cone and
// a line-of-sight check) and hears (gunfire draws it), fights with aimed
// bursts that spread the less it stops, and plants the core at the site. Bots
// use the same colliders as the player, so they cannot walk through the map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.34;
const EYE = 1.55;
const VIEW_RANGE = 26;
const VIEW_FOV = 1.9; // radians, full cone half-angle
const HEAR_RANGE = 22;
const BOT_HEALTH = 100;
const BODY_HEIGHT = 1.7;

export function createBots(scene, world, ctx) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  const _fwd = new THREE.Vector3();
  const _toPlayer = new THREE.Vector3();

  function buildMesh() {
    const group = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0xc04a3d, roughness: 0.8, emissive: 0x3a0e08, emissiveIntensity: 0.3 });
    const clothDark = new THREE.MeshStandardMaterial({ color: 0x8a3028, roughness: 0.85, emissive: 0x2a0a06, emissiveIntensity: 0.25 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8b096, roughness: 0.7 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x131a26, roughness: 0.3, metalness: 0.5 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.75, 10), cloth);
    torso.position.y = 0.95;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skin);
    head.position.y = 1.55;
    group.add(head);
    const visorM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), visor);
    visorM.position.set(0, 1.57, 0.16);
    group.add(visorM);
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.3, 10), clothDark);
    pelvis.position.y = 0.42;
    group.add(pelvis);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), clothDark);
    legL.position.set(-0.12, 0.28, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.12;
    group.add(legR);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), cloth);
    armL.position.set(-0.33, 0.9, 0);
    group.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.33;
    group.add(armR);

    const headBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    headBox.setFromObject(head);
    const bodyBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    bodyBox.setFromObject(torso);

    return { group, head, torso, headBox, bodyBox };
  }

  function collideAxis(bot, axis, delta) {
    if (delta === 0) return 0;
    const lo = bot.min;
    const hi = bot.max;
    let remaining = delta;
    const colliders = world.colliders;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (axis !== 0 && (hi.x <= c.min.x || lo.x >= c.max.x)) continue;
      if (axis !== 2 && (hi.z <= c.min.z || lo.z >= c.max.z)) continue;
      if (axis === 0) {
        if (remaining > 0 && hi.x > c.min.x && hi.x - remaining <= c.min.x) {
          if (hi.x > c.min.x + 0.001 && lo.x < c.max.x) remaining = c.min.x - hi.x;
        } else if (remaining < 0 && lo.x < c.max.x && lo.x - remaining >= c.max.x) {
          if (lo.x < c.max.x - 0.001 && hi.x > c.min.x) remaining = c.max.x - lo.x;
        }
      } else {
        if (remaining > 0 && hi.z > c.min.z && hi.z - remaining <= c.min.z) {
          if (hi.z > c.min.z + 0.001 && lo.z < c.max.z) remaining = c.min.z - hi.z;
        } else if (remaining < 0 && lo.z < c.max.z && lo.z - remaining >= c.max.z) {
          if (lo.z < c.max.z - 0.001 && hi.z > c.min.z) remaining = c.max.z - lo.z;
        }
      }
    }
    return remaining;
  }

  function setBox(bot) {
    bot.min.set(bot.pos.x - RADIUS, 0, bot.pos.z - RADIUS);
    bot.max.set(bot.pos.x + RADIUS, BODY_HEIGHT, bot.pos.z + RADIUS);
  }

  function canSeePlayer(bot) {
    const p = ctx.player;
    if (!p.state.alive) return false;
    _toPlayer.set(p.state.position.x, p.state.position.y + p.state.eyeHeight, p.state.position.z)
      .sub(bot.eye);
    const dist = _toPlayer.length();
    if (dist > VIEW_RANGE) return false;
    const fwdAngle = Math.atan2(Math.sin(bot.yaw), Math.cos(bot.yaw));
    const toAngle = Math.atan2(_toPlayer.x, _toPlayer.z);
    let diff = toAngle - fwdAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > VIEW_FOV) return false;
    raycaster.set(bot.eye, _toPlayer.clone().normalize());
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function hearShot(origin) {
    for (let i = 0; i < bots.length; i += 1) {
      const b = bots[i];
      if (!b.alive) continue;
      const d = b.pos.distanceTo(origin);
      if (d < HEAR_RANGE) {
        b.heardPos.copy(origin);
        b.hearT = 4;
      }
    }
  }

  function spawn(index, routeKey, routeIndex) {
    const start = world.botSpawns[index % world.botSpawns.length].clone();
    const mesh = buildMesh();
    scene.add(mesh.group);
    const bot = {
      index,
      pos: start.clone(),
      vel: new THREE.Vector3(),
      yaw: 0,
      eye: new THREE.Vector3(),
      min: new THREE.Vector3(),
      max: new THREE.Vector3(),
      mesh,
      alive: true,
      health: BOT_HEALTH,
      state: 'advance',
      routeKey,
      routeIndex,
      wp: 0,
      targetSite: routeKey,
      seeing: false,
      seenT: 0,
      lastSeen: new THREE.Vector3(),
      heardPos: new THREE.Vector3(),
      hearT: 0,
      aimError: 0.25,
      burstLeft: 0,
      burstDelay: 0,
      reloading: false,
      reloadT: 0,
      mag: 30,
      weapon: index % 3 === 0 ? 'rifle' : 'smg',
      fireInterval: index % 3 === 0 ? 0.105 : 0.09,
      damage: index % 3 === 0 ? 30 : 22,
      strafeDir: 1,
      strafeT: 0,
      plantT: 0,
      footT: 0,
    };
    bot.eye.set(bot.pos.x, EYE, bot.pos.z);
    setBox(bot);
    mesh.group.position.copy(bot.pos);
    mesh.group.rotation.y = bot.yaw;
    bots.push(bot);
    return bot;
  }

  function resetAll(roundIndex) {
    for (let i = 0; i < bots.length; i += 1) {
      const b = bots[i];
      scene.remove(b.mesh.group);
    }
    bots.length = 0;
    const siteKey = roundIndex % 2 === 0 ? 'A' : 'B';
    const count = 3;
    for (let i = 0; i < count; i += 1) {
      const routeList = world.routes[siteKey];
      const routeIndex = (roundIndex + i) % routeList.length;
      const b = spawn(i, siteKey, routeIndex);
      b.targetSite = siteKey;
    }
  }

  function step(dt) {
    const p = ctx.player;
    for (let i = bots.length - 1; i >= 0; i -= 1) {
      const b = bots[i];
      if (!b.alive) continue;
      b.eye.set(b.pos.x, EYE, b.pos.z);
      if (b.frozen) {
        b.vel.set(0, 0, 0);
        setBox(b);
        b.mesh.group.position.copy(b.pos);
        b.mesh.group.rotation.y = b.yaw;
        continue;
      }
      b.seenT = b.seeing ? b.seenT + dt : 0;
      b.hearT -= dt;
      if (b.hearT < 0) b.hearT = 0;

      const sees = canSeePlayer(b);
      b.seeing = sees;
      if (sees) b.lastSeen.copy(p.state.position);

      if (b.state === 'plant') {
        b.plantT += dt;
        if (sees) {
          // Interrupted: fight back.
          b.state = 'engage';
          b.plantT = 0;
        } else if (b.plantT >= 3) {
          if (ctx.hooks.onBotPlant) ctx.hooks.onBotPlant(b, b.targetSite);
          b.plantT = 0;
        }
        b.vel.set(0, 0, 0);
      } else if (sees) {
        b.state = 'engage';
        engage(b, dt);
      } else if (b.hearT > 0 && b.state !== 'engage') {
        // Investigate the sound.
        moveToward(b, b.heardPos, 3.4, dt);
        if (b.pos.distanceTo(b.heardPos) < 1.5) b.hearT = 0;
        idleFacing(b, dt);
      } else if (b.state === 'engage') {
        // Lost sight: push to last seen, then fall back to the route.
        if (b.seenT > 2.5 || !p.state.alive) {
          b.state = 'advance';
          b.seenT = 0;
        } else {
          moveToward(b, b.lastSeen, 3.6, dt);
        }
      } else {
        advance(b, dt);
      }

      // Integrate and collide.
      if (b.state !== 'plant') {
        const px = b.pos.x;
        const pz = b.pos.z;
        b.pos.x += collideAxis(b, 0, b.vel.x * dt);
        b.pos.z += collideAxis(b, 2, b.vel.z * dt);
        // If we barely moved but wanted to, slip sideways around the obstacle.
        const expected = Math.hypot(b.vel.x * dt, b.vel.z * dt);
        const moved = Math.hypot(b.pos.x - px, b.pos.z - pz);
        if (expected > 0.03 && moved < expected * 0.45) {
          b.slipT = 0.55;
          b.slipDir = Math.random() < 0.5 ? 1 : -1;
        }
        b.pos.y = 0;
      }
      setBox(b);
      b.mesh.group.position.copy(b.pos);
      b.mesh.group.rotation.y = b.yaw;

      // Footsteps.
      b.footT -= dt;
      if (b.footT <= 0 && (b.vel.x !== 0 || b.vel.z !== 0) && b.state !== 'plant') {
        b.footT = 0.45;
        if (ctx.hooks.onBotStep) ctx.hooks.onBotStep(b);
      }
      animateLimb(b, dt);
    }

    // Keep bots from stacking on each other.
    for (let i = 0; i < bots.length; i += 1) {
      for (let j = i + 1; j < bots.length; j += 1) {
        const a = bots[i];
        const c = bots[j];
        if (!a.alive || !c.alive) continue;
        const dx = c.pos.x - a.pos.x;
        const dz = c.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 0.85) {
          const push = (0.85 - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          a.pos.x -= ux * push;
          a.pos.z -= uz * push;
          c.pos.x += ux * push;
          c.pos.z += uz * push;
        }
      }
    }
  }

  function advance(b, dt) {
    const route = world.routes[b.routeKey][b.routeIndex];
    if (!route || b.wp >= route.length) {
      // Reached the end: if near the site, plant; else hold.
      const site = world.sites.find((s) => s.key === b.targetSite);
      if (site && b.pos.distanceTo(site.center) < site.radius + 2) {
        b.state = 'plant';
        b.plantT = 0;
      } else {
        moveToward(b, route[route.length - 1], 2.8, dt);
      }
      idleFacing(b, dt);
      return;
    }
    const target = route[b.wp];
    const dist = b.pos.distanceTo(target);
    if (dist < 0.9) {
      b.wp += 1;
      return;
    }
    moveToward(b, target, 3.2, dt);
    if (b.hearT > 0 && ctx.player.state.alive) {
      // Occasionally pause to listen.
    }
  }

  function moveToward(b, target, speed, dt) {
    _fwd.set(target.x - b.pos.x, 0, target.z - b.pos.z);
    const len = _fwd.length();
    if (len < 0.05) {
      b.vel.set(0, 0, 0);
      return;
    }
    _fwd.divideScalar(len);
    b.vel.x = _fwd.x * speed;
    b.vel.z = _fwd.z * speed;
    if (b.slipT > 0) {
    b.slipT -= dt;
    const perpX = Math.cos(b.yaw);
    const perpZ = -Math.sin(b.yaw);
    b.vel.x += perpX * b.slipDir * 2.1;
    b.vel.z += perpZ * b.slipDir * 2.1;
    }
    const targetYaw = Math.atan2(_fwd.x, _fwd.z);
    let diff = targetYaw - b.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.yaw += diff * Math.min(1, 10 * dt);
  }

  function idleFacing(b, dt) {
    const p = ctx.player;
    if (p.state.alive) {
      const dx = p.state.position.x - b.pos.x;
      const dz = p.state.position.z - b.pos.z;
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - b.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      b.yaw += diff * Math.min(1, 6 * dt);
    }
  }

  function engage(b, dt) {
    const p = ctx.player;
    if (!p.state.alive) return;
    // Face the player; aiming error shrinks while we stay put.
    const dx = p.state.position.x - b.pos.x;
    const dz = p.state.position.z - b.pos.z;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - b.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.yaw += diff * Math.min(1, 8 * dt);
    b.aimError = Math.max(0.015, b.aimError - dt * 0.05);

    // Strafe while engaged.
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = 1.2 + Math.random() * 1.4;
      b.strafeDir *= Math.random() < 0.6 ? -1 : 1;
    }
    const strafeSpeed = 2.3;
    const perp = { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) };
    b.vel.x = perp.x * b.strafeDir * strafeSpeed;
    b.vel.z = perp.z * b.strafeDir * strafeSpeed;

    // Fire bursts.
    if (b.reloading) {
      b.reloadT -= dt;
      b.vel.multiplyScalar(0.5);
      if (b.reloadT <= 0) {
        b.reloading = false;
        b.mag = 30;
      }
      return;
    }
    if (b.burstLeft > 0) {
      b.burstDelay -= dt;
      if (b.burstDelay <= 0) {
        b.burstLeft -= 1;
        b.burstDelay = b.fireInterval;
        // Aim error grows with movement.
        const speed = Math.hypot(b.vel.x, b.vel.z);
        const movePenalty = Math.min(0.05, speed * 0.012);
        const error = b.aimError + movePenalty;
        const dir = fireDir(b, error);
        if (ctx.hooks.onBotFire) ctx.hooks.onBotFire(b, dir.origin, dir.dir);
        b.mag -= 1;
        if (b.mag <= 0) {
          b.reloading = true;
          b.reloadT = 1.8;
          b.burstLeft = 0;
        }
      }
    } else {
      b.burstDelay = 0.5 + Math.random() * 0.5;
      b.burstLeft = 3 + Math.floor(Math.random() * 4);
    }
  }

  function fireDir(b, error) {
    const p = ctx.player;
    const origin = b.eye.clone();
    const target = new THREE.Vector3(p.state.position.x, p.state.position.y + p.state.eyeHeight, p.state.position.z);
    const dir = target.sub(origin).normalize();
    // Add spherical error.
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - u * u - v * v)) || 0;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    dir.addScaledVector(right, u * error);
    dir.addScaledVector(up, v * error);
    dir.normalize();
    return { origin, dir };
  }

  function animateLimb(b, dt) {
    const speed = Math.hypot(b.vel.x, b.vel.z);
    if (speed < 0.1) return;
    b.swing = (b.swing || 0) + dt * (6 + speed * 1.4);
    const s = Math.sin(b.swing) * 0.35;
    const legL = b.mesh.group.children.find((c) => Math.abs(c.position.x + 0.12) < 0.02);
    const legR = b.mesh.group.children.find((c) => Math.abs(c.position.x - 0.12) < 0.02);
    if (legL && legR) {
      legL.rotation.x = s;
      legR.rotation.x = -s;
    }
    const armL = b.mesh.group.children.find((c) => Math.abs(c.position.x + 0.33) < 0.02);
    const armR = b.mesh.group.children.find((c) => Math.abs(c.position.x - 0.33) < 0.02);
    if (armL && armR) {
      armL.rotation.x = -s * 0.7;
      armR.rotation.x = s * 0.7;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.vel.set(0, 0, 0);
      // Tumble: rotate the body.
      bot.mesh.group.rotation.z = Math.PI / 2;
      bot.mesh.group.position.y = -0.6;
    }
  }

  function collectShootables() {
    const list = [];
    for (let i = 0; i < bots.length; i += 1) {
      const b = bots[i];
      if (!b.alive) continue;
      b.mesh.head.userData = { bot: b, part: 'head' };
      b.mesh.torso.userData = { bot: b, part: 'body' };
      list.push(b.mesh.head, b.mesh.torso);
    }
    return list;
  }

  return {
    bots,
    spawn,
    resetAll,
    step,
    hearShot,
    damage,
    collectShootables,
  };
}
