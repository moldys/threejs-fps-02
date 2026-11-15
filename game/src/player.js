// The first-person controller. Movement uses acceleration and friction (no
// instant direction changes), a capsule approximated by an AABB against the
// world's colliders, standing and crouching stances, jumping, and recoil that
// decays so holding the trigger walks your aim up. The player is a full
// participant in the fixed-step simulation; it never moves in the render loop.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_H = 1.8;
const CROUCH_H = 1.2;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.05;
const GRAVITY = 20;
const JUMP_VEL = 6.2;
const ACCEL = 14;
const AIR_ACCEL = 2.2;
const FRICTION = 8;
const EPS = 0.001;

export function createPlayer(world) {
  const state = {
    position: new THREE.Vector3().copy(world.playerSpawn),
    velocity: new THREE.Vector3(),
    yaw: Math.PI, // facing +Z (north) when yaw = PI
    pitch: 0,
    stance: 1, // 1 standing .. 0 crouched
    eyeHeight: STAND_EYE,
    onGround: true,
    alive: true,
    health: 100,
    armor: 0,
    crouching: false,
    sprinting: false,
    kickPitch: 0,
    kickYaw: 0,
  };

  const _vel = new THREE.Vector3();
  const _box = { min: new THREE.Vector3(), max: new THREE.Vector3() };

  function bodyBox(out, centerY, height) {
    const hw = RADIUS;
    const hh = height / 2;
    out.min.set(state.position.x - hw, centerY - hh, state.position.z - hw);
    out.max.set(state.position.x + hw, centerY + hh, state.position.z + hw);
    return out;
  }

  // Move along one axis, resolving against every collider the box would meet.
  function collideAxis(axis, delta) {
    if (delta === 0) return 0;
    const height = state.onGround ? state.stance : Math.max(state.stance, 0.6);
    const centerY = state.position.y + height / 2;
    bodyBox(_box, centerY, height);
    const lo = _box.min;
    const hi = _box.max;
    const colliders = world.colliders;
    let remaining = delta;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      // Overlap test in the two other axes.
      if (axis !== 0 && (hi.x <= c.min.x || lo.x >= c.max.x)) continue;
      if (axis !== 1 && (hi.y <= c.min.y || lo.y >= c.max.y)) continue;
      if (axis !== 2 && (hi.z <= c.min.z || lo.z >= c.max.z)) continue;
      if (axis === 0) {
        if (remaining > 0 && hi.x > c.min.x && hi.x - remaining <= c.min.x) {
          if (hi.x > c.min.x + EPS && lo.x < c.max.x) remaining = c.min.x - hi.x;
        } else if (remaining < 0 && lo.x < c.max.x && lo.x - remaining >= c.max.x) {
          if (lo.x < c.max.x - EPS && hi.x > c.min.x) remaining = c.max.x - lo.x;
        }
      } else if (axis === 1) {
        if (remaining > 0 && hi.y > c.min.y && hi.y - remaining <= c.min.y) {
          if (hi.y > c.min.y + EPS && lo.y < c.max.y) remaining = c.min.y - hi.y;
        } else if (remaining < 0 && lo.y < c.max.y && lo.y - remaining >= c.max.y) {
          if (lo.y < c.max.y - EPS && hi.y > c.min.y) remaining = c.max.y - lo.y;
        }
      } else {
        if (remaining > 0 && hi.z > c.min.z && hi.z - remaining <= c.min.z) {
          if (hi.z > c.min.z + EPS && lo.z < c.max.z) remaining = c.min.z - hi.z;
        } else if (remaining < 0 && lo.z < c.max.z && lo.z - remaining >= c.max.z) {
          if (lo.z < c.max.z - EPS && hi.z > c.min.z) remaining = c.max.z - lo.z;
        }
      }
    }
    return remaining;
  }

  function step(dt, controls) {
    if (!state.alive) return;
    const keys = controls.keys;

    // Stance transitions.
    state.crouching = keys.has('ControlLeft') || keys.has('ControlRight');
    const wantStance = state.crouching ? 0 : 1;
    const stanceRate = state.crouching ? 10 : 7;
    state.stance += (wantStance - state.stance) * Math.min(1, stanceRate * dt);
    if (state.stance < 0.01) state.stance = 0;
    if (state.stance > 0.99) state.stance = 1;

    // Wish direction from the keys, rotated by yaw.
    let fwd = 0;
    let strafe = 0;
    if (keys.has('KeyW')) fwd += 1;
    if (keys.has('KeyS')) fwd -= 1;
    if (keys.has('KeyD')) strafe += 1;
    if (keys.has('KeyA')) strafe -= 1;
    const len = Math.hypot(fwd, strafe);
    if (len > 0) {
      fwd /= len;
      strafe /= len;
    }
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    _vel.set(
      strafe * cos - fwd * sin,
      0,
      strafe * sin + fwd * cos
    );
    state.sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const maxSpeed = state.crouching ? 1.9 : state.sprinting ? 5.4 : 4.0;
    const accel = state.onGround ? ACCEL : AIR_ACCEL;
    const target = _vel.multiplyScalar(maxSpeed);
    const dvx = target.x - state.velocity.x;
    const dvz = target.z - state.velocity.z;
    const dvl = Math.hypot(dvx, dvz);
    if (dvl > 0) {
      const acc = Math.min(accel * dt * maxSpeed, dvl);
      state.velocity.x += (dvx / dvl) * acc;
      state.velocity.z += (dvz / dvl) * acc;
    }

    // Friction on the ground when there is no wish direction.
    if (state.onGround && len === 0) {
      const spd = Math.hypot(state.velocity.x, state.velocity.z);
      if (spd > 0) {
        const drop = spd * FRICTION * dt;
        const scale = Math.max(0, spd - drop) / spd;
        state.velocity.x *= scale;
        state.velocity.z *= scale;
      }
    }

    // Jump.
    if (state.onGround && keys.has('Space')) {
      state.velocity.y = JUMP_VEL;
      state.onGround = false;
    }

    // Gravity.
    state.velocity.y -= GRAVITY * dt;

    // Integrate and collide, axis by axis.
    const dx = state.velocity.x * dt;
    const dy = state.velocity.y * dt;
    const dz = state.velocity.z * dt;
    state.position.x += collideAxis(0, dx);
    state.position.z += collideAxis(2, dz);

    const prevY = state.position.y;
    state.position.y += collideAxis(1, dy);
    if (state.position.y <= 0 && state.velocity.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (state.position.y > 0) {
      // If we hit a ceiling (delta clamped), kill upward velocity.
      if (state.velocity.y > 0 && state.position.y <= prevY + EPS) {
        state.velocity.y = 0;
      }
      state.onGround = Math.abs(state.position.y - prevY) < EPS && dy <= 0;
    }

    // Standing up requires headroom at full height.
    if (!state.crouching && state.stance > 0.6) {
      const h = STAND_H;
      const cy = state.position.y + h / 2;
      bodyBox(_box, cy, h);
      for (let i = 0; i < world.colliders.length; i += 1) {
        const c = world.colliders[i];
        if (_box.min.x < c.max.x && _box.max.x > c.min.x &&
            _box.min.y < c.max.y && _box.max.y > c.min.y &&
            _box.min.z < c.max.z && _box.max.z > c.min.z) {
          state.stance = Math.min(state.stance, 0.6);
          break;
        }
      }
    }

    state.eyeHeight = CROUCH_EYE + (STAND_EYE - CROUCH_EYE) * state.stance;
  }

  function look(dx, dy) {
    const sens = 0.0022;
    state.yaw -= dx * sens;
    state.pitch -= dy * sens;
    const limit = 1.5;
    if (state.pitch > limit) state.pitch = limit;
    if (state.pitch < -limit) state.pitch = -limit;
  }

  // Recoil: add a kick; it decays back over time in step.
  function applyRecoil(pitchKick, yawKick) {
    state.kickPitch += pitchKick;
    state.kickYaw += yawKick;
  }

  function settleRecoil(dt) {
    const rate = 14;
    const f = Math.max(0, 1 - rate * dt);
    state.kickPitch *= f;
    state.kickYaw *= f;
    if (Math.abs(state.kickPitch) < 0.0001) state.kickPitch = 0;
    if (Math.abs(state.kickYaw) < 0.0001) state.kickYaw = 0;
  }

  function eyePosition(out) {
    out.set(state.position.x, state.position.y + state.eyeHeight + state.kickPitch * 0.0, state.position.z);
    return out;
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function damage(amount) {
    if (!state.alive) return;
    let hp = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, hp * 0.5);
      state.armor -= absorbed;
      hp -= absorbed;
    }
    state.health -= hp;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
  }

  function reset(pos = world.playerSpawn) {
    state.position.copy(pos);
    state.velocity.set(0, 0, 0);
    state.yaw = Math.PI;
    state.pitch = 0;
    state.stance = 1;
    state.eyeHeight = STAND_EYE;
    state.onGround = true;
    state.alive = true;
    state.health = 100;
    state.armor = 0;
    state.kickPitch = 0;
    state.kickYaw = 0;
  }

  return {
    state,
    step,
    look,
    applyRecoil,
    settleRecoil,
    eyePosition,
    groundSpeed,
    damage,
    reset,
  };
}
