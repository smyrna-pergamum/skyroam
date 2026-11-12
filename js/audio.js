// Synthesised engine + wind sound with WebAudio. No audio files needed.

export class EngineSound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** Must be called from a user gesture (click/keypress). */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // Engine: two detuned oscillators through a low-pass filter.
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.05;
    this.filter.connect(this.engGain).connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.detune.value = 9;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.osc1.start(); this.osc2.start();

    // Wind: looped noise through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.noise.start();
  }

  /** engine: 'prop' | 'jet' | 'none' */
  update(throttle, speed, active, engine = 'prop') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    const jet = engine === 'jet';
    const eng = engine === 'none' ? 0 : 1;
    // Props: low rumble. Jets: a higher turbine whine over more roar (wind channel).
    const f = jet ? 140 + throttle * 320 : 45 + throttle * 70;
    this.osc1.frequency.setTargetAtTime(f, t, jet ? 0.6 : 0.15);
    this.osc2.frequency.setTargetAtTime(f * (jet ? 1.5 : 0.5), t, jet ? 0.6 : 0.15);
    this.filter.frequency.setTargetAtTime((jet ? 900 : 350) + throttle * 1400, t, 0.2);
    this.engGain.gain.setTargetAtTime(on * eng * (jet ? 0.012 + throttle * 0.025 : 0.035 + throttle * 0.06), t, 0.2);
    const w = Math.min(1, speed / 140);
    const roar = jet ? throttle * 0.1 : 0;
    this.windGain.gain.setTargetAtTime(on * (w * w * 0.12 + roar), t, 0.3);
    this.windFilter.frequency.setTargetAtTime(400 + w * 900 + (jet ? 300 : 0), t, 0.3);
  }

  /** One-shot chime for passing a ring. */
  chime(high = false) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 0.09].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = (high ? 880 : 660) * (i ? 1.5 : 1);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g).connect(this.master);
      o.start(t + d); o.stop(t + d + 0.4);
    });
  }

  /** Short noise burst for a crash. */
  crash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise.buffer;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1.3);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }
}
