/* global Cesium */
// Live screens for the 3D cockpits: each display of the cockpit model (a quad in the model frame, see
// models3d.js) is projected to the window every frame, and the instrument is drawn into that quad on a
// 2D overlay: PFD, navigation display, engine page, HUD, round gauges, UFC text. The camera only turns
// about the eye in cockpit view, so the overlay stays glued to the screens of the model.
import { pfd, nd, eicas, asi, attitudeDial, altimeter, headingDial, vsiDial, turnDial, text, line, circle, poly, GRN, CYN, WHT } from './cockpit.js';

const R2D = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HUDC = '#7dff9a';
const ROUND = new Set(['asi', 'ai', 'alt', 'hdg', 'vsi', 'turn']);

/** HUD symbology in a square s x s at (x, y): pitch ladder, flight path marker, speed, altitude, heading. */
function hud(g, x, y, s, d) {
  const cx = x + s / 2, cy = y + s * 0.5, k = s * 0.022;
  g.save(); g.beginPath(); g.arc(cx, cy, s * 0.5, 0, Math.PI * 2); g.clip();
  g.strokeStyle = HUDC; g.fillStyle = HUDC; g.lineWidth = Math.max(1, s * 0.006);
  g.save(); g.translate(cx, cy); g.rotate(-d.roll / R2D);
  for (let p = -30; p <= 30; p += 5) {
    const yy = -(p - d.pitch) * k; if (Math.abs(yy) > s * 0.45) continue;
    const L = p === 0 ? s * 0.42 : s * 0.11, gap = s * 0.07;
    if (p < 0) g.setLineDash([s * 0.02, s * 0.014]);
    line(g, -gap - L, yy, -gap, yy); line(g, gap, yy, gap + L, yy); g.setLineDash([]);
    if (p) text(g, String(Math.abs(p)), gap + L + s * 0.04, yy, s * 0.04, HUDC);
  }
  g.restore();
  const gamma = Math.atan2(d.vs, Math.max(1, d.s.speed)) * R2D;
  const fy = cy - clamp(gamma - d.pitch, -12, 12) * k;
  circle(g, cx, fy, s * 0.022); g.stroke();
  line(g, cx - s * 0.06, fy, cx - s * 0.022, fy); line(g, cx + s * 0.022, fy, cx + s * 0.06, fy); line(g, cx, fy - s * 0.022, cx, fy - s * 0.045);
  text(g, String(Math.round(d.spd)), x + s * 0.2, cy, s * 0.055, HUDC, 'center', 700);
  g.strokeRect(x + s * 0.13, cy - s * 0.04, s * 0.14, s * 0.08);
  text(g, String(Math.round(d.alt)), x + s * 0.8, cy, s * 0.055, HUDC, 'center', 700);
  g.strokeRect(x + s * 0.71, cy - s * 0.04, s * 0.18, s * 0.08);
  text(g, `M ${(d.spd / 1225).toFixed(2)}`, x + s * 0.2, cy + s * 0.13, s * 0.042, HUDC);
  text(g, `${d.vs >= 0 ? '+' : ''}${Math.round(d.vs)}`, x + s * 0.8, cy + s * 0.13, s * 0.042, HUDC);
  const ty = y + s * 0.12;
  for (let h = Math.floor((d.hdg - 25) / 5) * 5; h <= d.hdg + 25; h += 5) {
    const xx = cx + (h - d.hdg) * s * 0.012;
    line(g, xx, ty, xx, ty + (h % 10 ? s * 0.015 : s * 0.03));
    if (h % 10 === 0) text(g, String((((h % 360) + 360) % 360) / 10 | 0).padStart(2, '0'), xx, ty - s * 0.025, s * 0.035, HUDC);
  }
  poly(g, [[cx, ty + s * 0.045], [cx - s * 0.012, ty + s * 0.065], [cx + s * 0.012, ty + s * 0.065]], HUDC);
  if (d.s.stalled) text(g, 'STALL', cx, y + s * 0.8, s * 0.07, HUDC, 'center', 800);
  g.restore();
}

