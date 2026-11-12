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

// ---------------------------------------------------------------- glass displays
function screen(g, x, y, s) {
  g.fillStyle = '#0b0d10'; rrect(g, x - s * 0.04, y - s * 0.04, s * 1.08, s * 1.08, s * 0.05); g.fill();
  g.fillStyle = '#020306'; rrect(g, x, y, s, s, s * 0.02); g.fill();
}

function pfd(g, x, y, s, d, vmax, vstall) {
  screen(g, x, y, s);
  const ax = x + s * 0.2, aw = s * 0.6, ay = y + s * 0.06, ah = s * 0.72;
  const cx = ax + aw / 2, cy = ay + ah / 2;
  // attitude
  g.save(); g.beginPath(); g.rect(ax, ay, aw, ah); g.clip();
  g.translate(cx, cy); g.rotate(-d.roll / R2D);
  const k = ah * 0.012, py = d.pitch * k;
  g.fillStyle = '#2a7de1'; g.fillRect(-aw * 2, -ah * 3 + py, aw * 4, ah * 3);
  g.fillStyle = '#7a4b25'; g.fillRect(-aw * 2, py, aw * 4, ah * 3);
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, s * 0.006);
  line(g, -aw * 2, py, aw * 2, py);
  for (let p = -30; p <= 30; p += 5) {
    if (!p) continue;
    const yy = py - p * k, L = p % 10 ? aw * 0.07 : aw * 0.16;
    line(g, -L, yy, L, yy);
    if (p % 10 === 0) { text(g, String(Math.abs(p)), -L - s * 0.04, yy, s * 0.04, '#fff'); text(g, String(Math.abs(p)), L + s * 0.04, yy, s * 0.04, '#fff'); }
  }
  g.restore();
  // roll pointer
  g.save(); g.translate(cx, cy); g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, s * 0.005);
  g.beginPath(); g.arc(0, 0, ah * 0.42, (-90 - 45) / R2D, (-90 + 45) / R2D); g.stroke();
  g.rotate(-d.roll / R2D);
  poly(g, [[0, -ah * 0.41], [-s * 0.02, -ah * 0.37], [s * 0.02, -ah * 0.37]], '#fff');
  g.restore();
  // aircraft symbol
  g.fillStyle = '#facc15'; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.fillRect(cx - aw * 0.34, cy - s * 0.01, aw * 0.22, s * 0.02);
  g.fillRect(cx + aw * 0.12, cy - s * 0.01, aw * 0.22, s * 0.02);
  g.fillRect(cx - s * 0.012, cy - s * 0.012, s * 0.024, s * 0.024);

  // speed tape
  const tx = x + s * 0.025, tw = s * 0.15, pp = ah * 0.0035;
  g.save(); g.beginPath(); g.rect(tx, ay, tw, ah); g.clip();
  g.fillStyle = '#3b4048'; g.fillRect(tx, ay, tw, ah);
  const vy = v => cy - (v - d.spd) * pp;
  g.fillStyle = '#dc2626'; g.fillRect(tx + tw - s * 0.015, vy(vstall), s * 0.015, ah);
  g.strokeStyle = '#fff'; g.lineWidth = 1;
  for (let v = Math.floor((d.spd - 150) / 10) * 10; v <= d.spd + 150; v += 10) {
    if (v < 0) continue;
    line(g, tx + tw - s * (v % 50 ? 0.02 : 0.04), vy(v), tx + tw, vy(v));
    if (v % 50 === 0) text(g, String(v), tx + tw * 0.42, vy(v), s * 0.042, '#fff');
  }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = '#fff'; rrect(g, tx - s * 0.005, cy - s * 0.04, tw + s * 0.01, s * 0.08, s * 0.01); g.fill(); g.stroke();
  text(g, String(Math.round(d.spd)), tx + tw / 2, cy, s * 0.055, '#fff');
  text(g, 'KM/H', tx + tw / 2, ay + ah + s * 0.04, s * 0.035, '#38bdf8');

  // altitude tape
  const bx = ax + aw + s * 0.025, bw = s * 0.15, pa = ah * 0.003;
  g.save(); g.beginPath(); g.rect(bx, ay, bw, ah); g.clip();
  g.fillStyle = '#3b4048'; g.fillRect(bx, ay, bw, ah);
  const ay2 = a => cy - (a - d.alt) * pa;
  g.strokeStyle = '#fff';
  for (let a = Math.floor((d.alt - 200) / 20) * 20; a <= d.alt + 200; a += 20) {
    line(g, bx, ay2(a), bx + s * (a % 100 ? 0.02 : 0.04), ay2(a));
    if (a % 100 === 0) text(g, String(a), bx + bw * 0.6, ay2(a), s * 0.04, '#fff');
  }
  if (Number.isFinite(d.ground)) { g.fillStyle = 'rgba(180,83,9,.6)'; g.fillRect(bx, ay2(d.ground), bw, ah); }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = '#fff'; rrect(g, bx - s * 0.005, cy - s * 0.04, bw + s * 0.01, s * 0.08, s * 0.01); g.fill(); g.stroke();
  text(g, String(Math.round(d.alt)), bx + bw / 2, cy, s * 0.05, '#fff');
  text(g, `${d.vs >= 0 ? '+' : ''}${d.vs.toFixed(1)}`, bx + bw / 2, ay + ah + s * 0.04, s * 0.038, d.vs < -8 ? '#f87171' : '#4ade80');

  // heading strip
  const hy = ay + ah + s * 0.08, hh = s * 0.12, ph = s * 0.007;
  g.save(); g.beginPath(); g.rect(ax, hy, aw, hh); g.clip();
  g.fillStyle = '#1f2937'; g.fillRect(ax, hy, aw, hh);
  g.strokeStyle = '#fff';
  for (let h = Math.floor((d.hdg - 50) / 5) * 5; h <= d.hdg + 50; h += 5) {
    const hx = cx + (h - d.hdg) * ph * (aw / (s * 0.6));
    line(g, hx, hy, hx, hy + (h % 10 ? hh * 0.18 : hh * 0.32));
    if (h % 10 === 0) text(g, String(((h % 360) + 360) % 360 / 10 | 0), hx, hy + hh * 0.66, s * 0.04, '#fff');
  }
  g.restore();
  poly(g, [[cx, hy + hh * 0.3], [cx - s * 0.02, hy], [cx + s * 0.02, hy]], '#facc15');
}

