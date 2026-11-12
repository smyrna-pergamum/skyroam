// Engine, wind and event sounds with WebAudio.
// Recorded loops from Pixabay (sounds/, Pixabay Content License) are layered on top of a small
// synthesiser; if the files can't load, the synthesiser alone still works.

const SAMPLES = {
  prop: 'sounds/prop.mp3', jet: 'sounds/jet.mp3', turbine: 'sounds/turbine.mp3',
  wind: 'sounds/wind.mp3', crash: 'sounds/crash.mp3', gear: 'sounds/gear.mp3',
};
// Seamless loop windows (seconds) inside each recording, skipping fade-ins/outs.
const LOOP = { prop: [0.5, 22.3], jet: [1, 9.5], turbine: [0.2, 2.8], wind: [0.3, 4.7] };

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
    this.samples = {};
    this.loops = {};
    this.buildAlarms();
    this.loadSamples();
  }

  // ---- cockpit alarms: continuous sources whose level is set every frame
  buildAlarms() {
    const ctx = this.ctx;
    const out = gain => { const g = ctx.createGain(); g.gain.value = gain; g.connect(this.master); return g; };
    this.alarm = {};
    // Stall horn (light aircraft): reedy two-tone buzz
    {
      const g = out(0), bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1.4;
      for (const f of [1650, 2210]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(); }
      bp.connect(g);
      this.alarm.horn = g;
    }
    // Stick shaker (airliners/jets): low rumble chopped ~15 times a second
    {
      const g = out(0), lp = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 260;
      const src = ctx.createBufferSource(); src.buffer = this.noise.buffer; src.loop = true; src.start();
      am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = 15; depth.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain); lfo.start();
      const thump = ctx.createOscillator(); thump.type = 'triangle'; thump.frequency.value = 55; thump.connect(am); thump.start();
      src.connect(lp).connect(am).connect(g);
      this.alarm.shaker = g;
    }
    // Overspeed clacker: square wave edges through a high-pass = sharp clicks
    {
      const g = out(0), hp = ctx.createBiquadFilter(), o = ctx.createOscillator();
      hp.type = 'highpass'; hp.frequency.value = 1800; o.type = 'square'; o.frequency.value = 7.5;
      o.connect(hp).connect(g); o.start();
      this.alarm.clacker = g;
    }
  }

  /** levels: { horn, shaker, clacker } each 0..1 */
  setAlarms(levels) {
    if (!this.ctx || !this.alarm) return;
    const t = this.ctx.currentTime;
    this.alarm.horn.gain.setTargetAtTime((levels.horn || 0) * 0.07, t, 0.03);
    this.alarm.shaker.gain.setTargetAtTime((levels.shaker || 0) * 0.9, t, 0.03);
    this.alarm.clacker.gain.setTargetAtTime((levels.clacker || 0) * 0.5, t, 0.03);
  }

  /** Master-warning style triple chime. */
  caution() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 0.16, 0.32].forEach(d => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1000;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.14);
      o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.16);
    });
  }

  async loadSamples() {
    const ctx = this.ctx;
    await Promise.all(Object.entries(SAMPLES).map(async ([k, url]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        this.samples[k] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* synth fallback */ }
    }));
    for (const k of Object.keys(LOOP)) {
      const buf = this.samples[k];
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const [a, b] = LOOP[k];
      src.loopStart = Math.min(a, buf.duration * 0.3); src.loopEnd = Math.min(b, buf.duration);
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g).connect(this.master);
      src.start(0, src.loopStart);
      this.loops[k] = { src, g };
    }
    this.hasSamples = Object.keys(this.loops).length > 0;
  }

  _loop(k, gain, rate, t, tc = 0.25) {
    const L = this.loops[k];
    if (!L) return;
    L.g.gain.setTargetAtTime(gain, t, tc);
    L.src.playbackRate.setTargetAtTime(rate, t, tc);
  }

  _oneShot(k, gain = 1, offset = 0, dur) {
    const buf = this.samples?.[k];
    if (!this.ctx || this.muted || !buf) return false;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    if (dur) { g.gain.setValueAtTime(gain, t + dur - 0.4); g.gain.linearRampToValueAtTime(0, t + dur); }
    src.connect(g).connect(this.master);
    src.start(t, offset, dur);
    return true;
  }

  /** Landing gear moving (down = true). */
  gear() { this._oneShot('gear', 0.7, 5.3, 3.6); }

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
    const synth = this.hasSamples ? 0.35 : 1; // the recordings carry most of the sound once loaded
    this.engGain.gain.setTargetAtTime(synth * on * eng * (jet ? 0.012 + throttle * 0.025 : 0.035 + throttle * 0.06), t, 0.2);
    const w = Math.min(1, speed / 140);
    const roar = jet ? throttle * 0.1 : 0;
    this.windGain.gain.setTargetAtTime(synth * on * (w * w * 0.12 + roar), t, 0.3);
    if (this.hasSamples) {
      const prop = on * (engine === 'prop' ? 1 : 0), jt = on * (jet ? 1 : 0);
      const small = this.small ? 0.25 : 0; // small single-engine props run at a higher pitch
      this._loop('prop', prop * (0.3 + throttle * 0.75), 0.7 + small + throttle * 0.55, t);
      this._loop('jet', jt * (0.12 + throttle * 0.45), 0.8 + throttle * 0.35, t, 0.6);
      this._loop('turbine', jt * (0.05 + throttle * 0.16), 0.75 + throttle * 0.5, t, 0.8);
      this._loop('wind', on * Math.min(0.7, w * w * 0.55 + Math.min(1, speed / 300) * 0.15), 0.8 + w * 0.5, t, 0.4);
    }
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
    this._oneShot('crash', 0.9);
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