/** Up-front control panel / data entry display: a few lines of green text. */
function ufc(g, w, h, d) {
  g.fillStyle = '#020803'; g.fillRect(0, 0, w, h);
  const lines = [
    `HDG ${String(Math.round(d.hdg) % 360).padStart(3, '0')}   ALT ${Math.round(d.alt)}`,
    `IAS ${Math.round(d.spd)}   M ${(d.spd / 1225).toFixed(2)}`,
    `THR ${Math.round(d.s.throttle * 100)}%   VS ${d.vs >= 0 ? '+' : ''}${d.vs.toFixed(1)}`,
    d.gear > 0.5 ? 'GEAR DN   NAV 1' : 'GEAR UP   NAV 1',
  ];
  g.save(); g.shadowColor = GRN; g.shadowBlur = 3;
  lines.forEach((t, i) => text(g, t, w * 0.05, h * (0.15 + i * 0.235), Math.min(h * 0.14, w * 0.068), GRN, 'left', 700));
  g.restore();
}

/** Systems page: engine gauges on top, fuel and gear state below. */
function sys(g, w, h, d, n1, eng) {
  eicas(g, 0, 0, w, h * 0.62, d, n1, eng);
  g.fillStyle = '#05070a'; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.strokeStyle = '#2a3340'; g.lineWidth = 1; line(g, w * 0.05, h * 0.63, w * 0.95, h * 0.63);
  text(g, 'FUEL', w * 0.15, h * 0.72, h * 0.05, CYN);
  text(g, `${Math.round(7200 - d.s.throttle * 30)} KG`, w * 0.15, h * 0.8, h * 0.06, WHT, 'center', 700);
  text(g, 'GEAR', w * 0.5, h * 0.72, h * 0.05, CYN);
  const gc = d.gear > 0.96 ? GRN : d.gear < 0.04 ? WHT : '#ffb020';
  for (let i = 0; i < 3; i++) { g.fillStyle = gc; g.fillRect(w * (0.42 + i * 0.06), h * 0.78, w * 0.04, h * 0.05); }
  text(g, 'G', w * 0.85, h * 0.72, h * 0.05, CYN);
  text(g, (1 + Math.abs(d.inp.pitch) * 3 * Math.min(1, d.s.speed / 150)).toFixed(1), w * 0.85, h * 0.8, h * 0.06, WHT, 'center', 700);
}