function nd(g, x, y, s, d, nav) {
  screen(g, x, y, s);
  const cx = x + s / 2, cy = y + s * 0.8, R = s * 0.64;
  g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
  g.translate(cx, cy); g.rotate(-d.hdg / R2D);
  g.strokeStyle = '#e5e7eb';
  for (let i = 0; i < 72; i++) {
    g.save(); g.rotate((i * 5) / R2D);
    g.lineWidth = i % 2 ? 0.8 : 1.4;
    line(g, 0, -R, 0, -R + (i % 2 ? s * 0.02 : s * 0.04));
    if (i % 6 === 0) text(g, String(i / 2), 0, -R + s * 0.08, s * 0.045, '#e5e7eb');
    g.restore();
  }
  g.restore();
  g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
  g.setLineDash([3, 4]); g.strokeStyle = 'rgba(229,231,235,.45)'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R * 0.5, Math.PI, TAU); g.stroke(); g.setLineDash([]);
  // next ring as a magenta waypoint
  if (nav) {
    const dpx = Math.min(R, (nav.dist / 5000) * R);
    const px = cx + Math.sin(nav.rel) * dpx, py = cy - Math.cos(nav.rel) * dpx;
    g.strokeStyle = '#e879f9'; g.lineWidth = 1.5; line(g, cx, cy, px, py);
    circle(g, px, py, s * 0.025); g.fillStyle = '#e879f9'; g.fill();
    text(g, `${(nav.dist / 1000).toFixed(1)} KM`, x + s * 0.95, y + s * 0.08, s * 0.045, '#e879f9', 'right');
  }
  g.restore();
  // own aircraft
  g.strokeStyle = '#facc15'; g.lineWidth = Math.max(1.5, s * 0.012);
  line(g, cx, cy - s * 0.05, cx, cy + s * 0.04); line(g, cx - s * 0.04, cy - s * 0.01, cx + s * 0.04, cy - s * 0.01);
  // heading box
  g.fillStyle = '#000'; g.strokeStyle = '#fff'; g.lineWidth = 1;
  rrect(g, cx - s * 0.08, y + s * 0.03, s * 0.16, s * 0.08, s * 0.01); g.fill(); g.stroke();
  text(g, String(Math.round(((d.hdg % 360) + 360) % 360)).padStart(3, '0'), cx, y + s * 0.07, s * 0.05, '#fff');
  text(g, `GS ${Math.round(d.spd)}`, x + s * 0.05, y + s * 0.08, s * 0.045, '#4ade80', 'left');
  text(g, '5 KM', x + s * 0.05, y + s * 0.95, s * 0.04, '#9ca3af', 'left');
}

