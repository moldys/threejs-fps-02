// All sound is synthesised in WebAudio: gunfire, impacts, footsteps, the bomb,
// the UI. There are no audio asset files, so the game has sound and still
// loads nothing over the network. The AudioContext is created on the first
// user gesture (browsers require it) and every quiet path simply no-ops.
export function createAudio() {
  let ctx = null;
  let master = null;

  function noiseBuffer(c) {
    const len = c.sampleRate * 0.5;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  const noiseStore = {};

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseStore.n = noiseBuffer(ctx);
    } catch {
      ctx = null;
    }
  }

  function out() {
    return master;
  }

  // A filtered noise burst with an envelope.
  function noise({ dur = 0.12, from = 2200, to = 400, vol = 0.5, type = 'lowpass' }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseStore.n;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(out());
    src.start(ctx.currentTime, Math.random() * 0.2, dur + 0.05);
    src.stop(ctx.currentTime + dur + 0.1);
  }

  function tone({ freq = 440, to = freq, dur = 0.1, vol = 0.3, type = 'square', delay = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const shots = {
    pistol: { dur: 0.1, from: 2600, to: 500, vol: 0.5 },
    deagle: { dur: 0.16, from: 1800, to: 300, vol: 0.7 },
    smg: { dur: 0.07, from: 3200, to: 600, vol: 0.4 },
    rifle: { dur: 0.09, from: 2800, to: 450, vol: 0.55 },
  };

  function play(name) {
    if (!ctx) return;
    switch (name) {
      case 'shot_pistol':
      case 'shot_deagle':
      case 'shot_smg':
      case 'shot_rifle': {
        const s = shots[name.slice(5)];
        noise({ dur: s.dur, from: s.from, to: s.to, vol: s.vol });
        noise({ dur: 0.03, from: 6000, to: 2000, vol: 0.2 });
        break;
      }
      case 'dry':
        tone({ freq: 220, to: 140, dur: 0.04, vol: 0.2, type: 'square' });
        break;
      case 'reload_start':
        tone({ freq: 500, to: 320, dur: 0.06, vol: 0.25, type: 'triangle' });
        break;
      case 'reload_end':
        tone({ freq: 700, to: 900, dur: 0.07, vol: 0.3, type: 'triangle', delay: 0.05 });
        break;
      case 'hit':
        tone({ freq: 1200, to: 1600, dur: 0.05, vol: 0.3, type: 'square' });
        break;
      case 'kill':
        tone({ freq: 900, to: 1400, dur: 0.12, vol: 0.35, type: 'square' });
        tone({ freq: 1400, to: 2000, dur: 0.1, vol: 0.25, type: 'square', delay: 0.1 });
        break;
      case 'hurt':
        noise({ dur: 0.18, from: 500, to: 120, vol: 0.5 });
        break;
      case 'footstep':
        noise({ dur: 0.06, from: 500, to: 220, vol: 0.12 });
        break;
      case 'jump':
        noise({ dur: 0.08, from: 400, to: 180, vol: 0.15 });
        break;
      case 'land':
        noise({ dur: 0.1, from: 350, to: 120, vol: 0.2 });
        break;
      case 'nade_throw':
        tone({ freq: 300, to: 200, dur: 0.1, vol: 0.3, type: 'triangle' });
        break;
      case 'explosion':
        noise({ dur: 0.8, from: 800, to: 60, vol: 0.9 });
        tone({ freq: 60, to: 30, dur: 0.7, vol: 0.6, type: 'sine' });
        break;
      case 'plant_start':
        tone({ freq: 400, to: 600, dur: 0.1, vol: 0.3, type: 'triangle' });
        break;
      case 'plant_done':
        tone({ freq: 600, to: 900, dur: 0.18, vol: 0.35, type: 'triangle' });
        break;
      case 'beep':
        tone({ freq: 1000, to: 1000, dur: 0.05, vol: 0.25, type: 'square' });
        break;
      case 'defuse_start':
        tone({ freq: 500, to: 700, dur: 0.12, vol: 0.3, type: 'triangle' });
        break;
      case 'buy_ok':
        tone({ freq: 800, to: 1100, dur: 0.08, vol: 0.3, type: 'triangle' });
        break;
      case 'buy_deny':
        tone({ freq: 200, to: 120, dur: 0.12, vol: 0.3, type: 'square' });
        break;
      case 'ui':
        tone({ freq: 1000, to: 1400, dur: 0.04, vol: 0.2, type: 'triangle' });
        break;
      case 'roundwin':
        tone({ freq: 523, to: 523, dur: 0.15, vol: 0.35, type: 'triangle' });
        tone({ freq: 659, to: 659, dur: 0.15, vol: 0.35, type: 'triangle', delay: 0.15 });
        tone({ freq: 784, to: 784, dur: 0.3, vol: 0.4, type: 'triangle', delay: 0.3 });
        break;
      case 'roundlose':
        tone({ freq: 392, to: 330, dur: 0.4, vol: 0.35, type: 'triangle' });
        break;
      default:
        break;
    }
  }

  return { unlock, play };
}
