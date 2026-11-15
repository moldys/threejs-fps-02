// The map: an original industrial depot, "KESTREL DEPOT". A long mid-wall
// splits the ground into two halves, and three lanes (west, mid, east) cross
// it through gaps. Two bomb sites sit flanking the north half; the RAIDERS
// spawn north, the player's ECHO SQUAD spawns south. All geometry is built
// from boxes here, so the map, its cover and its collision data come from one
// place. Bullets hit every opaque mesh (shootables); the player and the bots
// move against the AABB colliders.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const H = 4.5; // wall height
const T = 0.6; // wall thickness

export function createWorld(scene) {
  const colliders = [];
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);

  const mat = {
    wall: new THREE.MeshStandardMaterial({ color: 0x2c3a50, roughness: 0.92 }),
    wallDark: new THREE.MeshStandardMaterial({ color: 0x242f42, roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x333f56, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x3d4a63, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.85 }),
    crateDark: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x455871, roughness: 0.55, metalness: 0.7 }),
    metalLight: new THREE.MeshStandardMaterial({ color: 0x5a7190, roughness: 0.5, metalness: 0.75 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x59483a, roughness: 0.6, metalness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xb08536, roughness: 0.7, emissive: 0x5c3a12, emissiveIntensity: 0.35 }),
    accentA: new THREE.MeshStandardMaterial({ color: 0xe05a4e, roughness: 0.6, emissive: 0x7a1a12, emissiveIntensity: 0.6 }),
    accentB: new THREE.MeshStandardMaterial({ color: 0x5aa9e6, roughness: 0.6, emissive: 0x123a5c, emissiveIntensity: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf2b53c, roughness: 0.5, emissive: 0xf2b53c, emissiveIntensity: 1.2 }),
  };

  // A solid box: mesh + collider + shootable.
  function solid(px, py, pz, w, h, d, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noSolid) {
      const hw = w / 2;
      const hh = h / 2;
      const hd = d / 2;
      colliders.push({
        min: new THREE.Vector3(px - hw, py - hh, pz - hd),
        max: new THREE.Vector3(px + hw, py + hh, pz + hd),
      });
    }
    shootables.push(mesh);
    return mesh;
  }

  // A thin decorative plate (no collision).
  function plate(px, py, pz, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py, pz);
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  // ---- Ground -------------------------------------------------------------
  solid(0, -0.25, 0, 78, 0.5, 58, mat.floor, { noSolid: true });

  // ---- Outer walls --------------------------------------------------------
  solid(0, H / 2, -27.7, 78, H, T, mat.wall); // south
  solid(0, H / 2, 27.7, 78, H, T, mat.wall); // north
  solid(-37.7, H / 2, 0, T, H, 56, mat.wall); // west
  solid(37.7, H / 2, 0, T, H, 56, mat.wall); // east

  // ---- Mid-wall, split into segments around the three gaps ----------------
  const midWall = (x1, x2) => {
    const w = x2 - x1;
    solid((x1 + x2) / 2, H / 2, 0, w, H, T, mat.wallDark);
  };
  midWall(-38, -22.25); // west of west gap (gap spans -22.25..-17.75)
  midWall(-17.75, -2.75); // between west gap and mid gap (mid gap -2.75..2.75)
  midWall(2.75, 17.75);
  midWall(22.25, 38);

  // ---- Site A east wall (with a door at z=8) ------------------------------
  solid(-14, H / 2, 3, T, H, 6, mat.wallDark); // z 0..6
  solid(-14, H / 2, 13, T, H, 6, mat.wallDark); // z 10..16
  // ---- Site A north wall --------------------------------------------------
  solid(-26, H / 2, 16, 24, H, T, mat.wallDark); // x -38..-14
  // ---- Site B west wall (door at z=8) ------------------------------------
  solid(14, H / 2, 3, T, H, 6, mat.wallDark);
  solid(14, H / 2, 13, T, H, 6, mat.wallDark);
  // ---- Site B north wall --------------------------------------------------
  solid(26, H / 2, 16, 24, H, T, mat.wallDark);

  // ---- Attacker spawn room (north-center) with three exits ------------------
  // South wall at z=20: gaps at x -11..-8 (left), -3..3 (centre), 8..11 (right).
  solid(-5.5, H / 2, 20, 5, H, T, mat.wallDark); // x -8..-3
  solid(5.5, H / 2, 20, 5, H, T, mat.wallDark); // x 3..8
  // ---- Defender spawn room (south-center) with three exits -----------------
  // North wall at z=-20: same gap pattern.
  solid(-5.5, H / 2, -20, 5, H, T, mat.wallDark);
  solid(5.5, H / 2, -20, 5, H, T, mat.wallDark);

  // ---- Corridor guide walls (west and east) -------------------------------
  // West corridor: between x -24 and -16; add inner edge wall at x=-16 on the
  // south half so the corridor reads as a lane.
  solid(-16, H / 2, -10, T, H, 20, mat.wallDark); // z -20..0
  // East corridor mirror.
  solid(16, H / 2, -10, T, H, 20, mat.wallDark);

  // ---- Cover: crates, containers, barrels, pillars ------------------------
  const crate = (x, z, s, m = mat.crate) => solid(x, s / 2, z, s, s, s, m);
  const tallCrate = (x, z, w, d, h, m = mat.crateDark) => solid(x, h / 2, z, w, h, d, m);
  const pillar = (x, z, r = 0.7) => solid(x, H / 2, z, r * 2, H, r * 2, mat.concrete);
  const barrel = (x, z) => solid(x, 0.55, z, 0.9, 1.1, 0.9, mat.metal, { shadow: true });

  // Mid lane cover.
  crate(3.4, 14, 1.2, mat.crateDark);
  crate(-3.4, 14, 1.2, mat.crateDark);
  crate(3.4, 8, 1.2);
  crate(-3.4, 8, 1.2, mat.crateDark);
  crate(0, 4.5, 1.4, mat.crateDark);
  tallCrate(-3.4, -6, 1.6, 1.2, 0.8, mat.crate);
  tallCrate(3.4, -6, 1.6, 1.2, 0.8, mat.crate);
  crate(0, -12, 1.2, mat.crateDark);
  pillar(3.4, 2, 0.7);
  pillar(-3.4, 2, 0.7);
  barrel(0, -7);
  barrel(0, 11);

  // West corridor cover.
  crate(-20, -16, 1.3, mat.crateDark);
  tallCrate(-20, -8, 1.1, 2.4, 1.0, mat.crate);
  crate(-20, -4, 1.3);
  tallCrate(-21.5, 6, 1.2, 1.8, 0.9, mat.crateDark);
  crate(-18.5, 10, 1.2, mat.crate);

  // East corridor cover.
  crate(20, -16, 1.3, mat.crate);
  tallCrate(20, -8, 1.1, 2.4, 1.0, mat.crateDark);
  crate(20, -4, 1.3, mat.crateDark);
  tallCrate(21.5, 6, 1.2, 1.8, 0.9, mat.crate);
  crate(18.5, 10, 1.2, mat.crateDark);

  // Site A cover.
  tallCrate(-30, 12, 2.6, 1.2, 1.6, mat.crate);
  tallCrate(-24, 12, 1.2, 2.6, 1.6, mat.crateDark);
  crate(-30, 4, 1.3, mat.crateDark);
  crate(-24, 3, 1.3, mat.crate);
  tallCrate(-34, 8, 1.0, 1.0, 1.9, mat.metal); // tall container
  barrel(-27, 12);
  pillar(-27, 5, 0.6);

  // Site B cover.
  tallCrate(30, 12, 2.6, 1.2, 1.6, mat.crateDark);
  tallCrate(24, 12, 1.2, 2.6, 1.6, mat.crate);
  crate(30, 4, 1.3, mat.crate);
  crate(24, 3, 1.3, mat.crateDark);
  tallCrate(34, 8, 1.0, 1.0, 1.9, mat.metal);
  barrel(27, 12);
  pillar(27, 5, 0.6);

  // Center plaza cover (between mid lane and the site doors).
  crate(6, 6, 1.2, mat.crate);
  crate(-6, 6, 1.2, mat.crateDark);
  tallCrate(10, 6, 1.4, 1.4, 0.9, mat.crateDark);
  tallCrate(-10, 6, 1.4, 1.4, 0.9, mat.crate);

  // ---- Decorative plates ---------------------------------------------------
  // Hazard stripes on the site door thresholds.
  plate(-20, 0.06, 0, 4.5, 0.12, 0.8, mat.hazard);
  plate(20, 0.06, 0, 4.5, 0.12, 0.8, mat.hazard);
  // Team accent plates near spawns.
  plate(-5, 0.06, -24, 10, 0.1, 0.5, mat.accentB);
  plate(-5, 0.06, 24, 10, 0.1, 0.5, mat.accentA);
  // Emissive light strips on the mid wall.
  plate(0, H - 0.5, 0.35, 5.5, 0.18, 0.05, mat.glow);
  plate(-20, H - 0.5, 0.35, 4.5, 0.18, 0.05, mat.glow);
  plate(20, H - 0.5, 0.35, 4.5, 0.18, 0.05, mat.glow);
  // Overhead pipes along the corridors.
  pipeRun(-22, 3.1, -20, 40, 0.35, 0.35);
  pipeRun(22, 3.1, -20, 40, 0.35, 0.35);
  function pipeRun(px, py, pz, len, r, r2) {
    const amt = Math.max(1, Math.round(len / 5));
    for (let i = 0; i < amt; i += 1) {
      plate(px, py, pz - len / 2 + 5 * i + 2.5, r2, r, 4.6, mat.pipe);
    }
  }

  // ---- Lights --------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x3a4458, 1.35);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x93a8cc, 0x181e2c, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4d8, 1.4);
  moon.position.set(24, 30, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -44;
  moon.shadow.camera.right = 44;
  moon.shadow.camera.top = 44;
  moon.shadow.camera.bottom = -44;
  moon.shadow.camera.far = 80;
  scene.add(moon);
  const warm = new THREE.PointLight(0xf2b53c, 2.2, 34, 1.8);
  warm.position.set(0, 5.4, 4);
  scene.add(warm);
  const cool = new THREE.PointLight(0x5aa9e6, 1.6, 30, 1.8);
  cool.position.set(-26, 4.2, 8);
  scene.add(cool);
  const coolB = new THREE.PointLight(0xe05a4e, 1.6, 30, 1.8);
  coolB.position.set(26, 4.2, 8);
  scene.add(coolB);
  const fill = new THREE.PointLight(0x9fb4d8, 1.2, 40, 2);
  fill.position.set(0, 6, -10);
  scene.add(fill);

  // ---- Spawns, routes, sites ----------------------------------------------
  const playerSpawn = new THREE.Vector3(0, 0, -23.2);
  const botSpawns = [
    new THREE.Vector3(-8, 0, 24.2),
    new THREE.Vector3(0, 0, 24.6),
    new THREE.Vector3(8, 0, 24.2),
  ];

  // Route waypoints for the attackers. Each route runs from the north spawn to
  // a site and ends in a hold point there.
  const routes = {
    A: [
      [new THREE.Vector3(-8, 0, 22), new THREE.Vector3(-14.5, 0, 20), new THREE.Vector3(-20, 0, 16), new THREE.Vector3(-20, 0, 11), new THREE.Vector3(-25, 0, 8)],
      [new THREE.Vector3(-8, 0, 22), new THREE.Vector3(-14.5, 0, 20), new THREE.Vector3(-20, 0, 16), new THREE.Vector3(-24, 0, 12), new THREE.Vector3(-27, 0, 8)],
    ],
    B: [
      [new THREE.Vector3(8, 0, 22), new THREE.Vector3(14.5, 0, 20), new THREE.Vector3(20, 0, 16), new THREE.Vector3(20, 0, 11), new THREE.Vector3(25, 0, 8)],
      [new THREE.Vector3(8, 0, 22), new THREE.Vector3(14.5, 0, 20), new THREE.Vector3(20, 0, 16), new THREE.Vector3(24, 0, 12), new THREE.Vector3(27, 0, 8)],
    ],
  };

  const sites = [
    { key: 'A', center: new THREE.Vector3(-26, 0, 8), radius: 3.6 },
    { key: 'B', center: new THREE.Vector3(26, 0, 8), radius: 3.6 },
  ];

  return {
    colliders,
    shootables,
    playerSpawn,
    botSpawns,
    routes,
    sites,
    groundY: 0,
    mat,
  };
}
