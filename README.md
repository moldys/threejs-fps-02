# Kestrel Depot — a three.js tactical FPS

A round-based, Counter-Strike-style tactical first-person shooter built with three.js
0.187.0 for make.fun's **threejs-fps-02** bounty. Runs fully offline in desktop Chrome
from static files — no build step, no network.

Features:
- First-person controller: mouse look, WASD with acceleration/friction, crouch, jump, collision
- Weapons with recoil, spread, reload and ammunition; damage scales with hit location (headshots)
- Frag grenades with physics (gravity, bounce, fuse, radius damage)
- Objective rounds: plant/defuse the bomb at site A, round timer, win/loss states
- Bots that navigate routes, hold positions, react to sight/sound, buy weapons
- Economy: earn money per round, buy menu between rounds
- HUD: health, armor, ammo, money, round timer, score, killfeed, banners
- Synthesised WebAudio sound (gunfire, impacts, footsteps, bomb, UI)
- Single six-colour palette; procedural geometry; seeded PRNG for deterministic captures

## Run

```sh
python3 -m http.server 8080 --directory game
# open http://localhost:8080/index.html
```

Or, to generate `/output` for the grader:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/moldys/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/moldys/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
