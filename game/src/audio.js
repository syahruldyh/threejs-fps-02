// Procedural WebAudio: every sound is synthesized — gunshots, reload clicks,
// footsteps, plant/douse beeps, hitmarker tick, kill confirm, round horn.
// No audio assets. Distance falloff by gain; created lazily on first gesture.
export class AudioSys {
  constructor() { this.ctx = null; this.master = null; this.stepT = 0; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  _noise(dur, filterFreq, type = 'lowpass') {
    if (!this.ctx) return null;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.master);
    return { src, g };
  }
  _tone(freq, dur, type = 'square', vol = 0.2, slideTo = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  // vol 0..1 scales with distance; pan -1..1 from the shot's direction.
  shot(weapon, dist = 0, pan = 0) {
    if (!this.ctx) return;
    const v = Math.max(0.05, 1 - dist / 55);
    const heavy = weapon === 'brine' || weapon === 'meridian';
    const n = this._noise(heavy ? 0.22 : 0.12, heavy ? 900 : 2400);
    if (n) { n.g.gain.value = (heavy ? 0.9 : 0.55) * v; n.src.start(); }
    this._tone(heavy ? 90 : 160, 0.09, 'square', 0.22 * v, 55);
    void pan;
  }
  dry() { this._tone(1200, 0.03, 'square', 0.12); }
  reload() {
    if (!this.ctx) return;
    setTimeout(() => this._tone(900, 0.04, 'square', 0.14), 60);
    setTimeout(() => this._tone(600, 0.05, 'square', 0.16), 420);
    setTimeout(() => this._tone(1100, 0.04, 'square', 0.14), 780);
  }
  step(run) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.stepT < (run ? 260 : 380)) return;
    this.stepT = now;
    const n = this._noise(0.07, 500);
    if (n) { n.g.gain.value = run ? 0.10 : 0.06; n.src.start(); }
  }
  hit(head) { this._tone(head ? 1900 : 1400, 0.06, 'sine', 0.25); }
  kill() { this._tone(660, 0.07, 'sine', 0.22); setTimeout(() => this._tone(990, 0.1, 'sine', 0.22), 70); }
  hurt() { this._tone(140, 0.18, 'sawtooth', 0.25, 70); }
  plantBeep() { this._tone(880, 0.09, 'sine', 0.2); }
  douseBeep() { this._tone(520, 0.09, 'sine', 0.2); }
  horn(win) {
    if (!this.ctx) return;
    this._tone(win ? 523 : 392, 0.5, 'triangle', 0.25);
    setTimeout(() => this._tone(win ? 659 : 330, 0.6, 'triangle', 0.25), 220);
  }
  explosion() {
    if (!this.ctx) return;
    const n = this._noise(0.9, 300);
    if (n) { n.g.gain.value = 1.0; n.src.start(); }
    this._tone(60, 0.8, 'sine', 0.5, 30);
  }
}
