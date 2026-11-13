// Cockpit interior: a 2D canvas overlay drawn over the 3D view in cockpit camera mode.
// Styles: 'ga' (analog six-pack), 'glass' (airliner screens), 'fighter' (HUD + MFDs), 'glider'.
// All instruments are live: speed, altitude, attitude, heading, vertical speed, throttle, controls.

const TAU = Math.PI * 2;
const R2D = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// ---------------------------------------------------------------- primitives
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function poly(g, pts, fill) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fillStyle = fill; g.fill();
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function text(g, str, x, y, size, color = '#e5e7eb', align = 'center', weight = 600) {
  g.font = `${weight} ${Math.max(7, size)}px ${FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(str, x, y);
}
function needle(g, x, y, ang, len, w, color = '#f8fafc') {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(-len * 0.18, -w); g.lineTo(len, 0); g.lineTo(-len * 0.18, w); g.closePath();
  g.fillStyle = color; g.fill(); g.restore();
  circle(g, x, y, w * 1.5); g.fillStyle = '#2a2d31'; g.fill();
}
function bezel(g, x, y, r) {
  const grad = g.createRadialGradient(x, y - r * 0.4, r * 0.2, x, y, r * 1.15);
  grad.addColorStop(0, '#5b616b'); grad.addColorStop(1, '#0e1012');
  circle(g, x, y, r * 1.12); g.fillStyle = grad; g.fill();
  circle(g, x, y, r); g.fillStyle = '#0a0b0d'; g.fill();
}
function glassShine(g, x, y, r) {
  const gr = g.createLinearGradient(x - r, y - r, x + r * 0.3, y + r * 0.3);
  gr.addColorStop(0, 'rgba(255,255,255,0.13)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)');
  circle(g, x, y, r); g.fillStyle = gr; g.fill();
}
/** Tick marks on an arc. a0..a1 canvas angles (clockwise from +x). */
function arcTicks(g, x, y, r, a0, a1, n, every, len, color = '#e5e7eb') {
  g.strokeStyle = color;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    const major = i % every === 0;
    const l = major ? len : len * 0.55;
    g.lineWidth = major ? Math.max(1.2, r * 0.035) : Math.max(0.8, r * 0.018);
    line(g, x + Math.cos(a) * (r - l), y + Math.sin(a) * (r - l), x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}
const fromTop = f => f * TAU - Math.PI / 2;

// ---------------------------------------------------------------- analog instruments
function asi(g, x, y, r, spd, vmax, vstall) {
  bezel(g, x, y, r);
  const ang = v => -Math.PI / 2 + (clamp(v, 0, vmax) / vmax) * TAU * 0.86;
  g.lineWidth = r * 0.08;
  g.strokeStyle = '#16a34a'; g.beginPath(); g.arc(x, y, r * 0.86, ang(vstall * 1.1), ang(vmax * 0.75)); g.stroke();
  g.strokeStyle = '#eab308'; g.beginPath(); g.arc(x, y, r * 0.86, ang(vmax * 0.75), ang(vmax * 0.92)); g.stroke();
  g.strokeStyle = '#dc2626'; g.beginPath(); g.arc(x, y, r * 0.86, ang(vmax * 0.92), ang(vmax)); g.stroke();
  g.strokeStyle = '#f8fafc'; g.beginPath(); g.arc(x, y, r * 0.76, ang(vstall * 0.9), ang(vstall * 1.6)); g.lineWidth = r * 0.05; g.stroke();
  arcTicks(g, x, y, r * 0.95, ang(0), ang(vmax), 20, 2, r * 0.16);
  for (let i = 0; i <= 10; i += 2) {
    const a = ang((vmax * i) / 10);
    text(g, String(Math.round((vmax * i) / 10)), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.16);
  }
  text(g, 'km/h', x, y + r * 0.3, r * 0.13, '#9ca3af');
  needle(g, x, y, ang(spd), r * 0.84, r * 0.05);
  glassShine(g, x, y, r);
}

function attitudeDial(g, x, y, r, pitch, roll) {
  bezel(g, x, y, r);
  g.save(); circle(g, x, y, r * 0.96); g.clip();
  g.translate(x, y); g.rotate(-roll / R2D);
  const k = r * 0.028, py = pitch * k;
  g.fillStyle = '#2f80d8'; g.fillRect(-r * 2, -r * 3 + py, r * 4, r * 3);
  g.fillStyle = '#8b5a2b'; g.fillRect(-r * 2, py, r * 4, r * 3);
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, r * 0.03);
  line(g, -r * 2, py, r * 2, py);
  for (let p = -30; p <= 30; p += 5) {
    if (!p) continue;
    const yy = py - p * k, L = (p % 10 === 0 ? 0.32 : 0.14) * r;
    line(g, -L, yy, L, yy);
    if (p % 10 === 0) text(g, String(Math.abs(p)), L + r * 0.12, yy, r * 0.12, '#fff');
  }
  // bank scale
  g.lineWidth = Math.max(1, r * 0.025);
  for (const b of [-60, -30, -20, -10, 10, 20, 30, 60]) {
    const a = (b - 90) / R2D;
    line(g, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
  }
  g.restore();
  // fixed aircraft symbol
  g.strokeStyle = '#facc15'; g.lineWidth = r * 0.07; g.lineCap = 'round';
  line(g, x - r * 0.55, y, x - r * 0.2, y); line(g, x + r * 0.2, y, x + r * 0.55, y);
  line(g, x - r * 0.2, y, x - r * 0.1, y + r * 0.1); line(g, x + r * 0.2, y, x + r * 0.1, y + r * 0.1);
  g.lineCap = 'butt';
  circle(g, x, y, r * 0.045); g.fillStyle = '#facc15'; g.fill();
  poly(g, [[x, y - r * 0.8], [x - r * 0.07, y - r * 0.68], [x + r * 0.07, y - r * 0.68]], '#facc15');
  glassShine(g, x, y, r);
}

function altimeter(g, x, y, r, alt) {
  bezel(g, x, y, r);
  arcTicks(g, x, y, r * 0.95, -Math.PI / 2, -Math.PI / 2 + TAU, 50, 5, r * 0.15);
  for (let i = 0; i < 10; i++) {
    const a = fromTop(i / 10);
    text(g, String(i), x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, r * 0.19);
  }
  // digital window
  g.fillStyle = '#000'; rrect(g, x - r * 0.36, y + r * 0.22, r * 0.72, r * 0.24, r * 0.04); g.fill();
  text(g, `${Math.round(alt)}`, x, y + r * 0.34, r * 0.17, '#f8fafc');
  text(g, 'ALT m', x, y - r * 0.3, r * 0.12, '#9ca3af');
  const a1000 = ((alt % 1000) + 1000) % 1000 / 1000;
  const a10000 = ((alt % 10000) + 10000) % 10000 / 10000;
  needle(g, x, y, fromTop(a10000), r * 0.5, r * 0.07);
  needle(g, x, y, fromTop(a1000), r * 0.85, r * 0.045);
  glassShine(g, x, y, r);
}

function headingDial(g, x, y, r, hdg) {
  bezel(g, x, y, r);
  g.save(); g.translate(x, y); g.rotate(-hdg / R2D);
  g.strokeStyle = '#e5e7eb';
  for (let i = 0; i < 72; i++) {
    g.save(); g.rotate((i * 5) / R2D);
    g.lineWidth = i % 2 ? Math.max(0.8, r * 0.015) : Math.max(1.2, r * 0.03);
    line(g, 0, -r * 0.94, 0, -r * (i % 2 ? 0.86 : 0.8));
    if (i % 6 === 0) {
      const n = i / 2;
      const lbl = n % 9 === 0 ? 'NESW'[n / 9] : String(n);
      text(g, lbl, 0, -r * 0.66, r * (n % 9 === 0 ? 0.2 : 0.15), n % 9 === 0 ? '#fbbf24' : '#e5e7eb');
    }
    g.restore();
  }
  g.restore();
  // fixed plane + lubber line
  g.strokeStyle = '#fb923c'; g.lineWidth = r * 0.05;
  line(g, x, y - r * 0.98, x, y - r * 0.82);
  g.strokeStyle = '#f8fafc'; g.lineWidth = r * 0.06;
  line(g, x, y - r * 0.32, x, y + r * 0.28); line(g, x - r * 0.28, y - r * 0.02, x + r * 0.28, y - r * 0.02);
  line(g, x - r * 0.12, y + r * 0.24, x + r * 0.12, y + r * 0.24);
  glassShine(g, x, y, r);
}

function vsiDial(g, x, y, r, vs, range = 20) {
  bezel(g, x, y, r);
  const ang = v => Math.PI + (clamp(v, -range, range) / range) * Math.PI * 0.85;
  arcTicks(g, x, y, r * 0.95, ang(-range), ang(range), 16, 4, r * 0.16);
  for (const v of [-range, -range / 2, 0, range / 2, range]) {
    const a = ang(v);
    text(g, String(Math.abs(v)), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.16);
  }
  text(g, '▲', x - r * 0.25, y - r * 0.32, r * 0.13, '#9ca3af');
  text(g, '▼', x - r * 0.25, y + r * 0.32, r * 0.13, '#9ca3af');
  text(g, 'V/S m/s', x + r * 0.2, y + r * 0.42, r * 0.11, '#9ca3af');
  needle(g, x, y, ang(vs), r * 0.84, r * 0.05);
  glassShine(g, x, y, r);
}

function turnDial(g, x, y, r, roll, yaw) {
  bezel(g, x, y, r);
  arcTicks(g, x, y, r * 0.95, Math.PI + 0.35, Math.PI + 0.36, 1, 1, r * 0.2);
  arcTicks(g, x, y, r * 0.95, -0.36, -0.35, 1, 1, r * 0.2);
  g.save(); g.translate(x, y - r * 0.05); g.rotate(clamp(roll, -45, 45) / R2D * 0.8);
  g.strokeStyle = '#f8fafc'; g.lineWidth = r * 0.07; g.lineCap = 'round';
  line(g, -r * 0.62, 0, r * 0.62, 0); line(g, 0, -r * 0.18, 0, r * 0.05);
  circle(g, 0, 0, r * 0.1); g.fillStyle = '#f8fafc'; g.fill();
  g.restore(); g.lineCap = 'butt';
  // inclinometer ball
  g.fillStyle = '#1f2937'; rrect(g, x - r * 0.5, y + r * 0.38, r, r * 0.2, r * 0.1); g.fill();
  circle(g, x + clamp(-yaw * 0.35 + roll / 300, -0.4, 0.4) * r, y + r * 0.48, r * 0.08); g.fillStyle = '#e5e7eb'; g.fill();
  text(g, 'TURN', x, y - r * 0.5, r * 0.12, '#9ca3af');
  glassShine(g, x, y, r);
}

function smallGauge(g, x, y, r, frac, label, value, color = '#22c55e') {
  bezel(g, x, y, r);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.lineWidth = r * 0.1; g.strokeStyle = '#334155';
  g.beginPath(); g.arc(x, y, r * 0.78, a0, a1); g.stroke();
  g.strokeStyle = color;
  g.beginPath(); g.arc(x, y, r * 0.78, a0, a0 + (a1 - a0) * clamp(frac, 0, 1)); g.stroke();
  arcTicks(g, x, y, r * 0.95, a0, a1, 10, 5, r * 0.15);
  text(g, label, x, y + r * 0.45, r * 0.18, '#9ca3af');
  text(g, value, x, y + r * 0.12, r * 0.22);
  needle(g, x, y, a0 + (a1 - a0) * clamp(frac, 0, 1), r * 0.7, r * 0.05);
}

function yoke(g, x, y, r, inp, color = '#1b1e23') {
  g.save();
  g.translate(x, y + clamp(inp.pitch, -1, 1) * r * 0.25);
  g.rotate(clamp(inp.roll, -1, 1) * 0.55);
  g.fillStyle = '#121418'; g.fillRect(-r * 0.13, 0, r * 0.26, r * 3);
  g.fillStyle = color; g.strokeStyle = '#3f4650'; g.lineWidth = Math.max(1, r * 0.04);
  rrect(g, -r * 1.75, -r * 0.3, r * 3.5, r * 0.42, r * 0.2); g.fill(); g.stroke();
  rrect(g, -r * 1.95, -r * 1.25, r * 0.48, r * 1.4, r * 0.2); g.fill(); g.stroke();
  rrect(g, r * 1.47, -r * 1.25, r * 0.48, r * 1.4, r * 0.2); g.fill(); g.stroke();
  g.fillStyle = '#b91c1c'; rrect(g, -r * 0.3, -r * 0.25, r * 0.6, r * 0.3, r * 0.06); g.fill();
  g.restore();
}

function stick(g, x, y, r, inp) {
  g.save();
  g.translate(x, y);
  g.rotate(clamp(inp.roll, -1, 1) * 0.35);
  g.translate(0, clamp(inp.pitch, -1, 1) * r * 0.15);
  g.fillStyle = '#111317'; rrect(g, -r * 0.6, -r * 0.1, r * 1.2, r * 0.6, r * 0.2); g.fill();
  g.fillStyle = '#1f2329'; rrect(g, -r * 0.12, -r * 1.6, r * 0.24, r * 1.6, r * 0.08); g.fill();
  g.fillStyle = '#2b3038'; g.strokeStyle = '#4b5563'; g.lineWidth = Math.max(1, r * 0.04);
  rrect(g, -r * 0.3, -r * 2.5, r * 0.6, r * 1.0, r * 0.25); g.fill(); g.stroke();
  g.fillStyle = '#b91c1c'; circle(g, r * 0.08, -r * 2.38, r * 0.09); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- hardware details (static layer)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => clamp(Math.round(c * k), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/** Rounded polygon path (does not begin a new path). */
function roundPoly(g, pts, r) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.arcTo(p[0], p[1], q[0], q[1], r);
  }
  g.closePath();
}
function screw(g, x, y, r) {
  circle(g, x, y, r); g.fillStyle = '#1a1c20'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(0.6, r * 0.3);
  line(g, x - r * 0.6, y - r * 0.2, x + r * 0.6, y + r * 0.2);
}
function knob(g, x, y, r, color = '#1c1f24') {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#5a6069'); gr.addColorStop(0.5, color); gr.addColorStop(1, '#08090b');
  circle(g, x, y, r); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
}
function button(g, x, y, w, h, label, lit) {
  g.fillStyle = '#16181c'; rrect(g, x, y, w, h, Math.min(w, h) * 0.15); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.stroke();
  if (label) text(g, label, x + w / 2, y + h / 2, Math.min(h * 0.42, w * 0.3), lit || '#c9ced6', 'center', 600);
}
function toggle(g, x, y, s, up = true) {
  g.fillStyle = '#0d0e10'; circle(g, x, y, s * 0.55); g.fill();
  g.strokeStyle = '#c7ccd3'; g.lineWidth = Math.max(1.5, s * 0.22); g.lineCap = 'round';
  line(g, x, y, x, y + (up ? -s : s)); g.lineCap = 'butt';
  circle(g, x, y + (up ? -s : s), s * 0.2); g.fillStyle = '#e5e7eb'; g.fill();
}
/** Brushed panel: gradient plus faint horizontal grain and an edge highlight. */
function panelFill(g, x, y, w, h, color) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, shade(color, 1.15)); gr.addColorStop(0.35, color); gr.addColorStop(1, shade(color, 0.45));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.save(); g.globalAlpha = 0.05; g.strokeStyle = '#fff'; g.lineWidth = 1;
  for (let yy = y + 3; yy < y + h; yy += 3 + ((yy * 7) % 5)) line(g, x, yy, x + w, yy);
  g.restore();
}
/** Display unit bezel with a soft-key row. Screen area is (x, y, w, h). */
function duBezel(g, x, y, w, h, keys = 0) {
  const b = Math.max(5, Math.min(w, h) * 0.05);
  g.fillStyle = '#121418'; rrect(g, x - b, y - b, w + b * 2, h + b * (keys ? 3.2 : 2), b * 0.8); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#010203'; rrect(g, x, y, w, h, b * 0.3); g.fill();
  for (let i = 0; i < keys; i++) {
    const kw = (w - b * (keys - 1)) / keys;
    g.fillStyle = '#1d2026'; rrect(g, x + i * (kw + b), y + h + b * 0.55, kw, b * 1.3, b * 0.3); g.fill();
  }
  screw(g, x - b * 0.5, y - b * 0.5, b * 0.22); screw(g, x + w + b * 0.5, y - b * 0.5, b * 0.22);
}
/** Square MFD with 5 option buttons on each side. */
function mfdBezel(g, x, y, s) {
  const b = s * 0.11;
  g.fillStyle = '#1a1d21'; rrect(g, x - b, y - b, s + b * 2, s + b * 2, b * 0.4); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#010203'; g.fillRect(x, y, s, s);
  const bs = b * 0.55;
  for (let i = 0; i < 5; i++) {
    const o = s * (0.16 + i * 0.17) - bs / 2;
    for (const [bx, by] of [[x + o, y - b * 0.78], [x + o, y + s + b * 0.23], [x - b * 0.78, y + o], [x + s + b * 0.23, y + o]]) {
      g.fillStyle = '#2b2f35'; rrect(g, bx, by, bs, bs, bs * 0.15); g.fill();
      g.strokeStyle = '#0a0b0d'; g.stroke();
    }
  }
  for (const [sx, sy] of [[x - b * 0.6, y - b * 0.6], [x + s + b * 0.6, y - b * 0.6], [x - b * 0.6, y + s + b * 0.6], [x + s + b * 0.6, y + s + b * 0.6]]) screw(g, sx, sy, b * 0.13);
}
/** Window frame: everything from the top of the screen down to `bottom`, with window holes cut out. */
function frameWithWindows(g, w, bottom, windows, color) {
  g.save();
  g.beginPath(); g.rect(0, 0, w, bottom);
  for (const win of windows) roundPoly(g, win, Math.min(w, bottom) * 0.025);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, shade(color, 0.6)); gr.addColorStop(0.5, color); gr.addColorStop(1, shade(color, 0.6));
  g.fillStyle = gr; g.fill('evenodd');
  // rubber seal and inner edge light
  for (const win of windows) {
    g.beginPath(); roundPoly(g, win, Math.min(w, bottom) * 0.025);
    g.strokeStyle = '#050607'; g.lineWidth = Math.max(2, w * 0.004); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.stroke();
    // faint tint and reflection on the glass
    g.save(); g.clip();
    const tg = g.createLinearGradient(0, 0, w * 0.4, bottom);
    tg.addColorStop(0, 'rgba(160,190,220,.07)'); tg.addColorStop(0.45, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(10,20,30,.08)');
    g.fillStyle = tg; g.fillRect(0, 0, w, bottom);
    g.restore();
  }
  g.restore();
}
/** Glareshield: a dark padded hood whose front lip curves across the panel. */
function glareshield(g, w, top, depth) {
  g.beginPath(); g.moveTo(0, top + depth * 0.25);
  g.quadraticCurveTo(w / 2, top - depth * 0.45, w, top + depth * 0.25);
  g.lineTo(w, top + depth); g.lineTo(0, top + depth); g.closePath();
  const gr = g.createLinearGradient(0, top - depth * 0.3, 0, top + depth);
  gr.addColorStop(0, '#202329'); gr.addColorStop(0.5, '#0e1013'); gr.addColorStop(1, '#060708');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, top + depth * 0.25); g.quadraticCurveTo(w / 2, top - depth * 0.45, w, top + depth * 0.25); g.stroke();
}

// ---------------------------------------------------------------- controls (moving)
function yokeAirliner(g, x, y, r, inp) {
  g.save();
  g.translate(x, y + clamp(inp.pitch, -1, 1) * r * 0.22);
  // column
  const cg = g.createLinearGradient(-r * 0.2, 0, r * 0.2, 0);
  cg.addColorStop(0, '#0c0d0f'); cg.addColorStop(0.5, '#3a3f46'); cg.addColorStop(1, '#0c0d0f');
  g.fillStyle = cg; g.fillRect(-r * 0.16, r * 0.1, r * 0.32, r * 3);
  g.rotate(clamp(inp.roll, -1, 1) * 0.6);
  // ram's-horn wheel
  const hg = g.createLinearGradient(0, -r * 1.3, 0, r * 0.4);
  hg.addColorStop(0, '#3b4047'); hg.addColorStop(1, '#121417');
  g.fillStyle = hg; g.strokeStyle = '#060708'; g.lineWidth = Math.max(1, r * 0.04);
  g.beginPath();
  g.moveTo(-r * 1.9, -r * 1.25); g.quadraticCurveTo(-r * 2.1, r * 0.1, -r * 0.9, r * 0.25);
  g.lineTo(r * 0.9, r * 0.25); g.quadraticCurveTo(r * 2.1, r * 0.1, r * 1.9, -r * 1.25);
  g.lineTo(r * 1.45, -r * 1.25); g.quadraticCurveTo(r * 1.5, -r * 0.2, r * 0.7, -r * 0.18);
  g.lineTo(-r * 0.7, -r * 0.18); g.quadraticCurveTo(-r * 1.5, -r * 0.2, -r * 1.45, -r * 1.25);
  g.closePath(); g.fill(); g.stroke();
  // centre hub with checklist clip
  g.fillStyle = '#23272d'; rrect(g, -r * 0.62, -r * 0.42, r * 1.24, r * 0.62, r * 0.12); g.fill(); g.stroke();
  g.fillStyle = '#c9a227'; rrect(g, -r * 0.42, -r * 0.33, r * 0.84, r * 0.12, r * 0.04); g.fill();
  // grip buttons
  g.fillStyle = '#b91c1c'; circle(g, -r * 1.68, -r * 1.12, r * 0.07); g.fill(); circle(g, r * 1.68, -r * 1.12, r * 0.07); g.fill();
  g.restore();
}
function yokeGA(g, x, y, r, inp) {
  g.save();
  g.translate(x, y + clamp(inp.pitch, -1, 1) * r * 0.25);
  const cg = g.createLinearGradient(-r * 0.14, 0, r * 0.14, 0);
  cg.addColorStop(0, '#6b7078'); cg.addColorStop(0.5, '#d4d8de'); cg.addColorStop(1, '#5a5f66');
  g.fillStyle = cg; g.fillRect(-r * 0.11, 0, r * 0.22, r * 3); // chrome shaft
  g.rotate(clamp(inp.roll, -1, 1) * 0.6);
  g.fillStyle = '#17191c'; g.strokeStyle = '#000'; g.lineWidth = Math.max(1, r * 0.04);
  g.beginPath();
  g.moveTo(-r * 1.85, -r * 0.9); g.quadraticCurveTo(-r * 1.95, r * 0.25, -r * 0.6, r * 0.2);
  g.lineTo(r * 0.6, r * 0.2); g.quadraticCurveTo(r * 1.95, r * 0.25, r * 1.85, -r * 0.9);
  g.lineTo(r * 1.5, -r * 0.95); g.quadraticCurveTo(r * 1.5, -r * 0.15, r * 0.5, -r * 0.12);
  g.lineTo(-r * 0.5, -r * 0.12); g.quadraticCurveTo(-r * 1.5, -r * 0.15, -r * 1.5, -r * 0.95);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#2c3036'; rrect(g, -r * 0.5, -r * 0.3, r * 1.0, r * 0.48, r * 0.1); g.fill();
  text(g, 'CESSNA', 0, -r * 0.06, r * 0.16, '#9aa1ab', 'center', 700);
  g.fillStyle = '#b91c1c'; circle(g, -r * 1.67, -r * 0.82, r * 0.06); g.fill();
  g.restore();
}
/** F-16 style side stick on the right console. */
function sideStick(g, x, y, r, inp) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#0d0f12'; rrect(g, -r * 0.9, -r * 0.25, r * 1.8, r * 0.9, r * 0.25); g.fill(); // boot
  g.rotate(clamp(inp.roll, -1, 1) * 0.18);
  g.translate(0, clamp(inp.pitch, -1, 1) * r * 0.1);
  const gr = g.createLinearGradient(-r * 0.4, 0, r * 0.4, 0);
  gr.addColorStop(0, '#15171a'); gr.addColorStop(0.5, '#3a3e44'); gr.addColorStop(1, '#101114');
  g.fillStyle = gr; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-r * 0.32, 0); g.quadraticCurveTo(-r * 0.5, -r * 1.2, -r * 0.3, -r * 1.9);
  g.quadraticCurveTo(0, -r * 2.2, r * 0.32, -r * 1.95); g.quadraticCurveTo(r * 0.45, -r * 1.1, r * 0.32, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#2b2f35'; circle(g, -r * 0.05, -r * 1.85, r * 0.12); g.fill();
  g.fillStyle = '#8b1d1d'; rrect(g, -r * 0.25, -r * 1.6, r * 0.18, r * 0.12, r * 0.03); g.fill();
  g.restore();
}
/** Thrust levers: n levers moving forward (up) with throttle. */
function thrustLevers(g, x, y, w, h, n, thr, prop) {
  const slot = w / (n + 1);
  for (let i = 0; i < n; i++) {
    const lx = x + slot * (i + 1);
    g.fillStyle = '#050607'; rrect(g, lx - slot * 0.08, y, slot * 0.16, h, slot * 0.06); g.fill();
    const ky = y + h * 0.88 - h * 0.78 * thr;
    g.strokeStyle = '#2a2e34'; g.lineWidth = slot * 0.14; line(g, lx, y + h, lx, ky);
    const kg = g.createLinearGradient(lx - slot * 0.4, 0, lx + slot * 0.4, 0);
    kg.addColorStop(0, '#0d0e10'); kg.addColorStop(0.5, prop ? '#4a4f57' : '#2f343a'); kg.addColorStop(1, '#0d0e10');
    g.fillStyle = kg; rrect(g, lx - slot * 0.42, ky - slot * 0.2, slot * 0.84, slot * 0.36, slot * 0.12); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  }
}

// ---------------------------------------------------------------- glass displays
const GRN = '#3ef06a', MAG = '#ff5bf0', CYN = '#4fd8ff', AMB = '#ffb020', WHT = '#f4f6f8';

function pfd(g, x, y, s, d, vmax, vstall) {
  g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
  g.fillStyle = '#05070a'; g.fillRect(x, y, s, s);
  // flight mode annunciator
  const fy = y + s * 0.01, fh = s * 0.075;
  const modes = [d.s.throttle > 0.02 ? 'SPEED' : 'IDLE', 'HDG SEL', Math.abs(d.vs) < 1.5 ? 'ALT HOLD' : 'V/S'];
  modes.forEach((m, i) => {
    const mx = x + s * (0.2 + i * 0.22);
    g.strokeStyle = '#3a3f47'; g.lineWidth = 1; g.strokeRect(mx - s * 0.1, fy, s * 0.2, fh);
    text(g, m, mx, fy + fh / 2, s * 0.038, GRN);
  });
  const ax = x + s * 0.21, aw = s * 0.56, ay = y + s * 0.12, ah = s * 0.6;
  const cx = ax + aw / 2, cy = ay + ah / 2;
  // attitude in a rounded window
  g.save(); g.beginPath(); rrect(g, ax, ay, aw, ah, s * 0.05); g.clip();
  g.translate(cx, cy); g.rotate(-d.roll / R2D);
  const k = ah * 0.013, py = d.pitch * k;
  const sky = g.createLinearGradient(0, -ah * 1.5 + py, 0, py); sky.addColorStop(0, '#0f5fc2'); sky.addColorStop(1, '#2a8bf0');
  g.fillStyle = sky; g.fillRect(-aw * 2, -ah * 3 + py, aw * 4, ah * 3);
  const gnd = g.createLinearGradient(0, py, 0, py + ah * 1.5); gnd.addColorStop(0, '#8a5326'); gnd.addColorStop(1, '#5a3315');
  g.fillStyle = gnd; g.fillRect(-aw * 2, py, aw * 4, ah * 3);
  g.strokeStyle = WHT; g.lineWidth = Math.max(1, s * 0.006);
  line(g, -aw * 2, py, aw * 2, py);
  for (let p = -30; p <= 30; p += 2.5) {
    if (!p) continue;
    const yy = py - p * k, L = p % 10 === 0 ? aw * 0.17 : p % 5 === 0 ? aw * 0.09 : aw * 0.04;
    if (Math.abs(yy) > ah * 0.45) continue;
    line(g, -L, yy, L, yy);
    if (p % 10 === 0) { text(g, String(Math.abs(p)), -L - s * 0.035, yy, s * 0.036, WHT); text(g, String(Math.abs(p)), L + s * 0.035, yy, s * 0.036, WHT); }
  }
  g.restore();
  // roll scale and pointer
  g.save(); g.translate(cx, cy); g.strokeStyle = WHT; g.lineWidth = Math.max(1, s * 0.005);
  g.beginPath(); g.arc(0, 0, ah * 0.44, (-90 - 60) / R2D, (-90 + 60) / R2D); g.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    g.save(); g.rotate(a / R2D); line(g, 0, -ah * 0.44, 0, -ah * (Math.abs(a) % 30 ? 0.47 : 0.5)); g.restore();
  }
  poly(g, [[0, -ah * 0.44], [-s * 0.018, -ah * 0.49], [s * 0.018, -ah * 0.49]], WHT);
  g.rotate(-d.roll / R2D);
  poly(g, [[0, -ah * 0.43], [-s * 0.02, -ah * 0.385], [s * 0.02, -ah * 0.385]], WHT);
  g.restore();
  // aircraft symbol (Boeing style)
  g.fillStyle = '#000'; g.strokeStyle = WHT; g.lineWidth = Math.max(1, s * 0.004);
  for (const sx of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + sx * aw * 0.12, cy - s * 0.012); g.lineTo(cx + sx * aw * 0.33, cy - s * 0.012);
    g.lineTo(cx + sx * aw * 0.33, cy + s * 0.012); g.lineTo(cx + sx * aw * 0.16, cy + s * 0.012); g.lineTo(cx + sx * aw * 0.16, cy + s * 0.04);
    g.lineTo(cx + sx * aw * 0.12, cy + s * 0.04); g.closePath(); g.fill(); g.stroke();
  }
  g.fillRect(cx - s * 0.012, cy - s * 0.012, s * 0.024, s * 0.024); g.strokeRect(cx - s * 0.012, cy - s * 0.012, s * 0.024, s * 0.024);

  // speed tape
  const tx = x + s * 0.03, tw = s * 0.14, pp = ah * 0.0032;
  g.save(); g.beginPath(); g.rect(tx, ay, tw, ah); g.clip();
  g.fillStyle = '#4a4f57'; g.fillRect(tx, ay, tw, ah);
  const vy = v => cy - (v - d.spd) * pp;
  // low speed barber pole
  for (let v = vstall; v > vstall - 200; v -= 8) { g.fillStyle = Math.round((vstall - v) / 8) % 2 ? '#000' : '#e11d48'; g.fillRect(tx + tw - s * 0.016, vy(v), s * 0.016, 8 * pp); }
  g.fillStyle = AMB; g.fillRect(tx + tw - s * 0.008, vy(vstall * 1.3), s * 0.008, (vstall * 0.3) * pp);
  g.strokeStyle = WHT; g.lineWidth = 1;
  for (let v = Math.floor((d.spd - 160) / 10) * 10; v <= d.spd + 160; v += 10) {
    if (v < 0) continue;
    line(g, tx + tw - s * (v % 20 ? 0.018 : 0.03), vy(v), tx + tw, vy(v));
    if (v % 20 === 0) text(g, String(v), tx + tw * 0.42, vy(v), s * 0.036, WHT);
  }
  // speed trend arrow
  const trend = (d.acc || 0) * 10 * 3.6;
  if (Math.abs(trend) > 2) { g.strokeStyle = GRN; g.lineWidth = 2; line(g, tx + tw - s * 0.004, cy, tx + tw - s * 0.004, vy(d.spd + trend)); }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = WHT; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(tx - s * 0.005, cy - s * 0.035); g.lineTo(tx + tw - s * 0.01, cy - s * 0.035); g.lineTo(tx + tw + s * 0.01, cy);
  g.lineTo(tx + tw - s * 0.01, cy + s * 0.035); g.lineTo(tx - s * 0.005, cy + s * 0.035); g.closePath(); g.fill(); g.stroke();
  text(g, String(Math.round(d.spd)), tx + tw * 0.45, cy, s * 0.05, WHT, 'center', 700);
  text(g, `${Math.round(d.spd)}`, tx + tw / 2, ay - s * 0.025, s * 0.036, MAG);
  text(g, `GS ${Math.round(d.spd)}`, tx + tw / 2, ay + ah + s * 0.035, s * 0.032, WHT);

  // altitude tape
  const bx = ax + aw + s * 0.03, bw = s * 0.14, pa = ah * 0.0028;
  g.save(); g.beginPath(); g.rect(bx, ay, bw, ah); g.clip();
  g.fillStyle = '#4a4f57'; g.fillRect(bx, ay, bw, ah);
  const ay2 = a => cy - (a - d.alt) * pa;
  g.strokeStyle = WHT; g.lineWidth = 1;
  for (let a = Math.floor((d.alt - 240) / 20) * 20; a <= d.alt + 240; a += 20) {
    line(g, bx, ay2(a), bx + s * (a % 100 ? 0.018 : 0.03), ay2(a));
    if (a % 100 === 0) text(g, String(a), bx + bw * 0.6, ay2(a), s * 0.034, WHT);
  }
  if (Number.isFinite(d.ground)) { g.fillStyle = 'rgba(200,120,30,.75)'; g.fillRect(bx, ay2(d.ground), bw, ah); }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = WHT; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(bx + bw + s * 0.005, cy - s * 0.035); g.lineTo(bx + s * 0.01, cy - s * 0.035); g.lineTo(bx - s * 0.01, cy);
  g.lineTo(bx + s * 0.01, cy + s * 0.035); g.lineTo(bx + bw + s * 0.005, cy + s * 0.035); g.closePath(); g.fill(); g.stroke();
  text(g, String(Math.round(d.alt)), bx + bw * 0.55, cy, s * 0.046, WHT, 'center', 700);
  text(g, 'M', bx + bw / 2, ay + ah + s * 0.035, s * 0.032, CYN);
  // vertical speed scale
  const vx = bx + bw + s * 0.02, vh = ah * 0.8, vy0 = cy;
  g.fillStyle = '#2c3036'; g.fillRect(vx, vy0 - vh / 2, s * 0.045, vh);
  const vsy = v => vy0 - Math.sign(v) * Math.min(1, Math.sqrt(Math.abs(v) / 30)) * vh * 0.48;
  g.strokeStyle = GRN; g.lineWidth = 2; line(g, vx + s * 0.05, vy0, vx + s * 0.005, vsy(d.vs));
  if (Math.abs(d.vs) > 2) text(g, `${d.vs > 0 ? '+' : ''}${d.vs.toFixed(0)}`, vx + s * 0.022, d.vs > 0 ? vy0 - vh / 2 - s * 0.025 : vy0 + vh / 2 + s * 0.025, s * 0.03, GRN);

  // heading arc
  const hcx = cx, hcy = y + s * 1.18, hr = s * 0.38;
  g.save(); g.beginPath(); g.rect(ax - s * 0.05, ay + ah + s * 0.01, aw + s * 0.1, s); g.clip();
  g.fillStyle = '#3a3f47'; circle(g, hcx, hcy, hr); g.fill();
  g.translate(hcx, hcy); g.rotate(-d.hdg / R2D); g.strokeStyle = WHT; g.lineWidth = 1;
  for (let i = 0; i < 72; i++) {
    g.save(); g.rotate(i * 5 / R2D);
    line(g, 0, -hr, 0, -hr + (i % 2 ? s * 0.015 : s * 0.03));
    if (i % 6 === 0) text(g, String(i / 2), 0, -hr + s * 0.055, s * 0.034, WHT);
    g.restore();
  }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = WHT; rrect(g, hcx - s * 0.055, ay + ah + s * 0.012, s * 0.11, s * 0.05, s * 0.006); g.fill(); g.stroke();
  text(g, String(Math.round(d.hdg) % 360).padStart(3, '0'), hcx, ay + ah + s * 0.037, s * 0.036, WHT, 'center', 700);
  // radio altitude near the ground
  if (Number.isFinite(d.agl) && d.agl < 760) text(g, String(Math.max(0, Math.round(d.agl))), cx, ay + ah * 0.82, s * 0.045, d.agl < 150 ? AMB : WHT, 'center', 700);
  if (d.s.stalled) text(g, 'STALL', cx, ay + ah * 0.2, s * 0.06, '#ff3b3b', 'center', 800);
  g.restore();
}

function nd(g, x, y, s, d, nav, wind) {
  g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
  g.fillStyle = '#05070a'; g.fillRect(x, y, s, s);
  const cx = x + s / 2, cy = y + s * 0.8, R = s * 0.62;
  // compass arc
  g.save(); g.translate(cx, cy); g.rotate(-d.hdg / R2D);
  g.strokeStyle = WHT; g.lineWidth = 1.2;
  g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
  for (let i = 0; i < 72; i++) {
    g.save(); g.rotate((i * 5) / R2D);
    line(g, 0, -R, 0, -R + (i % 2 ? s * 0.018 : s * 0.035));
    if (i % 6 === 0) text(g, String(i / 2), 0, -R + s * 0.065, s * 0.042, WHT);
    g.restore();
  }
  g.restore();
  // range rings
  g.setLineDash([2, 5]); g.strokeStyle = 'rgba(244,246,248,.45)'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R * 0.5, Math.PI, TAU); g.stroke(); g.setLineDash([]);
  text(g, '2.5', cx - R * 0.5 - s * 0.03, cy - s * 0.02, s * 0.03, CYN);
  // track line
  g.strokeStyle = WHT; g.lineWidth = 1; line(g, cx, cy - s * 0.06, cx, cy - R);
  if (nav) {
    const dpx = Math.min(R, (nav.dist / 5000) * R);
    const px = cx + Math.sin(nav.rel) * dpx, py = cy - Math.cos(nav.rel) * dpx;
    g.strokeStyle = MAG; g.lineWidth = 2; line(g, cx, cy, px, py);
    g.save(); g.translate(px, py); g.rotate(Math.PI / 4); g.strokeStyle = MAG; g.strokeRect(-s * 0.015, -s * 0.015, s * 0.03, s * 0.03); g.restore();
    text(g, 'RING', x + s * 0.95, y + s * 0.05, s * 0.04, MAG, 'right');
    text(g, `${(nav.dist / 1000).toFixed(1)} KM`, x + s * 0.95, y + s * 0.1, s * 0.04, WHT, 'right');
  }
  // own ship
  g.strokeStyle = WHT; g.lineWidth = Math.max(1.5, s * 0.008);
  g.beginPath(); g.moveTo(cx, cy - s * 0.05); g.lineTo(cx - s * 0.03, cy + s * 0.03); g.lineTo(cx + s * 0.03, cy + s * 0.03); g.closePath(); g.stroke();
  // header
  g.fillStyle = '#000'; g.strokeStyle = WHT; g.lineWidth = 1;
  rrect(g, cx - s * 0.075, y + s * 0.02, s * 0.15, s * 0.07, s * 0.008); g.fill(); g.stroke();
  text(g, String(Math.round(d.hdg) % 360).padStart(3, '0'), cx, y + s * 0.056, s * 0.045, WHT, 'center', 700);
  text(g, 'MAG', cx + s * 0.12, y + s * 0.056, s * 0.032, GRN, 'left');
  text(g, `GS ${Math.round(d.spd)}  TAS ${Math.round(d.spd)}`, x + s * 0.03, y + s * 0.05, s * 0.036, WHT, 'left');
  if (wind && wind.speed > 0.3) {
    const from = ((wind.to * R2D + 180) % 360 + 360) % 360;
    text(g, `${String(Math.round(from)).padStart(3, '0')}°/${Math.round(wind.speed * 3.6)}`, x + s * 0.03, y + s * 0.1, s * 0.036, WHT, 'left');
    g.save(); g.translate(x + s * 0.07, y + s * 0.17); g.rotate(wind.to - d.hdg / R2D);
    g.strokeStyle = WHT; g.lineWidth = 1.5; line(g, 0, s * 0.035, 0, -s * 0.035);
    poly(g, [[0, -s * 0.04], [-s * 0.012, -s * 0.02], [s * 0.012, -s * 0.02]], WHT); g.restore();
  }
  text(g, '5 KM', x + s * 0.03, y + s * 0.95, s * 0.034, CYN, 'left');
  g.restore();
}

function eicas(g, x, y, w, h, d, n1, eng) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#05070a'; g.fillRect(x, y, w, h);
  const n = n1.length, cols = Math.min(n, 4);
  const r = Math.min(w / (cols * 2) * 0.62, h * 0.2);
  const prop = eng === 'prop';
  const row = (cy, label, valOf, maxTxt, fmt) => {
    for (let i = 0; i < n && i < 4; i++) {
      const cx = x + w * (i + 0.5) / cols;
      const v = eng === 'none' ? 0 : valOf(n1[i]);
      const a0 = Math.PI * 0.8, a1 = Math.PI * 2.05;
      g.lineWidth = Math.max(1, r * 0.07); g.strokeStyle = WHT;
      g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
      g.fillStyle = 'rgba(160,165,175,.35)';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r * 0.96, a0, a0 + (a1 - a0) * v); g.closePath(); g.fill();
      g.strokeStyle = '#ff3b3b'; g.lineWidth = Math.max(1.5, r * 0.08);
      const ar = a0 + (a1 - a0) * 0.97; line(g, cx + Math.cos(ar) * r * 0.85, cy + Math.sin(ar) * r * 0.85, cx + Math.cos(ar) * r * 1.12, cy + Math.sin(ar) * r * 1.12);
      g.strokeStyle = WHT; g.lineWidth = Math.max(1, r * 0.06);
      const a = a0 + (a1 - a0) * v; line(g, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.fillStyle = '#05070a'; g.fillRect(cx + r * 0.12, cy + r * 0.12, r * 1.0, r * 0.48);
      g.strokeStyle = WHT; g.lineWidth = 1; g.strokeRect(cx + r * 0.12, cy + r * 0.12, r * 1.0, r * 0.48);
      text(g, fmt(v), cx + r * 0.62, cy + r * 0.36, r * 0.36, WHT, 'center', 700);
    }
    text(g, label, x + w / 2, cy - r * 0.15, Math.max(8, r * 0.3), CYN);
  };
  if (prop) {
    row(y + h * 0.26, 'TRQ %', v => v, 100, v => (v * 100).toFixed(0));
    row(y + h * 0.66, 'NP RPM', v => 0.7 + v * 0.3, 100, v => Math.round(v * 1020));
  } else {
    row(y + h * 0.26, 'N1', v => v, 100, v => (v * 101).toFixed(1));
    row(y + h * 0.66, 'EGT', v => 0.3 + v * 0.55, 100, v => Math.round(380 + v * 520));
  }
  // status column
  const sx = x + w * 0.04;
  const gearDown = d.gear > 0.5;
  const rows = [
    [`THR ${Math.round(d.s.throttle * 100)}%`, WHT],
    [gearDown ? 'GEAR DN' : 'GEAR UP', gearDown ? GRN : WHT],
    [d.s.stalled ? 'STALL' : d.inp.brake ? 'SPD BRK' : '', d.s.stalled ? '#ff3b3b' : AMB],
  ];
  text(g, rows[0][0], sx, y + h * 0.9, Math.max(8, h * 0.05), rows[0][1], 'left');
  text(g, rows[1][0], x + w * 0.5, y + h * 0.9, Math.max(8, h * 0.05), rows[1][1], 'center');
  if (rows[2][0]) text(g, rows[2][0], x + w * 0.96, y + h * 0.9, Math.max(8, h * 0.05), rows[2][1], 'right');
  g.restore();
}

// ---------------------------------------------------------------- weather on the glass
function dropSprite(snow) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  if (snow) {
    const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.5, 'rgba(240,246,255,.6)'); gr.addColorStop(1, 'rgba(240,246,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return c;
  }
  // a water bead: dark rim, light refracted underside, specular glint
  const body = g.createRadialGradient(16, 18, 2, 16, 16, 15);
  body.addColorStop(0, 'rgba(225,235,245,.22)'); body.addColorStop(0.7, 'rgba(160,180,200,.18)'); body.addColorStop(0.92, 'rgba(10,18,28,.45)'); body.addColorStop(1, 'rgba(10,18,28,0)');
  g.fillStyle = body; g.beginPath(); g.arc(16, 16, 15, 0, TAU); g.fill();
  const low = g.createLinearGradient(0, 16, 0, 31); low.addColorStop(0, 'rgba(255,255,255,0)'); low.addColorStop(1, 'rgba(255,255,255,.35)');
  g.fillStyle = low; g.beginPath(); g.arc(16, 17, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(11.5, 10.5, 3, 2, -0.6, 0, TAU); g.fill();
  return c;
}

// ---------------------------------------------------------------- cockpit class
export class Cockpit {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.cfg = { style: 'ga', engines: 1, panel: '#2b2f36' };
    this.vmax = 300; this.vstall = 100; this.engine = 'prop';
    this.n1 = [0];
    this.wet = null;     // { kind: 'rain' | 'snow' | 'mist', amount 0..1.3, dark }
    this.wind = null;
    this.drops = [];
    this.sprites = { rain: dropSprite(false), snow: dropSprite(true) };
    this.bg = document.createElement('canvas');
    this._lastSpd = 0; this._acc = 0;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    for (const c of [this.cv, this.bg]) { c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drops = [];
    this.buildStatic();
  }

  configure(ac, topKmh) {
    this.cfg = { style: 'ga', engines: 1, panel: '#2b2f36', ...ac.cockpit };
    this.vmax = Math.max(200, Math.ceil((Math.max(topKmh, ac.phys.vStall * 3.6 * 3) * 1.15) / 50) * 50);
    this.vstall = ac.phys.vStall * 3.6;
    this.engine = ac.phys.engine;
    this.accent = ac.colors.a;
    this.n1 = new Array(this.cfg.engines).fill(0);
    this.buildStatic();
  }

  set visible(v) { this.cv.hidden = !v; if (!v) this.drops = []; }

  // ---- layout per style: windows, panel line and where the live parts go
  layout() {
    const { w, h } = this, st = this.cfg.style, L = { style: st };
    if (st === 'glass') {
      L.oh = h * 0.07; L.gT = h * 0.6; L.gD = h * 0.07; L.pT = L.gT + L.gD;
      // seen from the captain's (left) seat: the centre post is right of straight ahead
      const t = L.oh + h * 0.02, post = w * 0.011, c = w * 0.66;
      L.windows = [
        [[w * 0.07, t], [c - post, t], [c - post, L.gT], [w * 0.11, L.gT]],
        [[c + post, t], [w * 0.955, t], [w * 0.93, L.gT], [c + post, L.gT]],
        [[0, L.oh + h * 0.11], [w * 0.035, t + h * 0.01], [w * 0.075, L.gT], [0, L.gT]],
      ];
      const ph = h - L.pT, narrow = w < 760, n = narrow ? 3 : 5;
      const gapK = 0.1;
      const s = Math.min(ph * 0.74, (w * 0.95) / (n + (n - 1) * gapK));
      const gap = s * gapK, total = n * s + (n - 1) * gap;
      const x0 = (w - total) / 2, y0 = L.pT + ph * 0.07;
      L.s = s; L.y0 = y0; L.at = i => x0 + i * (s + gap); L.n = n; L.narrow = narrow;
      L.eic = narrow ? { x: L.at(2), y: y0, w: s, h: s } : { x: L.at(2), y: y0, w: s, h: s * 0.62 };
      L.quad = narrow ? null : { x: L.at(2) + s * 0.12, y: y0 + s * 0.72, w: s * 0.76, h: h - (y0 + s * 0.72) + s * 0.1 };
      L.mcp = { w: Math.min(w * 0.46, 560), h: L.gD * 0.62 }; L.mcp.x = w / 2 - L.mcp.w / 2; L.mcp.y = L.gT + L.gD * 0.22;
    } else if (st === 'fighter') {
      L.gT = h * 0.67; L.gD = h * 0.05; L.pT = L.gT + L.gD;
      L.windows = [[[0, 0], [w, 0], [w, L.gT], [0, L.gT]]];
      const hs = L.hs = Math.min(h * 0.42, w * 0.36);
      L.hx = w / 2 - hs / 2; L.hy = L.gT - hs * 1.02;
      const ph = h - L.pT;
      const m = L.m = Math.min(ph * 0.66, w * 0.2);
      L.my = L.pT + ph * 0.12;
      L.ufc = { w: Math.min(hs * 0.62, w * 0.24), h: ph * 0.5 }; L.ufc.x = w / 2 - L.ufc.w / 2; L.ufc.y = L.pT + ph * 0.06;
      L.lx = Math.max(m * 0.15, L.ufc.x - m * 1.3); L.rx = Math.min(w - m * 1.15, L.ufc.x + L.ufc.w + m * 0.3);
    } else if (st === 'glider') {
      L.gT = h * 0.74; L.gD = h * 0.03; L.pT = L.gT + L.gD;
      L.windows = [[[0, 0], [w, 0], [w, L.gT], [0, L.gT]]];
    } else {
      L.gT = h * 0.62; L.gD = h * 0.05; L.pT = L.gT + L.gD;
      L.windows = [[[w * 0.07, h * 0.05], [w * 0.93, h * 0.05], [w * 0.985, L.gT], [w * 0.015, L.gT]]];
      const ph = h - L.pT;
      const r = L.r = Math.min(ph * 0.18, w * 0.058);
      L.gap = r * 2.45;
      L.cx = Math.max(L.gap + r * 1.4, w * 0.33);
      L.y1 = L.pT + ph * 0.1 + r * 1.15; L.y2 = L.y1 + L.gap;
      L.stack = { x: L.cx + L.gap + r * 1.5, y: L.pT + ph * 0.07, w: Math.min(r * 3.6, w * 0.2), h: ph * 0.8 };
      L.eng = { x: L.stack.x + L.stack.w + r * 1.1 };
    }
    return L;
  }

  // ---- static layer, drawn once per resize / aircraft
  buildStatic() {
    if (!this.bg) return;
    const g = this.bg.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const L = this.L = this.layout();
    const { w, h } = this, pc = this.cfg.panel;
    if (L.style === 'glass') {
      frameWithWindows(g, w, L.gT + 2, L.windows, '#2a2f36');
      // overhead panel: rows of switches and annunciators
      panelFill(g, 0, 0, w, L.oh, '#3d444d');
      const cols = Math.floor(w / 46);
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * (w / cols);
        if (i % 7 === 3) { g.fillStyle = '#7c2d12'; rrect(g, x - 10, L.oh * 0.25, 20, L.oh * 0.3, 2); g.fill(); continue; }
        toggle(g, x, L.oh * 0.62, Math.min(7, L.oh * 0.14), i % 3 !== 0);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - 8, L.oh * 0.18, 16, 1.5);
      }
      g.fillStyle = '#0a0b0d'; g.fillRect(0, L.oh - 3, w, 3);
      glareshield(g, w, L.gT, L.gD);
      // MCP on the glareshield
      const M = L.mcp;
      panelFill(g, M.x, M.y, M.w, M.h, '#6a727d');
      g.strokeStyle = '#1c1f24'; g.lineWidth = 1.5; g.strokeRect(M.x, M.y, M.w, M.h);
      const labels = ['IAS', 'HDG', 'ALT', 'V/S'];
      labels.forEach((lb, i) => {
        const fx = M.x + M.w * (i + 0.5) / 4;
        text(g, lb, fx - M.w * 0.075, M.y + M.h * 0.2, M.h * 0.22, '#f4f6f8', 'center', 700);
        g.fillStyle = '#050505'; g.fillRect(fx - M.w * 0.09, M.y + M.h * 0.36, M.w * 0.13, M.h * 0.42);
        knob(g, fx + M.w * 0.085, M.y + M.h * 0.55, M.h * 0.24);
      });
      // EFIS control panels at the ends of the glareshield
      for (const ex of [w * 0.06, w * 0.94 - Math.min(w * 0.14, 150)]) {
        const ew = Math.min(w * 0.14, 150);
        panelFill(g, ex, M.y, ew, M.h, '#6a727d');
        knob(g, ex + ew * 0.25, M.y + M.h * 0.52, M.h * 0.26); knob(g, ex + ew * 0.72, M.y + M.h * 0.52, M.h * 0.26);
        g.strokeStyle = '#1c1f24'; g.strokeRect(ex, M.y, ew, M.h);
      }
      // main panel
      panelFill(g, 0, L.pT, w, h - L.pT, pc === '#1f2933' ? '#4b535d' : pc);
      for (let i = 0; i < L.n; i++) {
        if (i === 2) duBezel(g, L.eic.x, L.eic.y, L.eic.w, L.eic.h, 0);
        else duBezel(g, L.at(i), L.y0, L.s, L.s, 5);
      }
      if (L.quad) {
        const Q = L.quad;
        g.fillStyle = '#1a1d21'; rrect(g, Q.x, Q.y, Q.w, Q.h, 6); g.fill();
        text(g, this.engine === 'prop' ? 'POWER' : 'THRUST', Q.x + Q.w / 2, Q.y + Q.h * 0.06 + 6, Math.max(8, Q.w * 0.05), '#9aa1ab');
      }
    } else if (L.style === 'fighter') {
      // canopy sills
      for (const sx of [0, w]) {
        const dir = sx ? -1 : 1;
        g.beginPath(); g.moveTo(sx, h * 0.18); g.quadraticCurveTo(sx + dir * w * 0.03, h * 0.45, sx + dir * w * 0.07, L.gT); g.lineTo(sx, L.gT); g.closePath();
        g.fillStyle = '#16191d'; g.fill();
      }
      glareshield(g, w, L.gT, L.gD);
      panelFill(g, 0, L.pT, w, h - L.pT, '#3c4248');
      // HUD frame and glass
      const { hx, hy, hs } = L;
      const tg = g.createLinearGradient(hx, hy, hx + hs, hy + hs);
      tg.addColorStop(0, 'rgba(150,255,190,.07)'); tg.addColorStop(0.5, 'rgba(150,200,255,.03)'); tg.addColorStop(1, 'rgba(150,255,190,.06)');
      g.fillStyle = tg; g.fillRect(hx, hy, hs, hs * 0.97);
      g.fillStyle = '#111418';
      g.fillRect(hx - hs * 0.03, hy - hs * 0.02, hs * 1.06, hs * 0.03);
      poly(g, [[hx - hs * 0.03, hy], [hx, hy], [hx + hs * 0.06, L.gT], [hx + hs * 0.01, L.gT]], '#111418');
      poly(g, [[hx + hs * 1.03, hy], [hx + hs, hy], [hx + hs * 0.94, L.gT], [hx + hs * 0.99, L.gT]], '#111418');
      g.fillStyle = '#0b0d10'; rrect(g, hx + hs * 0.02, L.gT - hs * 0.06, hs * 0.96, hs * 0.09, 4); g.fill();
      // UFC: keypad and data entry display
      const U = L.ufc;
      g.fillStyle = '#1b1e22'; rrect(g, U.x, U.y, U.w, U.h, 6); g.fill();
      g.fillStyle = '#020403'; g.fillRect(U.x + U.w * 0.08, U.y + U.h * 0.06, U.w * 0.84, U.h * 0.3);
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'RCL', '0', 'ENTR'];
      const kw = U.w * 0.24, kh = U.h * 0.11;
      keys.forEach((k, i) => button(g, U.x + U.w * 0.1 + (i % 3) * U.w * 0.28, U.y + U.h * 0.42 + Math.floor(i / 3) * kh * 1.25, kw, kh, k));
      mfdBezel(g, L.lx, L.my, L.m); mfdBezel(g, L.rx, L.my, L.m);
      // throttle quadrant on the left console
      g.fillStyle = '#16191d'; rrect(g, w * 0.02, h * 0.86, w * 0.1, h * 0.2, 6); g.fill();
    } else if (L.style === 'glider') {
      g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = Math.max(3, h * 0.008);
      g.beginPath(); g.ellipse(w / 2, h * 1.05, w * 0.62, h * 1.0, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      glareshield(g, w, L.gT, L.gD);
      panelFill(g, 0, L.pT, w, h - L.pT, pc);
    } else {
      frameWithWindows(g, w, L.gT + 2, L.windows, '#1f2328');
      // wet compass on the centre strut
      g.fillStyle = '#111316'; g.fillRect(w / 2 - 3, 0, 6, h * 0.05);
      glareshield(g, w, L.gT, L.gD);
      panelFill(g, 0, L.pT, w, h - L.pT, pc);
      // avionics stack
      const S = L.stack;
      g.fillStyle = '#0d0f12'; rrect(g, S.x, S.y, S.w, S.h, 4); g.fill();
      const unit = S.h / 5;
      for (let i = 0; i < 5; i++) {
        const uy = S.y + i * unit + unit * 0.08;
        g.fillStyle = '#25292e'; rrect(g, S.x + 3, uy, S.w - 6, unit * 0.84, 3); g.fill();
        if (i !== 2) { g.fillStyle = '#030405'; g.fillRect(S.x + S.w * 0.22, uy + unit * 0.18, S.w * 0.56, unit * 0.48); }
        knob(g, S.x + S.w * 0.1, uy + unit * 0.42, unit * 0.16); knob(g, S.x + S.w * 0.9, uy + unit * 0.42, unit * 0.16);
        if (i === 2) for (let b = 0; b < 6; b++) button(g, S.x + S.w * (0.2 + b * 0.105), uy + unit * 0.22, S.w * 0.09, unit * 0.4, '');
      }
      // switch row and key
      const sy = h - (h - L.pT) * 0.12;
      ['MSTR', 'BCN', 'LAND', 'TAXI', 'NAV', 'STRB'].forEach((lb, i) => {
        const sx = w * 0.04 + i * Math.min(42, w * 0.035);
        if (sx > L.cx - L.gap - L.r * 1.3) return;
        toggle(g, sx, sy, 7, i < 2 || i === 4);
        text(g, lb, sx, sy - 16, 8, '#c9ced6');
      });
      for (const [sx, sy2] of [[L.cx - L.gap * 1.6, L.y1 - L.r * 1.25], [L.cx + L.gap * 1.6, L.y1 - L.r * 1.25]]) screw(g, sx, sy2, 3);
    }
  }

  draw(s, inp, dt, nav) {
    const g = this.g, L = this.L;
    if (!L) return;
    g.clearRect(0, 0, this.w, this.h);
    for (let i = 0; i < this.n1.length; i++) {
      this.n1[i] += (s.throttle - this.n1[i]) * (1 - Math.exp(-dt * (1.2 + i * 0.15)));
    }
    if (dt > 0) { this._acc += ((s.speed - this._lastSpd) / dt - this._acc) * Math.min(1, dt * 2); this._lastSpd = s.speed; }
    const d = {
      s, inp, nav, gear: this.gear ?? 1, spd: s.speed * 3.6, alt: s.h, vs: s.vs, agl: s.agl, ground: s.ground, acc: this._acc,
      hdg: ((s.heading * R2D) % 360 + 360) % 360, pitch: s.pitch * R2D, roll: s.roll * R2D,
    };
    this.glass(dt, s.speed, s.onGround);
    g.drawImage(this.bg, 0, 0, this.w, this.h);
    if (L.style === 'glass') this.liveGlass(d);
    else if (L.style === 'fighter') this.liveFighter(d);
    else if (L.style === 'glider') this.liveGlider(d);
    else this.liveGA(d);
  }

  // ---- rain, snow and cloud moisture on the windscreen (under the frames)
  glass(dt, speed, onGround) {
    const { g, w, L } = this, wet = this.wet;
    const H = L.gT;
    const drops = this.drops;
    const air = clamp((speed - 12) / 70, 0, 1);               // airflow over the glass
    if (wet && wet.kind) {
      const rate = (wet.kind === 'snow' ? 45 : wet.kind === 'mist' ? 30 : 110) * wet.amount * (w / 1200) * (onGround ? 0.6 : 1);
      let n = rate * dt; while (n > 0 && drops.length < 450) {
        if (n < 1 && Math.random() > n) break; n--;
        const snow = wet.kind === 'snow', mist = wet.kind === 'mist';
        drops.push({ x: Math.random() * w, y: Math.random() * H, r: mist ? 0.7 + Math.random() * 1.1 : snow ? 1.5 + Math.random() * 3 : 1.1 + Math.random() * Math.random() * 4.2,
          age: 0, life: snow ? 1.5 + Math.random() * 3 : mist ? 2 + Math.random() * 2 : 4 + Math.random() * 12, snow, vx: 0, vy: 0 });
      }
    }
    if (!drops.length) return;
    const dark = wet?.dark || 0;
    g.save();
    g.beginPath(); for (const win of L.windows) roundPoly(g, win, 4); g.clip();
    g.globalAlpha = 1 - dark * 0.55;
    let j = 0;
    for (const p of drops) {
      p.age += dt;
      // the airstream pushes drops up and outwards; on the ground big drops run down
      const k = p.r / 3;
      if (air > 0.02) {
        p.vy += (-(60 + 260 * air) * k - p.vy) * Math.min(1, dt * 3);
        p.vx += (((p.x - w / 2) / (w / 2)) * 90 * air * k - p.vx) * Math.min(1, dt * 3);
      } else {
        p.vx *= 0.9; p.vy += ((p.r > 2.8 && !p.snow ? (p.r - 2.6) * 30 : 0) - p.vy) * Math.min(1, dt * 2);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const life = p.snow ? p.life * (1 - air * 0.7) : p.life * (1 - air * 0.5);
      if (p.age > life || p.y < -20 || p.y > H + 10 || p.x < -20 || p.x > w + 20) continue;
      drops[j++] = p;
      const fade = Math.min(1, (life - p.age) * 2, p.age * 6);
      const sp = this.sprites[p.snow ? 'snow' : 'rain'];
      const vlen = Math.hypot(p.vx, p.vy);
      g.globalAlpha = (1 - dark * 0.55) * fade;
      if (!p.snow && vlen > 40) {
        // a streak: the bead with a thin trail behind it
        const tl = Math.min(60, vlen * 0.12);
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
        g.drawImage(sp, -p.r * 0.7, -tl, p.r * 1.4, tl + p.r);
        g.restore();
      } else g.drawImage(sp, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    drops.length = j;
    g.restore();
  }

  liveGlass(d) {
    const { g, L } = this;
    const s = L.s;
    // MCP readouts
    const M = L.mcp;
    const vals = [Math.round(d.spd), String(Math.round(d.hdg) % 360).padStart(3, '0'), Math.round(d.alt / 10) * 10, `${d.vs >= 0 ? '+' : ''}${Math.round(d.vs)}`];
    vals.forEach((v, i) => {
      const fx = M.x + M.w * (i + 0.5) / 4;
      text(g, String(v), fx - M.w * 0.025, M.y + M.h * 0.575, M.h * 0.32, '#ffb347', 'center', 700);
    });
    if (L.narrow) {
      pfd(g, L.at(0), L.y0, s, d, this.vmax, this.vstall);
      nd(g, L.at(1), L.y0, s, d, d.nav, this.wind);
      eicas(g, L.eic.x, L.eic.y, L.eic.w, L.eic.h, d, this.n1, this.engine);
    } else {
      pfd(g, L.at(0), L.y0, s, d, this.vmax, this.vstall);
      nd(g, L.at(1), L.y0, s, d, d.nav, this.wind);
      eicas(g, L.eic.x, L.eic.y, L.eic.w, L.eic.h, d, this.n1, this.engine);
      nd(g, L.at(3), L.y0, s, d, d.nav, this.wind);
      pfd(g, L.at(4), L.y0, s, d, this.vmax, this.vstall);
      const Q = L.quad;
      thrustLevers(g, Q.x, Q.y + Q.h * 0.14, Q.w, Q.h * 0.8, Math.min(4, this.n1.length), d.s.throttle, this.engine === 'prop');
    }
    // screen glare
    const yr = s * 0.24;
    yokeAirliner(g, L.at(0) + s * 0.5, this.h + yr * 0.2, yr, d.inp);
    if (!L.narrow) yokeAirliner(g, L.at(4) + s * 0.5, this.h + yr * 0.2, yr, d.inp);
  }

  liveFighter(d) {
    const { g, L, w, h } = this;
    const { hx, hy, hs } = L;
    const C = '#7dff9a';
    const cx = w / 2, cy = hy + hs * 0.48, k = hs * 0.018;
    g.save(); g.beginPath(); g.rect(hx, hy, hs, hs * 0.92); g.clip();
    g.shadowColor = C; g.shadowBlur = 5;
    g.strokeStyle = C; g.lineWidth = Math.max(1.2, hs * 0.005);
    g.save(); g.translate(cx, cy); g.rotate(-d.roll / R2D);
    for (let p = -40; p <= 40; p += 5) {
      const yy = -(p - d.pitch) * k;
      if (Math.abs(yy) > hs) continue;
      const L2 = p === 0 ? hs * 0.45 : hs * 0.12, gapc = hs * 0.07;
      if (p < 0) g.setLineDash([hs * 0.02, hs * 0.015]);
      line(g, -gapc - L2, yy, -gapc, yy); line(g, gapc, yy, gapc + L2, yy);
      g.setLineDash([]);
      if (p !== 0) {
        line(g, -gapc - L2, yy, -gapc - L2, yy + (p > 0 ? hs * 0.02 : -hs * 0.02));
        line(g, gapc + L2, yy, gapc + L2, yy + (p > 0 ? hs * 0.02 : -hs * 0.02));
        text(g, String(Math.abs(p)), gapc + L2 + hs * 0.035, yy, hs * 0.032, C);
      }
    }
    g.restore();
    // flight path marker displaced by vertical speed
    const gamma = Math.atan2(d.vs, Math.max(1, d.s.speed)) * R2D;
    const fpm = cy - clamp(gamma - d.pitch, -14, 14) * k;
    circle(g, cx, fpm, hs * 0.02); g.stroke();
    line(g, cx - hs * 0.055, fpm, cx - hs * 0.02, fpm); line(g, cx + hs * 0.02, fpm, cx + hs * 0.055, fpm); line(g, cx, fpm - hs * 0.02, cx, fpm - hs * 0.04);
    // gun cross
    line(g, cx - hs * 0.015, hy + hs * 0.2, cx + hs * 0.015, hy + hs * 0.2); line(g, cx, hy + hs * 0.185, cx, hy + hs * 0.215);
    // speed and altitude scales
    const sx = hx + hs * 0.14, ax = hx + hs * 0.86;
    for (const [px, val, step, right] of [[sx, d.spd, 20, false], [ax, d.alt, 100, true]]) {
      g.save(); g.beginPath(); g.rect(px - hs * 0.08, cy - hs * 0.25, hs * 0.16, hs * 0.5); g.clip();
      for (let v = Math.floor((val - step * 6) / step) * step; v <= val + step * 6; v += step) {
        const yy = cy - (v - val) * (hs * 0.04 / step);
        line(g, px + (right ? -hs * 0.06 : hs * 0.04), yy, px + (right ? -hs * 0.04 : hs * 0.06), yy);
        if (v % (step * 2) === 0 && Math.abs(yy - cy) > hs * 0.04) text(g, String(v), px + (right ? hs * 0.0 : -hs * 0.0), yy, hs * 0.028, C);
      }
      g.restore();
      g.strokeRect(px - hs * 0.055, cy - hs * 0.025, hs * 0.11, hs * 0.05);
      text(g, String(Math.round(val)), px, cy, hs * 0.036, C, 'center', 700);
    }
    text(g, `M ${(d.spd / 1225).toFixed(2)}`, sx, cy + hs * 0.3, hs * 0.03, C);
    text(g, `G ${(1 + Math.abs(d.inp.pitch) * 3 * Math.min(1, d.s.speed / 150)).toFixed(1)}`, sx, hy + hs * 0.12, hs * 0.03, C);
    text(g, `${d.vs >= 0 ? '+' : ''}${Math.round(d.vs)}`, ax, cy + hs * 0.3, hs * 0.03, C);
    if (Number.isFinite(d.agl) && d.agl < 1500) text(g, `${Math.max(0, Math.round(d.agl))}R`, ax, cy + hs * 0.35, hs * 0.03, C);
    text(g, `THR ${Math.round(d.s.throttle * 100)}`, sx, hy + hs * 0.86, hs * 0.03, C);
    if (d.s.stalled) text(g, 'STALL', cx, hy + hs * 0.78, hs * 0.05, C, 'center', 800);
    // heading tape
    const ty = hy + hs * 0.06;
    for (let hd = Math.floor((d.hdg - 30) / 5) * 5; hd <= d.hdg + 30; hd += 5) {
      const xx = cx + (hd - d.hdg) * hs * 0.012;
      line(g, xx, ty, xx, ty + (hd % 10 ? hs * 0.015 : hs * 0.03));
      if (hd % 10 === 0) text(g, String((((hd % 360) + 360) % 360) / 10 | 0).padStart(2, '0'), xx, ty - hs * 0.022, hs * 0.028, C);
    }
    poly(g, [[cx, ty + hs * 0.042], [cx - hs * 0.012, ty + hs * 0.062], [cx + hs * 0.012, ty + hs * 0.062]], C);
    if (d.nav) {
      const xx = clamp(cx + d.nav.rel * R2D * hs * 0.012, hx + hs * 0.05, hx + hs * 0.95);
      g.strokeRect(xx - hs * 0.015, ty + hs * 0.08, hs * 0.03, hs * 0.03);
    }
    g.restore();

    // DED text on the UFC
    const U = L.ufc, dy = U.y + U.h * 0.06, dh = U.h * 0.3, fs = Math.max(7, dh * 0.2);
    const ded = [`UHF 305.00  STPT 1`, `HDG ${String(Math.round(d.hdg) % 360).padStart(3, '0')}  ALT ${Math.round(d.alt)}`, `CAS ${Math.round(d.spd)}  THR ${Math.round(d.s.throttle * 100)}`];
    g.save(); g.shadowColor = '#3ef06a'; g.shadowBlur = 3;
    ded.forEach((t, i) => text(g, t, U.x + U.w * 0.12, dy + dh * (0.22 + i * 0.29), fs, '#5dff7e', 'left', 600));
    g.restore();
    // MFDs: engine page left, horizontal situation right
    eicas(g, L.lx, L.my, L.m, L.m, d, this.n1, this.engine);
    nd(g, L.rx, L.my, L.m, d, d.nav, this.wind);
    // standby instruments left of the left MFD
    const sr = Math.min(L.m * 0.2, (L.lx - w * 0.15) / 2.6);
    if (sr > 14) {
      const sxx = L.lx - L.m * 0.12 - sr * 1.25;
      asi(g, sxx, L.my + sr * 1.15, sr, d.spd, this.vmax, this.vstall);
      attitudeDial(g, sxx, L.my + sr * 3.55, sr, d.pitch, d.roll);
      if (sxx - sr * 2.5 > w * 0.12) altimeter(g, sxx - sr * 2.5, L.my + sr * 1.15, sr, d.alt);
    }
    // throttle (left console) and side stick (right console)
    const tq = clamp(d.s.throttle, 0, 1);
    g.fillStyle = '#26292e'; rrect(g, w * 0.045, h * 0.9 - tq * h * 0.05, w * 0.05, h * 0.07, 6); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    sideStick(g, Math.min(w - 50, L.rx + L.m * 0.95), h + 8, Math.min((h - L.pT) * 0.32, 60), d.inp);
  }

  liveGlider(d) {
    const { g, L, w, h } = this;
    const sx = w / 2, sy = h * 0.06;
    const dev = clamp(-d.inp.yaw * 0.8 + d.roll / 120, -1, 1) * w * 0.03;
    g.strokeStyle = '#ef4444'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + dev * 0.3, sy + h * 0.05, sx + dev, sy + h * 0.1); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = 'rgba(226,232,240,.8)'; g.fillRect(sx - 8, sy - 3, 16, 6);
    const ph = h - L.pT;
    const r = Math.min(ph * 0.3, w * 0.07);
    const y = L.pT + ph * 0.18 + r;
    asi(g, w / 2 - r * 2.5, y, r, d.spd, this.vmax, this.vstall);
    altimeter(g, w / 2, y, r, d.alt);
    vsiDial(g, w / 2 + r * 2.5, y, r, d.vs, 5);
    text(g, 'VARIO', w / 2 + r * 2.5, y - r * 1.3, r * 0.2, '#9ca3af');
    stick(g, w / 2, h + r * 0.4, r * 0.8, d.inp);
  }

  liveGA(d) {
    const { g, L, w, h } = this;
    const { r, gap, cx, y1, y2 } = L;
    text(g, `${String(Math.round(d.hdg) % 360).padStart(3, '0')}`, w / 2, h * 0.035, Math.min(16, w * 0.02), '#fbbf24', 'center', 700);
    asi(g, cx - gap, y1, r, d.spd, this.vmax, this.vstall);
    attitudeDial(g, cx, y1, r, d.pitch, d.roll);
    altimeter(g, cx + gap, y1, r, d.alt);
    turnDial(g, cx - gap, y2, r, d.roll, d.inp.yaw);
    headingDial(g, cx, y2, r, d.hdg);
    vsiDial(g, cx + gap, y2, r, d.vs);
    // avionics: COM/NAV, GPS, audio, transponder
    const S = L.stack, unit = S.h / 5, fs = Math.max(8, unit * 0.22);
    const lcd = (i, str, c) => text(g, str, S.x + S.w / 2, S.y + i * unit + unit * 0.08 + unit * 0.42, fs, c, 'center', 700);
    lcd(0, '118.700  121.500', GRN);
    lcd(1, '110.50   113.90', GRN);
    lcd(3, `GPS  GS ${Math.round(d.spd / 1.852)}KT  TRK ${String(Math.round(d.hdg) % 360).padStart(3, '0')}`, '#e5e7eb');
    lcd(4, `XPDR 7000  ALT ${Math.round(d.alt * 3.281 / 100)}`, AMB);
    // engine gauges
    const ex = L.eng.x, er = r * 0.62;
    if (ex + er < w) {
      smallGauge(g, ex, y1, er, this.n1[0], 'RPM', String(Math.round(700 + this.n1[0] * 2000)));
      smallGauge(g, ex, y2, er, 0.7, 'FUEL', '70%', '#38bdf8');
    }
    // throttle (black plunger) and mixture (red), pushed in with power
    const kx = S.x + S.w * 0.3, ky = h - (h - L.pT) * 0.1;
    const push = d.s.throttle * r * 0.5;
    g.fillStyle = '#9ca3af'; g.fillRect(kx - 2, ky - r * 0.1, 4, r * 0.6 - push);
    knob(g, kx, ky + r * 0.5 - push, r * 0.22, '#111');
    g.fillStyle = '#9ca3af'; g.fillRect(kx + r * 0.9 - 2, ky - r * 0.1, 4, r * 0.1);
    knob(g, kx + r * 0.9, ky, r * 0.2, '#991b1b');
    yokeGA(g, cx, h + r * 0.12, r, d.inp);
  }
}