function eicas(g, x, y, s, d, n1, eng) {
  screen(g, x, y, s);
  const n = n1.length;
  const cols = Math.min(n, 4);
  const r = Math.min(s / (cols * 2) * 0.72, s * 0.15);
  for (let i = 0; i < n; i++) {
    const cx = x + s * (i + 0.5) / cols, cy = y + s * 0.24;
    const v = eng === 'none' ? 0 : n1[i];
    const a0 = Math.PI, a1 = Math.PI * 1.85;
    g.lineWidth = r * 0.16; g.strokeStyle = '#334155';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    g.strokeStyle = v > 0.95 ? '#f59e0b' : '#22c55e';
    g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * v); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, r * 0.06);
    const a = a0 + (a1 - a0) * v;
    line(g, cx, cy, cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05);
    text(g, (v * 100).toFixed(1), cx, cy + r * 0.45, r * 0.5, '#fff');
  }
  text(g, eng === 'prop' ? 'TQ %' : 'N1 %', x + s / 2, y + s * 0.07, s * 0.045, '#38bdf8');
  const lines = [
    [`THR ${Math.round(d.s.throttle * 100)}%`, '#e5e7eb'],
    [d.s.onGround || d.agl < 300 ? 'GEAR ▼▼▼' : 'GEAR UP', d.s.onGround || d.agl < 300 ? '#4ade80' : '#9ca3af'],
    [d.s.stalled ? 'STALL' : d.inp.brake ? 'SPD BRK' : 'NORMAL', d.s.stalled ? '#f87171' : d.inp.brake ? '#f59e0b' : '#4ade80'],
    [`AGL ${Number.isFinite(d.agl) ? Math.max(0, Math.round(d.agl)) : '---'}`, '#e5e7eb'],
  ];
  lines.forEach(([str, c], i) => text(g, str, x + s * 0.08, y + s * (0.52 + i * 0.11), s * 0.055, c, 'left'));
}

// ---------------------------------------------------------------- cockpit class
export class Cockpit {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.cfg = { style: 'ga', engines: 1, panel: '#2b2f36' };
    this.vmax = 300; this.vstall = 100; this.engine = 'prop';
    this.n1 = [0];
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  configure(ac, topKmh) {
    this.cfg = { style: 'ga', engines: 1, panel: '#2b2f36', ...ac.cockpit };
    this.vmax = Math.max(200, Math.ceil((Math.max(topKmh, ac.phys.vStall * 3.6 * 3) * 1.15) / 50) * 50);
    this.vstall = ac.phys.vStall * 3.6;
    this.engine = ac.phys.engine;
    this.accent = ac.colors.a;
    this.n1 = new Array(this.cfg.engines).fill(0);
  }

