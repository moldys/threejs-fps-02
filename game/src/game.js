// The match rules: rounds, two teams, money, a buy menu between rounds, and
// the objective — the RAIDERS bring a core to one of two sites, plant it, and
// it detonates; ECHO SQUAD (the player) stops them and defuses. A round ends
// when one team is eliminated, the bomb detonates, it is defused, or time runs
// out. One place owns the rules; the HUD and the main loop only read them.
import * as THREE from 'three';
import { WEAPONS, GRENADE } from './weapon.js';

const ROUND_TIME = 75;
const BOMB_TIME = 40;
const DEFUSE_TIME = 5;
const START_MONEY = 1200;
const KILL_REWARD = 300;
const WIN_BONUS = 2500;
const LOSE_BONUS = 1400;
const BUY_TIME = 15;

export function createGame(S) {
  const g = {
    round: 1,
    money: START_MONEY,
    wins: 0,
    losses: 0,
    phase: 'buy', // buy | live | end
    phaseT: 0,
    roundTime: ROUND_TIME,
    deadT: 0,
    bomb: {
      planted: false,
      site: null,
      timer: 0,
      defusing: false,
      defuseT: 0,
      core: null, // mesh
    },
    buyOpen: false,
    killfeed: [],
    outcome: null, // 'win' | 'lose'
    outcomeReason: '',
    ready: false,
  };

  function clock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function startRound() {
    g.roundTime = ROUND_TIME;
    g.deadT = 0;
    g.phase = 'live';
    g.phaseT = 0;
    g.bomb.planted = false;
    g.bomb.site = null;
    g.bomb.timer = 0;
    g.bomb.defusing = false;
    g.bomb.defuseT = 0;
    g.outcome = null;
    g.buyOpen = false;
    g.ready = false;

    S.player.reset();
    S.player.state.armor = g.armorBought || 0;
    S.weapon.resetForRound(g.primaryBought, g.nadesBought, g.armorBought);
    S.bots.resetAll(g.round - 1);
    S.audio.play('ui');
  }

  function endRound(win, reason) {
    if (g.phase === 'end') return;
    g.outcome = win ? 'win' : 'lose';
    g.outcomeReason = reason;
    g.phase = 'end';
    g.phaseT = 5;
    if (win) {
      g.wins += 1;
      g.money += WIN_BONUS;
      S.audio.play('roundwin');
    } else {
      g.losses += 1;
      g.money += LOSE_BONUS;
      S.audio.play('roundlose');
    }
    S.hud.banner(win ? 'ROUND WON' : 'ROUND LOST', reason);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function step(dt) {
    g.phaseT += dt;
    const p = S.player.state;

    if (g.phase === 'buy') {
      if (g.phaseT >= BUY_TIME) {
        startRound();
      }
      return;
    }

    if (g.phase === 'end') {
      if (g.phaseT >= 5) {
        g.round += 1;
        // Keep the spent loadout for the next buy phase; money persists.
        g.primaryBought = g.primaryBought || null;
        g.nadesBought = g.nadesBought || 0;
        g.phase = 'buy';
        g.phaseT = 0;
        g.buyOpen = true;
        S.hud.showBuy(true);
      }
      return;
    }

    // Live phase.
    g.roundTime -= dt;

    // Bomb logic.
    if (g.bomb.planted) {
      g.bomb.timer -= dt;
      // Tick beep near the end.
      if (g.bomb.timer < 10 && Math.ceil(g.bomb.timer) !== g.lastTick) {
        g.lastTick = Math.ceil(g.bomb.timer);
        S.audio.play('beep');
      }
      if (g.bomb.timer <= 0) {
        // Detonation.
        S.audio.play('explosion');
        if (p.alive && p.position.distanceTo(g.bomb.core.position) < 9) {
          S.player.damage(500);
        }
        endRound(false, 'The core detonated.');
        return;
      }
      // Defuse.
      const nearCore = p.alive && g.bomb.core && p.position.distanceTo(g.bomb.core.position) < 2.6;
      const wantDefuse = S.input.state.interact;
      if (wantDefuse && nearCore && !g.bomb.defusing) {
        g.bomb.defusing = true;
        g.bomb.defuseT = 0;
        S.audio.play('defuse_start');
      }
      if (g.bomb.defusing) {
        if (!wantDefuse || !nearCore) {
          g.bomb.defusing = false;
          g.bomb.defuseT = 0;
        } else {
          g.bomb.defuseT += dt;
          S.audio.play('beep');
          if (g.bomb.defuseT >= DEFUSE_TIME) {
            g.bomb.defusing = false;
            endRound(true, 'The core was defused.');
            return;
          }
        }
      }
    }

    // Win/lose checks.
    const botsAlive = S.bots.bots.filter((b) => b.alive).length;
    if (!p.alive) {
      g.deadT += dt;
      if (g.bomb.planted && g.bomb.timer <= 0) return;
      if (g.deadT > 6) {
        endRound(false, 'You were eliminated.');
        return;
      }
    } else if (botsAlive === 0) {
      endRound(true, 'The RAIDERS were eliminated.');
      return;
    }

    if (g.roundTime <= 0) {
      if (!g.bomb.planted) {
        endRound(true, 'The RAIDERS ran out of time.');
      } else {
        g.roundTime = 0.01; // keep ticking the bomb
      }
      return;
    }
  }

  function onKill(killer, victim, headshot, weaponName) {
    g.money += KILL_REWARD;
    const label = headshot ? ' (headshot)' : '';
    g.killfeed.unshift(`${killer} ▸ ${victim}${label} · ${weaponName}`);
    if (g.killfeed.length > 4) g.killfeed.pop();
    S.hud.killfeed(g.killfeed);
  }

  function buy(key) {
    const def = WEAPONS[key];
    if (def) {
      if (g.money < def.cost) {
        S.audio.play('buy_deny');
        return false;
      }
      g.money -= def.cost;
      g.primaryBought = key;
      S.weapon.buyPrimary(key);
      S.audio.play('buy_ok');
      return true;
    }
    if (key === GRENADE.key) {
      if (g.money < GRENADE.cost || g.nadesBought >= GRENADE.max) {
        S.audio.play('buy_deny');
        return false;
      }
      g.money -= GRENADE.cost;
      g.nadesBought += 1;
      S.weapon.buyNade();
      S.audio.play('buy_ok');
      return true;
    }
    if (key === 'armor') {
      if (g.money < 1000 || g.armorBought >= 100) {
        S.audio.play('buy_deny');
        return false;
      }
      g.money -= 1000;
      g.armorBought = 100;
      S.player.state.armor = 100;
      S.audio.play('buy_ok');
      return true;
    }
    return false;
  }

  function buyList() {
    return [
      { key: 'pistol', label: WEAPONS.pistol.name, cost: 0, owned: true },
      { key: 'deagle', label: WEAPONS.deagle.name, cost: WEAPONS.deagle.cost, owned: g.primaryBought === 'deagle' },
      { key: 'smg', label: WEAPONS.smg.name, cost: WEAPONS.smg.cost, owned: g.primaryBought === 'smg' },
      { key: 'rifle', label: WEAPONS.rifle.name, cost: WEAPONS.rifle.cost, owned: g.primaryBought === 'rifle' },
      { key: 'nade', label: 'HE Frag Grenade', cost: GRENADE.cost, owned: g.nadesBought >= GRENADE.max },
      { key: 'armor', label: 'Heavy Armor', cost: 1000, owned: g.armorBought >= 100 },
    ];
  }

  function plantBomb(bot, siteKey) {
    const site = S.world.sites.find((s) => s.key === siteKey);
    if (!site || g.bomb.planted) return;
    g.bomb.planted = true;
    g.bomb.site = siteKey;
    g.bomb.timer = BOMB_TIME;
    g.bomb.defusing = false;
    g.bomb.defuseT = 0;
    g.lastTick = -1;
    // A small glowing core mesh at the site.
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2b53c, emissive: 0xf2b53c, emissiveIntensity: 2 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.4), mat);
    core.position.set(site.center.x, 0.14, site.center.z);
    S.scene.add(core);
    g.bomb.core = core;
    S.audio.play('plant_done');
    S.hud.banner('THE CORE IS PLANTED', 'Defuse it at the site (E)');
  }

  function hudState() {
    return {
      money: g.money,
      wins: g.wins,
      losses: g.losses,
      round: g.round,
      phase: g.phase,
      phaseT: g.phaseT,
      roundTime: clock(g.roundTime),
      bombPlanted: g.bomb.planted,
      bombSite: g.bomb.site,
      bombTime: clock(g.bomb.timer),
      defusing: g.bomb.defusing,
      defuseT: g.bomb.defuseT,
      buyOpen: g.buyOpen,
    };
  }

  return {
    g,
    startRound,
    endRound,
    step,
    buy,
    buyList,
    onKill,
    plantBomb,
    hudState,
    clock,
  };
}
