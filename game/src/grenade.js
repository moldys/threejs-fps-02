// Frag grenades. A thrown grenade is a small physics object: gravity, bounce
// off the world's colliders with restitution, a fuse, and an explosion that
// the battle module resolves into radius damage. A small pool of meshes is
// reused so no geometry is allocated during play.
import * as THREE from 'three';

const GRAVITY = 20;
const RESTITUTION = 0.42;
const DAMPING = 0.998;
const RADIUS = 0.11;
const FUSE = 2.0;
const THROW_SPEED = 15;

export function createGrenades(scene, world, hooks) {
  const pool = [];
  const live = [];

  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3545, roughness: 0.5, metalness: 0.55 })
    );
    mesh.visible = false;
    scene.add(mesh);
    pool.push(mesh);
  }

  const _pos = new THREE.Vector3();
  const _next = new THREE.Vector3();
  const _min = new THREE.Vector3();
  const _max = new THREE.Vector3();

  function throwGrenade(origin, dir, power = THROW_SPEED) {
    const mesh = pool.pop();
    if (!mesh) return;
    const g = {
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(power),
      fuse: FUSE,
      active: true,
    };
    mesh.position.copy(origin);
    mesh.visible = true;
    live.push(g);
  }

  function step(dt) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      if (!g.active) {
        g.mesh.visible = false;
        pool.push(g.mesh);
        live.splice(i, 1);
        continue;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        g.active = false;
        if (hooks.onExplode) hooks.onExplode(g.pos);
        continue;
      }
      g.vel.y -= GRAVITY * dt;
      g.vel.multiplyScalar(DAMPING);
      _pos.copy(g.pos);
      _next.copy(g.pos).addScaledVector(g.vel, dt);

      let bounced = false;
      for (let c = 0; c < world.colliders.length; c += 1) {
        const col = world.colliders[c];
        _min.copy(col.min);
        _max.copy(col.max);
        // Nearest point on the box to the segment start.
        const nx = Math.max(_min.x, Math.min(_pos.x, _max.x));
        const ny = Math.max(_min.y, Math.min(_pos.y, _max.y));
        const nz = Math.max(_min.z, Math.min(_pos.z, _max.z));
        let dx = _pos.x - nx;
        let dy = _pos.y - ny;
        let dz = _pos.z - nz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < RADIUS * RADIUS && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          dz /= d;
          const vn = g.vel.x * dx + g.vel.y * dy + g.vel.z * dz;
          if (vn < 0) {
            g.vel.x -= (1 + RESTITUTION) * vn * dx;
            g.vel.y -= (1 + RESTITUTION) * vn * dy;
            g.vel.z -= (1 + RESTITUTION) * vn * dz;
            // Push out of the surface.
            g.pos.add(new THREE.Vector3(dx, dy, dz).multiplyScalar(RADIUS - Math.sqrt(d2)));
            bounced = true;
          }
        }
      }
      if (!bounced) g.pos.copy(_next);
      if (g.pos.y < RADIUS && g.vel.y < 0) {
        g.pos.y = RADIUS;
        g.vel.y *= -RESTITUTION;
        g.vel.x *= 0.9;
        g.vel.z *= 0.9;
      }
      g.mesh.position.copy(g.pos);
    }
  }

  return { throwGrenade, step };
}