  set visible(v) { this.cv.hidden = !v; }

  draw(s, inp, dt, nav) {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    for (let i = 0; i < this.n1.length; i++) {
      this.n1[i] += (s.throttle - this.n1[i]) * (1 - Math.exp(-dt * (1.2 + i * 0.15)));
    }
    const d = {
      s, inp, nav, spd: s.speed * 3.6, alt: s.h, vs: s.vs, agl: s.agl, ground: s.ground,
      hdg: ((s.heading * R2D) % 360 + 360) % 360, pitch: s.pitch * R2D, roll: s.roll * R2D,
    };
    const style = this.cfg.style;
    if (style === 'glass') this.drawGlass(d);
    else if (style === 'fighter') this.drawFighter(d);
    else if (style === 'glider') this.drawGlider(d);
    else this.drawGA(d);
  }

  panel(top, color) {
    const { g, w, h } = this;
    const ph = h - top;
    // glareshield
    g.beginPath(); g.moveTo(0, top + ph * 0.06);
    g.quadraticCurveTo(w * 0.5, top - ph * 0.1, w, top + ph * 0.06);
    g.lineTo(w, top + ph * 0.14); g.lineTo(0, top + ph * 0.14); g.closePath();
    g.fillStyle = '#0a0c0f'; g.fill();
    const gr = g.createLinearGradient(0, top, 0, h);
    gr.addColorStop(0, color); gr.addColorStop(1, '#0d0f12');
    g.fillStyle = gr; g.fillRect(0, top + ph * 0.1, w, ph);
  }

  // ---- general aviation: analog six-pack
  drawGA(d) {
    const { g, w, h } = this;
    const top = h * 0.64, ph = h - top;
    // windshield frame
    g.fillStyle = '#15181c';
    g.fillRect(0, 0, w, h * 0.045);
    poly(g, [[0, 0], [w * 0.08, 0], [w * 0.02, top], [0, top]], '#15181c');
    poly(g, [[w, 0], [w * 0.92, 0], [w * 0.98, top], [w, top]], '#15181c');
    // wet compass
    const cw = Math.min(90, w * 0.14);
    g.fillStyle = '#0c0d10'; rrect(g, w / 2 - cw / 2, h * 0.045, cw, cw * 0.38, 6); g.fill();
    text(g, `${String(Math.round(d.hdg)).padStart(3, '0')}°`, w / 2, h * 0.045 + cw * 0.19, cw * 0.2, '#fbbf24');
    this.panel(top, this.cfg.panel);

    const r = Math.min(ph * 0.19, w * 0.065);
    const gap = r * 2.4;
    const cx = Math.max(gap + r * 1.3, w * 0.36);
    const y1 = top + ph * 0.14 + r * 1.2, y2 = y1 + gap;
    asi(g, cx - gap, y1, r, d.spd, this.vmax, this.vstall);
    attitudeDial(g, cx, y1, r, d.pitch, d.roll);
    altimeter(g, cx + gap, y1, r, d.alt);
    turnDial(g, cx - gap, y2, r, d.roll, d.inp.yaw);
    headingDial(g, cx, y2, r, d.hdg);
    vsiDial(g, cx + gap, y2, r, d.vs);

    // engine + radios on the right if there is room
    const rx = cx + gap + r * 2.6;
    if (rx + r < w) {
      smallGauge(g, rx, y1, r * 0.72, this.n1[0], 'RPM', String(Math.round(700 + this.n1[0] * 2000)));
      smallGauge(g, rx, y2, r * 0.72, 0.7, 'FUEL', '70%', '#38bdf8');
      const sx = rx + r * 1.2, sw = Math.min(w - sx - r * 0.4, r * 3.4);
      if (sw > r * 1.6) {
        g.fillStyle = '#050607'; rrect(g, sx, y1 - r * 0.55, sw, r * 0.5, 4); g.fill(); rrect(g, sx, y1 + r * 0.1, sw, r * 0.5, 4); g.fill();
        text(g, '118.70  121.50', sx + sw / 2, y1 - r * 0.3, r * 0.2, '#22c55e');
        text(g, 'XPDR 7000', sx + sw / 2, y1 + r * 0.35, r * 0.2, '#f59e0b');
        // throttle lever
        const tx = sx + sw * 0.5, ty0 = y2 - r * 0.9, ty1 = y2 + r * 0.9;
        g.fillStyle = '#050607'; rrect(g, tx - r * 0.08, ty0, r * 0.16, ty1 - ty0, r * 0.08); g.fill();
        const ky = ty1 - (ty1 - ty0) * d.s.throttle;
        g.fillStyle = '#111'; circle(g, tx, ky, r * 0.22); g.fill();
        g.strokeStyle = '#6b7280'; g.lineWidth = 1.5; g.stroke();
        text(g, 'THR', tx + r * 0.5, ty0, r * 0.16, '#9ca3af', 'left');
      }
    }
    yoke(g, cx, h + r * 0.15, r, d.inp);
  }

