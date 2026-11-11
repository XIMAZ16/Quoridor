// Audio system: 8-bit synthesized sound effects.
class RetroAudio {
  constructor() {
    this.ctx = null; this.isMuted = false;
    try { const s = localStorage.getItem('retro_quoridor_muted'); if (s !== null) this.isMuted = s === 'true'; } catch (e) {}
  }
  init() {
    if (!this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggleMute() {
    this.isMuted = !this.isMuted;
    try { localStorage.setItem('retro_quoridor_muted', this.isMuted); } catch (e) {}
    return this.isMuted;
  }
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (this.isMuted) return; this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  }
  playMove(p) { p === 0 ? this.tone('square', 440, 880, 0.1, 0.15) : this.tone('triangle', 330, 550, 0.1, 0.15); }
  playWall() { this.tone('square', 220, 90, 0.14, 0.18); }
  playInvalid() { this.tone('sawtooth', 140, 110, 0.15, 0.2); }
  playClick() { this.tone('sine', 800, 400, 0.04, 0.1); }
  playGameWin() {
    [[523.25, .1], [659.25, .1], [783.99, .1], [1046.5, .18], [880, .1], [1046.5, .35]]
      .reduce((t, n) => { this.tone('square', n[0], n[0], n[1], 0.18, t); return t + n[1] * 1.05; }, 0);
  }
  playDraw() { [440, 415.3, 392, 349.23].forEach((f, i) => this.tone('sawtooth', f, f, 0.15, 0.15, i * 0.12)); }
}
window.retroAudio = new RetroAudio();

/* ==========================================================================
   QUORIDOR ENGINE (pure functions)
   Player 0 = X (cyan), starts bottom, goal row 0.
   Player 1 = O (pink), starts top, goal row 8.
   h[i*8+j] : horizontal wall between rows i and i+1, covering cols j and j+1
   v[i*8+j] : vertical wall between cols j and j+1, covering rows i and i+1
   Cell value = owner + 1 (0 = empty).
   ========================================================================== */
