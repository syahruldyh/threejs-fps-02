// audio.js — one job: every sound the game makes, synthesized with WebAudio.
// No audio files exist in the game, so nothing is fetched and nothing can
// fail to load: gunshots are filtered noise, beeps are oscillators, and the
// round stingers are two-note phrases.

export function createAudio() {
  let ctx = null, master = null;
  const ac = {
    ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.35;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    },
    noise(dur, filterFreq, gainVal, type = 'lowpass') {
      if (!ac.ensure()) return;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
      const g = ctx.createGain(); g.gain.value = gainVal;
      src.connect(f); f.connect(g); g.connect(master); src.start();
    },
    tone(freq, dur, gainVal, type = 'square', slideTo = 0) {
      if (!ac.ensure()) return;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainVal, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    },
    shot(kind) {
      if (kind === 'napier') { ac.noise(0.22, 900, 0.9); ac.tone(140, 0.12, 0.5, 'sawtooth', 60); }
      else if (kind === 'shiv') { ac.noise(0.09, 1600, 0.55); }
      else if (kind === 'wren') { ac.noise(0.12, 1200, 0.6); }
      else { ac.noise(0.14, 1100, 0.8); ac.tone(180, 0.08, 0.35, 'sawtooth', 70); }
    },
    dry() { ac.tone(1200, 0.03, 0.2, 'square'); },
    reload() { ac.tone(700, 0.04, 0.25, 'square'); setTimeout(() => ac.tone(500, 0.05, 0.25, 'square'), 160); },
    step() { ac.noise(0.05, 500, 0.12); },
    hit() { ac.tone(2400, 0.04, 0.3, 'sine'); },
    headshot() { ac.tone(3200, 0.05, 0.35, 'sine'); setTimeout(() => ac.tone(4000, 0.06, 0.3, 'sine'), 50); },
    flashSnd() { ac.tone(2800, 0.5, 0.25, 'sine', 1400); ac.noise(0.3, 4000, 0.2, 'highpass'); },
    kill() { ac.tone(1800, 0.06, 0.3, 'sine'); setTimeout(() => ac.tone(2400, 0.08, 0.3, 'sine'), 70); },
    hurt() { ac.noise(0.1, 400, 0.4); },
    plant() { ac.tone(880, 0.09, 0.35, 'square'); },
    bombBeep() { ac.tone(1200, 0.07, 0.3, 'square'); },
    explosion() { ac.noise(0.7, 300, 1.0); ac.tone(90, 0.5, 0.7, 'sine', 35); },
    throwSnd() { ac.noise(0.25, 900, 0.3, 'bandpass'); },
    buy() { ac.tone(660, 0.05, 0.25, 'sine'); setTimeout(() => ac.tone(990, 0.07, 0.25, 'sine'), 60); },
    click() { ac.tone(1500, 0.03, 0.2, 'sine'); },
    win() { ac.tone(523, 0.14, 0.3, 'triangle'); setTimeout(() => ac.tone(784, 0.2, 0.3, 'triangle'), 140); },
    lose() { ac.tone(392, 0.16, 0.3, 'triangle'); setTimeout(() => ac.tone(262, 0.24, 0.3, 'triangle'), 160); },
  };
  return ac;
}