  // ---- glider: minimal panel + yaw string
  drawGlider(d) {
    const { g, w, h } = this;
    const top = h * 0.74, ph = h - top;
    g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = Math.max(3, h * 0.008);
    g.beginPath(); g.ellipse(w / 2, h * 1.05, w * 0.62, h * 1.0, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    // yaw string taped to the canopy
    const sx = w / 2, sy = h * 0.06;
    const dev = clamp(-d.inp.yaw * 0.8 + d.roll / 120, -1, 1) * w * 0.03;
    g.strokeStyle = '#ef4444'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + dev * 0.3, sy + h * 0.05, sx + dev, sy + h * 0.1); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = 'rgba(226,232,240,.8)'; g.fillRect(sx - 8, sy - 3, 16, 6);
    this.panel(top, this.cfg.panel);
    const r = Math.min(ph * 0.3, w * 0.07);
    const y = top + ph * 0.18 + r;
    asi(g, w / 2 - r * 2.5, y, r, d.spd, this.vmax, this.vstall);
    altimeter(g, w / 2, y, r, d.alt);
    vsiDial(g, w / 2 + r * 2.5, y, r, d.vs, 5);
    text(g, 'VARIO', w / 2 + r * 2.5, y - r * 1.3, r * 0.2, '#9ca3af');
    stick(g, w / 2, h + r * 0.4, r * 0.8, d.inp);
  }

