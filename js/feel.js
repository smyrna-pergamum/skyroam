// Speed feel ("juice"): dynamic field of view, acceleration-driven camera lag, trauma-based shake
// and speed lines. Visual only: nothing here changes the flight simulation.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class Feel {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.trauma = 0;      // event shake, decays
    this.t = 0;
    this.fov = 60;
    this.acc = 0;         // smoothed longitudinal acceleration (m/s²)
    this.prevSpeed = null;
    this.prevThrottle = null;
    this.kick = 0;        // short FOV punch when the throttle is pushed
    this.lines = Array.from({ length: 70 }, () => this._spawn(true));
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _spawn(anywhere) {
    return { a: Math.random() * Math.PI * 2, r: anywhere ? 0.2 + Math.random() * 0.8 : 0.18 + Math.random() * 0.25, v: 0.6 + Math.random() * 0.8, w: 0.6 + Math.random() * 1.4 };
  }

  addTrauma(x) { this.trauma = clamp(this.trauma + x, 0, 1); }

  reset() { this.prevSpeed = null; this.prevThrottle = null; this.acc = 0; this.kick = 0; this.trauma = 0; this.fov = 60; this.g.clearRect(0, 0, this.w, this.h); }

  /**
   * s: flight state; top: aircraft top speed (m/s). Returns camera effects.
   * enabled=false (reduce motion) keeps everything still.
   */
  update(dt, s, top, enabled, camMode) {
    if (dt <= 0) return { fov: this.fov, distScale: 1, yaw: 0, pitch: 0, roll: 0 };
    // Blend speed relative to this aircraft's top speed with absolute speed, so a glider at
    // full speed feels brisk but not like a fighter jet.
    const sp01 = clamp(0.55 * s.speed / Math.max(top, 30) + 0.45 * s.speed / 260, 0, 1.3);
    if (this.prevSpeed === null) { this.prevSpeed = s.speed; this.prevThrottle = s.throttle; }
    const rawAcc = (s.speed - this.prevSpeed) / dt;
    this.prevSpeed = s.speed;
    this.acc = smooth(this.acc, clamp(rawAcc, -15, 15), 3, dt);
    if (s.throttle - this.prevThrottle > 0.004) this.kick = clamp(this.kick + (s.throttle - this.prevThrottle) * 6, 0, 1);
    this.prevThrottle = s.throttle;
    this.kick = Math.max(0, this.kick - dt * 1.5);

    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    if (!enabled) { this.fov = smooth(this.fov, 60, 4, dt); return { fov: this.fov, distScale: 1, yaw: 0, pitch: 0, roll: 0, sp01 }; }

    // FOV widens with speed and punches briefly when you push the throttle.
    const targetFov = 58 + 20 * Math.min(1, sp01) + 6 * clamp(this.acc / 6, -0.5, 1) + 5 * this.kick;
    this.fov = smooth(this.fov, targetFov, 3.5, dt);

    // Chase camera falls back while accelerating, closes in while slowing.
    const distScale = 1 + clamp(this.acc / 8, -0.2, 0.35) + 0.12 * Math.min(1, sp01);

    // Shake: steady buffet from speed (and ground roll) + decaying event trauma. trauma² keeps it gentle.
    const buffet = 0.18 * Math.max(0, sp01 - 0.55) + (s.onGround && s.speed > 3 ? 0.25 * Math.min(1, s.speed / 40) : 0) + (s.stalled ? 0.35 : 0);
    const k = clamp(buffet + this.trauma, 0, 1);
    const shake = k * k * (camMode === 'chase' ? 1 : 0.6);
    const tt = this.t * 28;
    return {
      fov: this.fov, distScale, sp01,
      yaw: 0.012 * shake * Math.sin(tt * 1.7),
      pitch: 0.01 * shake * Math.sin(tt * 2.3 + 1.3),
      roll: 0.012 * shake * Math.sin(tt * 1.1 + 0.7),
    };
  }

  /** Speed lines streaming out from the centre of the screen. */
  draw(dt, sp01, accel, enabled) {
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    if (!enabled) return;
    const strength = clamp((sp01 - 0.45) / 0.55, 0, 1) * 0.8 + clamp(accel / 6, 0, 1) * 0.3 + this.kick * 0.3;
    if (strength <= 0.02) return;
    const cx = w / 2, cy = h * 0.47, R = Math.hypot(w, h) / 2;
    g.lineCap = 'round';
    for (const L of this.lines) {
      L.r += dt * L.v * (0.5 + sp01 * 1.8);
      if (L.r > 1.05) Object.assign(L, this._spawn(false));
      const r0 = L.r * R, len = R * (0.03 + 0.12 * strength) * L.r;
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      const fade = clamp((L.r - 0.25) / 0.35, 0, 1);
      g.strokeStyle = `rgba(255,255,255,${(0.32 * strength * fade).toFixed(3)})`;
      g.lineWidth = L.w;
      g.beginPath(); g.moveTo(cx + ca * r0, cy + sa * r0); g.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len)); g.stroke();
    }
  }
}