export class Screens3D {
  constructor(scene, host) {
    this.scene = scene;
    this.cv = document.createElement('canvas');
    this.cv.id = 'screens3d';
    Object.assign(this.cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '4' });
    (host || document.body).appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.list = [];
    this.n1 = [0];
    this._acc = 0; this._lastSpd = 0;
    this.drawn = false;
    this._p = new Cesium.Cartesian3(); this._w = new Cesium.Cartesian3();
  }

  /** displays: [{ k, tl, tr, bl }] in the cockpit model's frame; fix: model -> body offset (Cockpit3D.fix). */
  configure(ac, topKmh, displays) {
    this.vmax = Math.max(200, Math.ceil((Math.max(topKmh, ac.phys.vStall * 3.6 * 3) * 1.15) / 50) * 50);
    this.vstall = ac.phys.vStall * 3.6;
    this.engine = ac.phys.engine;
    this.n1 = new Array(Math.max(1, (ac.cockpit && ac.cockpit.engines) || 1)).fill(0);
    this.list = (displays || []).map(s => {
      const w = Math.hypot(...s.tr.map((v, i) => v - s.tl[i])), h = Math.hypot(...s.bl.map((v, i) => v - s.tl[i]));
      const px = s.k === 'hud' ? 512 : 384;
      const c = document.createElement('canvas');
      c.width = w >= h ? px : Math.round(px * w / h); c.height = w >= h ? Math.round(px * h / w) : px;
      return { ...s, c, g: c.getContext('2d') };
    });
    this.clear();
  }

  clear() {
    if (!this.drawn) return;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.cv.width, this.cv.height);
    this.drawn = false;
  }

  /** M: aircraft body -> world; fix: cockpit model -> body (Matrix4); view: flight state; inp: stick axes. */
  draw(M, fix, view, inp, dt, nav, extra = {}) {
    if (!this.list.length) { this.clear(); return; }
    const cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    this.drawn = true;

    const s = view;
    this.wind = extra.wind;
    for (let i = 0; i < this.n1.length; i++) this.n1[i] += (s.throttle - this.n1[i]) * (1 - Math.exp(-dt * (1.2 + i * 0.15)));
    if (dt > 0) { this._acc += ((s.speed - this._lastSpd) / dt - this._acc) * Math.min(1, dt * 2); this._lastSpd = s.speed; }
    const d = {
      s, inp, nav, traffic: extra.traffic, gear: extra.gear ?? 1, spd: s.speed * 3.6, alt: s.h, vs: s.vs, agl: s.agl, ground: s.ground, acc: this._acc,
      hdg: ((s.heading * R2D) % 360 + 360) % 360, pitch: s.pitch * R2D, roll: s.roll * R2D,
    };

    const canvas = this.scene.canvas, sx = dpr * cv.clientWidth / canvas.clientWidth, sy = dpr * cv.clientHeight / canvas.clientHeight;
    const proj = p => {
      // model (x left, y up, z forward) -> body (x forward, y left, z up) -> world -> window
      Cesium.Cartesian3.fromElements(p[2], p[0], p[1], this._p);
      Cesium.Matrix4.multiplyByPoint(fix, this._p, this._p);
      Cesium.Matrix4.multiplyByPoint(M, this._p, this._w);
      const win = Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, this._w);
      return win ? [win.x * sx, win.y * sy] : null;
    };
    for (const sc of this.list) {
      const a = proj(sc.tl), b = proj(sc.tr), c = proj(sc.bl);
      if (!a || !b || !c) continue;
      this.paint(sc, d);
      const cw = sc.c.width, ch = sc.c.height;
      g.setTransform((b[0] - a[0]) / cw, (b[1] - a[1]) / cw, (c[0] - a[0]) / ch, (c[1] - a[1]) / ch, a[0], a[1]);
      if (sc.k === 'hud') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9; }
      g.drawImage(sc.c, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Draw one instrument into its own canvas. */
  paint(sc, d) {
    const { g, c } = sc, w = c.width, h = c.height, m = Math.min(w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (sc.k === 'hud') { g.clearRect(0, 0, w, h); hud(g, (w - m) / 2, (h - m) / 2, m, d); return; }
    // round gauges sit on a clear background so the panel shows around them
    if (ROUND.has(sc.k)) g.clearRect(0, 0, w, h); else { g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); }
    const sq = (fn) => fn((w - m) / 2, (h - m) / 2, m);
    const r = m * 0.46, cx = w / 2, cy = h / 2;
    switch (sc.k) {
      case 'pfd': sq((x, y, s) => pfd(g, x, y, s, d, this.vmax, this.vstall)); break;
      case 'nd': sq((x, y, s) => nd(g, x, y, s, d, d.nav, this.wind)); break;
      case 'eicas': eicas(g, 0, 0, w, h, d, this.n1, this.engine); break;
      case 'sys': sys(g, w, h, d, this.n1, this.engine); break;
      case 'ufc': ufc(g, w, h, d); break;
      case 'asi': asi(g, cx, cy, r, d.spd, this.vmax, this.vstall); break;
      case 'ai': attitudeDial(g, cx, cy, r, d.pitch, d.roll); break;
      case 'alt': altimeter(g, cx, cy, r, d.alt); break;
      case 'hdg': headingDial(g, cx, cy, r, d.hdg); break;
      case 'vsi': vsiDial(g, cx, cy, r, d.vs); break;
      case 'turn': turnDial(g, cx, cy, r, d.roll, d.inp.yaw); break;
      default: break;
    }
  }
}