  // ---- airliner / jet: glass cockpit
  drawGlass(d) {
    const { g, w, h } = this;
    const top = h * 0.62, ph = h - top;
    g.fillStyle = '#262b32'; g.fillRect(0, 0, w, h * 0.07);
    g.fillStyle = '#1b1f25';
    for (let i = 0; i < 6; i++) g.fillRect(w * (0.1 + i * 0.14), h * 0.015, w * 0.1, h * 0.035);
    poly(g, [[w * 0.49, h * 0.07], [w * 0.51, h * 0.07], [w * 0.515, top], [w * 0.485, top]], '#1e2329');
    poly(g, [[0, h * 0.07], [w * 0.05, h * 0.07], [w * 0.1, top], [0, top]], '#1e2329');
    poly(g, [[w, h * 0.07], [w * 0.95, h * 0.07], [w * 0.9, top], [w, top]], '#1e2329');
    this.panel(top, this.cfg.panel);

    // flight control unit on the glareshield
    const fw = Math.min(w * 0.42, 420), fh = Math.max(18, ph * 0.08);
    g.fillStyle = '#3a4048'; rrect(g, w / 2 - fw / 2, top - fh * 0.2, fw, fh, 4); g.fill();
    const fields = [['SPD', Math.round(d.spd)], ['HDG', String(Math.round(d.hdg)).padStart(3, '0')], ['ALT', Math.round(d.alt / 10) * 10], ['V/S', d.vs.toFixed(0)]];
    fields.forEach(([k, v], i) => {
      const fx = w / 2 - fw / 2 + fw * (i + 0.5) / 4;
      g.fillStyle = '#0a0b0d'; g.fillRect(fx - fw * 0.1, top - fh * 0.1, fw * 0.2, fh * 0.8);
      text(g, `${k} ${v}`, fx, top + fh * 0.3, fh * 0.42, '#ffb347');
    });

    const narrow = w < 760;
    const count = narrow ? 3 : 5;
    const s = Math.min(ph * 0.72, (w * 0.94) / (count + (count - 1) * 0.1));
    const gap = s * 0.1;
    const total = count * s + (count - 1) * gap;
    const x0 = (w - total) / 2, y0 = top + ph * 0.18;
    const at = i => x0 + i * (s + gap);
    if (narrow) {
      pfd(g, at(0), y0, s, d, this.vmax, this.vstall);
      nd(g, at(1), y0, s, d, d.nav);
      eicas(g, at(2), y0, s, d, this.n1, this.engine);
    } else {
      pfd(g, at(0), y0, s, d, this.vmax, this.vstall);
      nd(g, at(1), y0, s, d, d.nav);
      eicas(g, at(2), y0, s, d, this.n1, this.engine);
      nd(g, at(3), y0, s, d, d.nav);
      pfd(g, at(4), y0, s, d, this.vmax, this.vstall);
    }
  }

  // ---- fighter: HUD combiner, MFDs, stick
  drawFighter(d) {
    const { g, w, h } = this;
    const top = h * 0.7, ph = h - top;
    // canopy bow
    g.strokeStyle = '#13161a'; g.lineWidth = Math.max(6, h * 0.022);
    g.beginPath(); g.ellipse(w / 2, h * 1.2, w * 0.78, h * 1.15, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    this.panel(top, this.cfg.panel);

    // HUD combiner glass
    const hs = Math.min(h * 0.44, w * 0.42);
    const hx = w / 2 - hs / 2, hy = top - hs * 0.95;
    g.fillStyle = 'rgba(120,200,255,0.05)'; g.fillRect(hx, hy, hs, hs);
    g.strokeStyle = '#1b1f24'; g.lineWidth = Math.max(3, hs * 0.015);
    line(g, hx, hy, hx + hs * 0.06, top); line(g, hx + hs, hy, hx + hs * 0.94, top); line(g, hx, hy, hx + hs, hy);

    const C = '#6dff8a';
    const cx = w / 2, cy = hy + hs * 0.48, k = hs * 0.018;
    g.save(); g.beginPath(); g.rect(hx, hy, hs, hs); g.clip();
    g.shadowColor = C; g.shadowBlur = 6;
    g.strokeStyle = C; g.lineWidth = Math.max(1.2, hs * 0.006);
    // pitch ladder
    g.save(); g.translate(cx, cy); g.rotate(-d.roll / R2D);
    for (let p = -40; p <= 40; p += 5) {
      const yy = -(p - d.pitch) * k;
      if (Math.abs(yy) > hs) continue;
      const L = p === 0 ? hs * 0.45 : hs * 0.13, gapc = hs * 0.07;
      if (p < 0) g.setLineDash([hs * 0.02, hs * 0.015]);
      line(g, -gapc - L, yy, -gapc, yy); line(g, gapc, yy, gapc + L, yy);
      g.setLineDash([]);
      if (p !== 0) {
        line(g, -gapc - L, yy, -gapc - L, yy + (p > 0 ? hs * 0.02 : -hs * 0.02));
        line(g, gapc + L, yy, gapc + L, yy + (p > 0 ? hs * 0.02 : -hs * 0.02));
        text(g, String(Math.abs(p)), gapc + L + hs * 0.035, yy, hs * 0.035, C);
      }
    }
    g.restore();
    // flight path marker (fixed boresight)
    circle(g, cx, cy, hs * 0.022); g.stroke();
    line(g, cx - hs * 0.06, cy, cx - hs * 0.022, cy); line(g, cx + hs * 0.022, cy, cx + hs * 0.06, cy); line(g, cx, cy - hs * 0.022, cx, cy - hs * 0.045);
    // speed / altitude boxes
    g.strokeRect(hx + hs * 0.05, cy - hs * 0.03, hs * 0.16, hs * 0.06);
    text(g, String(Math.round(d.spd)), hx + hs * 0.13, cy, hs * 0.04, C);
    g.strokeRect(hx + hs * 0.79, cy - hs * 0.03, hs * 0.16, hs * 0.06);
    text(g, String(Math.round(d.alt)), hx + hs * 0.87, cy, hs * 0.04, C);
    text(g, `M ${(d.spd / 1225).toFixed(2)}`, hx + hs * 0.13, cy + hs * 0.08, hs * 0.032, C);
    text(g, `${d.vs >= 0 ? '+' : ''}${Math.round(d.vs)}`, hx + hs * 0.87, cy + hs * 0.08, hs * 0.032, C);
    text(g, `THR ${Math.round(d.s.throttle * 100)}`, hx + hs * 0.13, hy + hs * 0.9, hs * 0.032, C);
    if (d.s.stalled) text(g, 'STALL', cx, hy + hs * 0.82, hs * 0.05, C);
    // heading tape
    const ty = hy + hs * 0.07;
    for (let hd = Math.floor((d.hdg - 30) / 5) * 5; hd <= d.hdg + 30; hd += 5) {
      const xx = cx + (hd - d.hdg) * hs * 0.012;
      line(g, xx, ty, xx, ty + (hd % 10 ? hs * 0.015 : hs * 0.03));
      if (hd % 10 === 0) text(g, String((((hd % 360) + 360) % 360) / 10 | 0).padStart(2, '0'), xx, ty - hs * 0.025, hs * 0.03, C);
    }
    poly(g, [[cx, ty + hs * 0.045], [cx - hs * 0.012, ty + hs * 0.065], [cx + hs * 0.012, ty + hs * 0.065]], C);
    // ring cue
    if (d.nav) {
      const xx = clamp(cx + d.nav.rel * R2D * hs * 0.012, hx + hs * 0.05, hx + hs * 0.95);
      g.strokeRect(xx - hs * 0.015, ty + hs * 0.08, hs * 0.03, hs * 0.03);
    }
    g.restore();

    // MFDs and up-front panel
    const m = Math.min(ph * 0.78, w * 0.24);
    const my = top + ph * 0.17;
    const lx = Math.max(m * 0.08, w / 2 - hs * 0.32 - m * 1.05), rxm = Math.min(w - m * 1.08, w / 2 + hs * 0.32 + m * 0.05);
    eicas(g, lx, my, m, d, this.n1, this.engine);
    nd(g, rxm, my, m, d, d.nav);
    const uw = Math.min(hs * 0.5, rxm - lx - m * 1.2);
    if (uw > 40) {
      g.fillStyle = '#0b0d10'; rrect(g, w / 2 - uw / 2, top + ph * 0.12, uw, ph * 0.22, 4); g.fill();
      text(g, `HDG ${String(Math.round(d.hdg)).padStart(3, '0')}  ALT ${Math.round(d.alt)}`, w / 2, top + ph * 0.23, Math.min(ph * 0.08, uw * 0.07), '#4ade80');
    }
    stick(g, w / 2, h + ph * 0.3, Math.min(ph * 0.35, 70), d.inp);
  }
}
