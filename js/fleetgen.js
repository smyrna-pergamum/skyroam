// Turns a real-world spec from fleet.js into a game aircraft: a smooth parametric 3D model
// (lofted elliptical fuselage, tapered airfoil wings and tail, nacelles, props, canopy, gear)
// plus a flight model, cockpit style and camera derived from the published figures.
//
// Body frame: +x forward, +y left, +z up, origin at the wing root quarter-chord.
// Part kinds understood by plane.js:
//   { s:'mesh', pos:[...], nrm:[...], idx:[...]|null }  geometry already in body coordinates
//   { s:'box' | 'cyl' | 'ell', d, p, r }                 Cesium primitives placed by a matrix
// Colour slots: p top, s belly, a accent/stripe, w wing, e engine, plus fixed k (dark), g (glass), m (metal).

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ liveries
const LIVERY = {
  'white-blue':   { p: '#f4f6f8', s: '#d5dbe2', a: '#1d4ed8', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-red':    { p: '#f4f6f8', s: '#d5dbe2', a: '#c8102e', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-green':  { p: '#f4f6f8', s: '#d5dbe2', a: '#15803d', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-orange': { p: '#f4f6f8', s: '#d5dbe2', a: '#ea580c', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-turq':   { p: '#f4f6f8', s: '#d5dbe2', a: '#0e9aa7', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-navy':   { p: '#f4f6f8', s: '#1e3a8a', a: '#1e3a8a', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'white-purple': { p: '#f4f6f8', s: '#d5dbe2', a: '#6d28d9', w: '#c6ccd4', e: '#e8ebef', tail: 'a' },
  'cargo':        { p: '#f2f2f0', s: '#9ca3af', a: '#b45309', w: '#b9bec5', e: '#d9dce0', tail: 'a' },
  'retro-airliner': { p: '#f8fafc', s: '#c0c4c8', a: '#b91c1c', w: '#c0c4c8', e: '#c0c4c8', tail: 'a' },
  'concorde':     { p: '#fbfbfb', s: '#f1f1f1', a: '#1e3a8a', w: '#f4f4f4', e: '#d9dce0', tail: 'a' },
  'bizjet':       { p: '#f8fafc', s: '#e2e8f0', a: '#334155', w: '#dfe4ea', e: '#e8ebef', tail: 'p' },
  'ga-white-red': { p: '#f8fafc', s: '#f8fafc', a: '#dc2626', w: '#f8fafc', e: '#f1f5f9', tail: 'p' },
  'ga-white-blue': { p: '#f8fafc', s: '#f8fafc', a: '#2563eb', w: '#f8fafc', e: '#f1f5f9', tail: 'p' },
  'ga-yellow':    { p: '#facc15', s: '#facc15', a: '#111827', w: '#facc15', e: '#facc15', tail: 'p' },
  'aerobatic':    { p: '#dc2626', s: '#f8fafc', a: '#111827', w: '#dc2626', e: '#dc2626', tail: 'p' },
  'glider':       { p: '#fbfbf8', s: '#fbfbf8', a: '#ef4444', w: '#fbfbf8', e: '#fbfbf8', tail: 'p' },
  'trainer':      { p: '#f8fafc', s: '#f8fafc', a: '#dc2626', w: '#f8fafc', e: '#f8fafc', tail: 'a' },
  'mil-grey':     { p: '#8c96a0', s: '#a9b2bb', a: '#5b636b', w: '#8c96a0', e: '#5b636b', tail: 'p', plain: true },
  'mil-darkgrey': { p: '#4b5563', s: '#6b7280', a: '#374151', w: '#4b5563', e: '#374151', tail: 'p', plain: true },
  'mil-green':    { p: '#4d5d3a', s: '#6b7a52', a: '#2f3a23', w: '#4d5d3a', e: '#3a4630', tail: 'p', plain: true },
  'mil-desert':   { p: '#c2a878', s: '#d6c29b', a: '#8b7355', w: '#c2a878', e: '#8b7355', tail: 'p', plain: true },
  'mil-navy':     { p: '#2b3a55', s: '#8c9aae', a: '#1c2638', w: '#2b3a55', e: '#1c2638', tail: 'p', plain: true },
  'navy-blue':    { p: '#1f3a5f', s: '#1f3a5f', a: '#f8fafc', w: '#1f3a5f', e: '#1f3a5f', tail: 'p', plain: true },
  'stealth':      { p: '#2a2d32', s: '#2a2d32', a: '#1b1d21', w: '#2a2d32', e: '#1b1d21', tail: 'p', plain: true },
  'turk-mil':     { p: '#6b7680', s: '#8a949c', a: '#c8102e', w: '#6b7680', e: '#4b5563', tail: 'p' },
  'turk-red':     { p: '#c8102e', s: '#f8fafc', a: '#f8fafc', w: '#c8102e', e: '#c8102e', tail: 'p' },
  'uav':          { p: '#b8bec4', s: '#d3d7db', a: '#6b7280', w: '#b8bec4', e: '#6b7280', tail: 'p', plain: true },
  'silver':       { p: '#c0c4c8', s: '#a8adb2', a: '#1f2937', w: '#c0c4c8', e: '#a8adb2', tail: 'p' },
  'natural':      { p: '#c9ced3', s: '#b5bbc1', a: '#374151', w: '#c9ced3', e: '#b5bbc1', tail: 'p' },
  'olive-drab':   { p: '#4b5320', s: '#8a8f7a', a: '#f8fafc', w: '#4b5320', e: '#3b4119', tail: 'p', plain: true },
  'raf-camo':     { p: '#5a5f3c', s: '#a8b5b0', a: '#6b4f2a', w: '#5a5f3c', e: '#4a4e31', tail: 'p', plain: true },
  'luftwaffe':    { p: '#5f6b5a', s: '#9fb3c8', a: '#e5c100', w: '#5f6b5a', e: '#4b5548', tail: 'p' },
  'red-baron':    { p: '#b91c1c', s: '#b91c1c', a: '#f8fafc', w: '#b91c1c', e: '#7f1d1d', tail: 'p', plain: true },
};

// ------------------------------------------------------------------ mesh builders
/** Lofted elliptical surface. secs: [{x, ry, rz, zc}], theta 0 = top, measured towards +y. */
function loft(secs, a0, a1, n, c, extra = {}) {
  const pos = [], nrm = [], idx = [];
  const m = secs.length;
  for (let i = 0; i < m; i++) {
    const S = secs[i], P = secs[Math.max(0, i - 1)], N = secs[Math.min(m - 1, i + 1)];
    const dx = (N.x - P.x) || 1e-6;
    const dry = (N.ry - P.ry) / dx, drz = (N.rz - P.rz) / dx, dzc = (N.zc - P.zc) / dx;
    for (let j = 0; j <= n; j++) {
      const th = (a0 + (a1 - a0) * j / n) * D2R;
      const s = Math.sin(th), co = Math.cos(th);
      pos.push(S.x, S.ry * s, S.zc + S.rz * co);
      let nx = -(S.ry * co * (dzc + drz * co) + S.rz * dry * s * s), ny = S.rz * s, nz = S.ry * co;
      if (S.ry < 1e-3 && S.rz < 1e-3) { nx = dx > 0 ? -1 : 1; ny = 0; nz = 0; }
      const L = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / L, ny / L, nz / L);
    }
  }
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + n + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { s: 'mesh', pos, nrm, idx, c, ...extra };
}

/** Flat-shaded triangle soup → mesh part. */
function soup(tris, c, extra = {}) {
  const pos = [], nrm = [];
  for (const [A, B, C] of tris) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    pos.push(...A, ...B, ...C);
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  return { s: 'mesh', pos, nrm, idx: null, c, ...extra };
}

const AIRFOIL = [[0, 0], [0.04, 0.42], [0.18, 0.62], [0.42, 0.52], [0.75, 0.22], [1, 0], [0.75, -0.1], [0.42, -0.24], [0.18, -0.3], [0.04, -0.22]];
const SYMFOIL = [[0, 0], [0.06, 0.45], [0.3, 0.55], [0.7, 0.3], [1, 0], [0.7, -0.3], [0.3, -0.55], [0.06, -0.45]];

/**
 * Tapered, swept lifting surface. root: LE point at the root. S: unit span direction, T: unit thickness
 * direction. Chord runs towards -x. th: thickness ratio.
 */
function panel(root, cr, ct, span, sweep, S, T, th, c, extra = {}, foil = AIRFOIL) {
  const back = Math.tan(sweep * D2R) * span;
  const sec = (f) => {
    const ch = lerp(cr, ct, f);
    const le = [root[0] - back * f, root[1] + S[1] * span * f, root[2] + S[2] * span * f];
    return foil.map(([u, v]) => [le[0] - u * ch, le[1] + T[1] * v * th * ch, le[2] + T[2] * v * th * ch]);
  };
  const A = sec(0), B = sec(1), n = A.length, tris = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([A[i], A[j], B[j]], [A[i], B[j], B[i]]);
  }
  for (let i = 1; i < n - 1; i++) { tris.push([A[0], A[i + 1], A[i]]); tris.push([B[0], B[i], B[i + 1]]); }
  return soup(tris, c, extra);
}

const B = (dx, dy, dz, x, y, z, c, yaw = 0, pitch = 0, roll = 0, extra = {}) => ({ s: 'box', d: [dx, dy, dz], p: [x, y, z], r: [yaw, pitch, roll], c, ...extra });
const CYL = (len, rb, rf, x, y, z, c, extra = {}) => ({ s: 'cyl', d: [len, rb, rf], p: [x, y, z], r: [0, 90, 0], c, ...extra });
const ELL = (rx, ry, rz, x, y, z, c, extra = {}) => ({ s: 'ell', d: [rx, ry, rz], p: [x, y, z], r: [0, 0, 0], c, ...extra });
const WHEEL = (r, w, x, y, z) => ({ s: 'cyl', d: [w, r, r], p: [x, y, z], r: [0, 0, 90], c: 'k', tag: 'gear' });

// ------------------------------------------------------------------ classification
function classify(f) {
  const jet = f.engines.type === 'turbofan' || f.engines.type === 'turbojet';
  const prop = ['piston', 'turboprop', 'electric'].includes(f.engines.type);
  const glider = f.engines.type === 'none';
  const fighter = f.roll === 'fighter' || (f.cat === 'military' && jet && f.span < 22 && f.engines.layout === 'internal');
  const airliner = f.nose === 'airliner' || f.canopy === 'airliner';
  return { jet, prop, glider, fighter, airliner };
}

// ------------------------------------------------------------------ geometry
export function buildFleetParts(f) {
  const K = classify(f);
  const parts = [];
  const len = f.len, span = f.span;
  const R = Math.max(0.35, f.fus / 2);
  const flying = f.wing === 'flyingwing';
  const delta = f.wing === 'delta';
  const lv = LIVERY[f.livery] || LIVERY['white-blue'];
  const tailC = lv.tail;

  // wing planform
  const AR = flying ? 5.7 : delta ? 1.9 : K.glider ? 18 : K.fighter ? 3.2 : K.airliner ? 9.3 : f.cat === 'historic' ? 6 : 7.4;
  const taper = clamp(f.taper, 0.05, 1);
  const cbar = span / AR;
  const cr = (2 * cbar) / (1 + taper);
  const ct = cr * taper;

  // fuselage layout: where the wing quarter-chord sits from the nose
  const noseProp = f.engines.layout === 'nose';
  const wingPos = flying ? 0.45 : delta || K.fighter ? 0.57 : noseProp ? 0.32 : K.glider ? 0.33 : f.wing === 'biplane' || f.wing === 'triplane' ? 0.3 : 0.45;
  const twinBoom = f.tail === 'twinboom';
  const bodyLen = twinBoom ? len * 0.62 : len;
  const xNose = len * wingPos;
  const xTail = xNose - bodyLen;

  // cross-section
  const ryK = flying ? 1.0 : K.fighter ? 1.18 : 1.0;
  const rzK = flying ? 0.42 : K.fighter ? 0.82 : 1.04;
  const noseFrac = { round: 0.13, airliner: 0.11, pointed: 0.3, droop: 0.27 }[f.nose] || 0.14;
  const tailFrac = K.airliner ? 0.3 : K.fighter ? 0.18 : flying ? 0.3 : K.glider ? 0.6 : 0.5;
  const tailEnd = K.fighter || f.engines.layout === 'internal' ? 0.62 : K.airliner ? 0.07 : 0.12;
  const upsweep = K.fighter || flying ? 0 : K.airliner ? 0.38 : 0.22;
  const NS = 30;
  const secs = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    let r;
    if (t < noseFrac) {
      const u = t / noseFrac;
      r = f.nose === 'pointed' || f.nose === 'droop' ? Math.pow(u, 0.72) : Math.sqrt(1 - (1 - u) * (1 - u));
    } else if (t > 1 - tailFrac) {
      const u = (t - (1 - tailFrac)) / tailFrac;
      r = lerp(1, tailEnd, smoothstep(u));
    } else r = 1;
    r = Math.max(r, 0.015);
    let zc = 0;
    if (t > 1 - tailFrac) zc = upsweep * R * smoothstep((t - (1 - tailFrac)) / tailFrac);
    if (t < noseFrac && f.nose === 'airliner') zc = -0.18 * R * (1 - t / noseFrac);
    if (t < noseFrac && f.nose === 'droop') zc = -0.12 * R * (1 - t / noseFrac);
    secs.push({ x: xNose - t * bodyLen, ry: R * ryK * r, rz: R * rzK * r, zc });
  }
  const at = x => { // fuselage section at body x
    const t = clamp((xNose - x) / bodyLen, 0, 1) * NS;
    const i = Math.min(NS - 1, Math.floor(t)), u = t - i;
    const a = secs[i], b = secs[i + 1];
    return { ry: lerp(a.ry, b.ry, u), rz: lerp(a.rz, b.rz, u), zc: lerp(a.zc, b.zc, u) };
  };

  // fuselage bands: top / stripe / belly (military: no stripe)
  const stripe = lv.plain ? 'p' : 'a';
  parts.push(loft(secs, -100, 100, 22, 'p'));
  parts.push(loft(secs, 100, 112, 2, stripe), loft(secs, -112, -100, 2, stripe));
  parts.push(loft(secs, 112, 248, 16, 's'));
  // passenger windows: a dark band along the cabin
  if (f.canopy === 'airliner' && !f.livery.startsWith('cargo') && f.id !== 'b747-8f' && f.cat !== 'military') {
    const wsecs = secs.filter(q => q.x < xNose - bodyLen * 0.14 && q.x > xNose - bodyLen * 0.72).map(q => ({ ...q, ry: q.ry * 1.006, rz: q.rz * 1.006 }));
    if (wsecs.length > 1) parts.push(loft(wsecs, 62, 67, 1, 'g'), loft(wsecs, -67, -62, 1, 'g'));
  }

  // wings
  const fz = at(0);
  const wingZ = {
    low: -fz.rz * 0.55, mid: 0, high: fz.rz * 0.82, parasol: fz.rz + R * 0.9,
    delta: -fz.rz * 0.35, flyingwing: 0, biplane: -fz.rz * 0.55, triplane: -fz.rz * 0.55,
  }[f.wing] ?? 0;
  const rootY = flying ? 0 : fz.ry * 0.55;
  const half = span / 2 - rootY;
  const leRoot = 0.25 * cr;
  const th = K.glider ? 0.13 : K.fighter || delta ? 0.055 : K.airliner ? 0.13 : 0.14;
  const dih = (f.dihedral || 0) * D2R;
  const sweep = f.sweep || 0;
  const wingSet = (z, spanScale = 1, crScale = 1) => {
    const h = half * spanScale;
    const crr = cr * crScale, ctt = ct * crScale;
    const le = leRoot - (crr - cr) * 0.25;
    for (const side of [1, -1]) {
      const S = [0, side * Math.cos(dih), Math.sin(dih)];
      const T = [0, -side * Math.sin(dih), Math.cos(dih)];
      parts.push(panel([le, side * rootY, z], crr, ctt, h, sweep, S, T, th, 'w', { tag: 'wing' }));
      if (lv.a && (f.livery === 'glider' || f.livery === 'aerobatic')) {
        // coloured wing tips
        const tipLe = [le - Math.tan(sweep * D2R) * h * 0.9, side * (rootY + h * 0.9 * S[1]), z + h * 0.9 * S[2]];
        parts.push(panel(tipLe, lerp(crr, ctt, 0.9) * 1.01, ctt * 1.01, h * 0.1 * 1.01, sweep, S, T, th * 1.05, 'a', { tag: 'wing' }));
      }
    }
    return { le, h, z };
  };
  const mainWing = wingSet(wingZ);
  const wingLeAt = yy => mainWing.le - Math.tan(sweep * D2R) * Math.max(0, Math.abs(yy) - rootY);
  const wingZAt = yy => mainWing.z + Math.tan(dih) * Math.max(0, Math.abs(yy) - rootY);
  const chordAt = yy => lerp(cr, ct, clamp((Math.abs(yy) - rootY) / half, 0, 1));

  if (f.wing === 'biplane' || f.wing === 'triplane') {
    const top = fz.rz + R * 1.2;
    wingSet(top, 1.02);
    if (f.wing === 'triplane') wingSet(fz.rz * 0.35 + R * 0.25, 0.97);
    for (const side of [1, -1]) {
      for (const k of [0.55]) {
        const yy = side * (rootY + half * k);
        parts.push(B(0.12, 0.12, top - wingZ, wingLeAt(yy) - chordAt(yy) * 0.25, yy, (top + wingZ) / 2, 'm'));
        parts.push(B(0.12, 0.12, top - wingZ, wingLeAt(yy) - chordAt(yy) * 0.7, yy, (top + wingZ) / 2, 'm'));
      }
      parts.push(B(0.1, 0.1, top - fz.rz, leRoot - cr * 0.3, side * R * 0.5, (top + fz.rz) / 2, 'm'));
    }
  }
  if (f.wing === 'parasol') {
    for (const side of [1, -1]) {
      parts.push(B(0.1, 0.1, wingZ - fz.rz * 0.5, leRoot - cr * 0.3, side * R * 0.5, (wingZ + fz.rz * 0.5) / 2, 'm'));
      const yy = side * (rootY + half * 0.5);
      parts.push(B(0.1, Math.abs(yy), 0.1, leRoot - cr * 0.4, yy / 2, (wingZ - fz.rz * 0.6) / 2, 'm', 0, 0, -side * Math.atan2(wingZ + fz.rz * 0.6, Math.abs(yy)) / D2R));
    }
  }
  // wing struts for strut-braced high wings (Cessna, Cub, Kodiak...)
  if (f.wing === 'high' && K.prop && span < 20) {
    for (const side of [1, -1]) {
      const yy = side * (rootY + half * 0.5);
      const z0 = -fz.rz * 0.6, z1 = wingZ;
      const L = Math.hypot(Math.abs(yy) - R * 0.8, z1 - z0);
      const ang = Math.atan2(z1 - z0, Math.abs(yy) - R * 0.8) / D2R;
      parts.push(B(0.16, L, 0.06, wingLeAt(yy) - chordAt(yy) * 0.35, side * (R * 0.8 + Math.abs(yy)) / 2, (z0 + z1) / 2, 'w', 0, 0, side * ang));
    }
  }
  // winglets on modern airliners and bizjets
  if ((K.airliner || f.livery === 'bizjet') && f.year >= 2000 && sweep > 20) {
    for (const side of [1, -1]) {
      const yy = side * (rootY + half);
      const tipLe = [wingLeAt(yy), yy, wingZAt(yy)];
      parts.push(panel(tipLe, ct * 0.95, ct * 0.4, Math.max(1, span * 0.045), 40, [0, side * 0.25, 0.97], [0, 1, 0], 0.08, tailC, { tag: 'wing' }, SYMFOIL));
    }
  }

  // tail surfaces
  const tailX = xTail;
  const tSec = at(tailX + bodyLen * 0.08);
  const finH = flying ? 0 : len * (K.fighter ? 0.15 : K.glider ? 0.15 : K.airliner ? 0.17 : f.cat === 'historic' ? 0.12 : 0.14);
  const finCr = len * (K.fighter ? 0.14 : K.glider ? 0.12 : 0.15);
  const finSweep = K.fighter ? 45 : K.jet ? 38 : f.cat === 'historic' ? 10 : 25;
  const finT = SYMFOIL;
  const finRoot = [tailX + finCr * 1.02, 0, tSec.zc + tSec.rz * 0.5];
  const stabSpan = span * (K.fighter ? 0.55 : K.glider ? 0.2 : K.airliner ? 0.34 : 0.36) / 2;
  const stabCr = finCr * (K.fighter ? 1.0 : 0.82);
  const stabSweep = K.jet ? Math.max(sweep + 4, 25) : 6;
  const addFin = (root, h, cant = 0, c = tailC) => {
    parts.push(panel(root, finCr, finCr * 0.4, h, finSweep, [0, Math.sin(cant * D2R), Math.cos(cant * D2R)], [0, Math.cos(cant * D2R), -Math.sin(cant * D2R)], 0.1, c, {}, finT));
  };
  const addStab = (x, z, y0 = R * 0.15, sp = stabSpan) => {
    for (const side of [1, -1]) {
      parts.push(panel([x, side * y0, z], stabCr, stabCr * 0.45, sp, stabSweep, [0, side, 0], [0, 0, 1], 0.08, K.airliner ? 'w' : 'p', {}, SYMFOIL));
    }
  };
  let boomY = 0;
  if (twinBoom) {
    boomY = f.engines.layout === 'wingprops' ? span * 0.17 : span * 0.12;
    const bx0 = leRoot + cr * 0.6, bx1 = xNose - len;
    for (const side of [1, -1]) {
      const bs = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, r = R * (f.engines.layout === 'wingprops' ? 0.55 : 0.28) * (t < 0.15 ? Math.sqrt(t / 0.15) : t > 0.7 ? lerp(1, 0.4, (t - 0.7) / 0.3) : 1);
        bs.push({ x: lerp(bx0, bx1, t), ry: Math.max(r, 0.02), rz: Math.max(r, 0.02), zc: wingZ });
      }
      const boom = loft(bs, -180, 180, 12, 'p');
      boom.pos = boom.pos.map((v, k) => (k % 3 === 1 ? v + side * boomY : v));
      parts.push(boom);
      addFin([bx1 + finCr * 1.02, side * boomY, wingZ], finH * 0.7);
    }
    addStab(bx1 + stabCr * 1.1, wingZ + finH * 0.2, -boomY, 2 * boomY);
  } else if (f.tail === 'conv') {
    addFin(finRoot, finH);
    if (!delta) addStab(tailX + stabCr * 1.05 + (K.fighter ? 0 : bodyLen * 0.02), tSec.zc + (K.fighter ? 0 : tSec.rz * 0.15));
  } else if (f.tail === 'T') {
    addFin(finRoot, finH);
    addStab(finRoot[0] - Math.tan(finSweep * D2R) * finH - finCr * 0.4 * 0.05 + stabCr * 0.15, finRoot[2] + finH, 0.05);
  } else if (f.tail === 'cruciform') {
    addFin(finRoot, finH);
    addStab(finRoot[0] - Math.tan(finSweep * D2R) * finH * 0.45, finRoot[2] + finH * 0.45, 0.1, stabSpan * 0.85);
  } else if (f.tail === 'twin') {
    for (const side of [1, -1]) addFin([finRoot[0], side * tSec.ry * 0.8, finRoot[2]], finH * 0.95, side * 14);
    if (!delta) addStab(tailX + stabCr * 1.05, tSec.zc);
  } else if (f.tail === 'V') {
    for (const side of [1, -1]) parts.push(panel([finRoot[0], side * R * 0.1, finRoot[2]], finCr, finCr * 0.45, finH * 1.1, finSweep * 0.8, [0, side * 0.6, 0.8], [0, -side * 0.8, 0.6], 0.09, tailC, {}, SYMFOIL));
  } else if (f.tail === 'canard') {
    if (f.wing !== 'biplane') addFin(finRoot, finH);
    else addFin([tailX + finCr, 0, 0], finH * 0.8);
  }
  if (f.tail === 'canard' || ((f.id === 'eurofighter' || f.id === 'rafale' || f.id === 'gripen-e') && f.tail !== 'canard')) {
    const cx = xNose - len * (f.wing === 'biplane' ? 0.02 : 0.24);
    for (const side of [1, -1]) parts.push(panel([cx, side * R * 0.6, f.wing === 'biplane' ? 0 : fz.rz * 0.1], cr * 0.3, cr * 0.12, span * 0.16, f.wing === 'biplane' ? 0 : 48, [0, side, 0], [0, 0, 1], 0.06, 'w', {}, SYMFOIL));
  }

  // canopy / cockpit glazing
  let eye = [xNose - R * 1.3, R * 0.5];
  const nl = noseFrac * bodyLen;
  if (f.canopy === 'airliner') {
    const s0 = at(xNose - nl * 0.9);
    parts.push(ELL(nl * 0.32, s0.ry * 0.8, s0.rz * 0.32, xNose - nl * 0.82, 0, s0.zc + s0.rz * 0.52, 'g'));
    eye = [xNose - nl * 0.75, s0.zc + s0.rz * 0.45];
  } else if (f.canopy === 'bubble' || f.canopy === 'tandem') {
    const cx = noseProp ? xNose - len * 0.45 : xNose - len * (K.fighter ? 0.24 : 0.3);
    const s0 = at(cx);
    const rx = len * (f.canopy === 'tandem' ? 0.13 : 0.085);
    parts.push(ELL(rx, s0.ry * 0.55, s0.rz * 0.62, cx, 0, s0.zc + s0.rz * 0.72, 'c'));
    eye = [cx + rx * 0.25, s0.zc + s0.rz * 1.05];
  } else if (f.canopy === 'cabin') {
    const cx = K.glider ? xNose - len * 0.17 : leRoot + R * 0.3;
    const s0 = at(cx);
    if (K.glider) parts.push(ELL(len * 0.13, s0.ry * 0.85, s0.rz * 0.65, cx, 0, s0.zc + s0.rz * 0.55, 'c'));
    else {
      const x0 = cx + R * 1.0, x1 = cx - R * 1.6;
      const ws = secs.filter(q => q.x <= x0 && q.x >= x1).map(q => ({ ...q, ry: q.ry * 1.01, rz: q.rz * 1.01 }));
      if (ws.length > 1) parts.push(loft(ws, 38, 78, 3, 'c'), loft(ws, -78, -38, 3, 'c'));
      const sw = at(x0 + R * 0.25);
      parts.push(ELL(R * 0.5, sw.ry * 0.86, sw.rz * 0.5, x0 + R * 0.15, 0, sw.zc + sw.rz * 0.55, 'c'));
    }
    eye = [cx + R * 0.2, s0.zc + s0.rz * 0.7];
  } else if (f.canopy === 'open') {
    const cx = noseProp ? xNose - len * 0.42 : xNose - len * 0.3;
    const s0 = at(cx);
    parts.push(B(R * 1.3, s0.ry * 1.2, s0.rz * 0.25, cx, 0, s0.zc + s0.rz * 0.92, 'k'));
    parts.push(B(0.05, s0.ry * 0.9, R * 0.35, cx + R * 0.75, 0, s0.zc + s0.rz * 1.05, 'g', 0, -25));
    eye = [cx, s0.zc + s0.rz * 1.25];
  } else {
    eye = [xNose - nl * 0.6, 0];
  }

  // engines
  const E = f.engines;
  const engC = 'e';
  const blades = (cx, cy, cz, rad, n, extra = {}) => {
    parts.push(ELL(rad * 0.22, rad * 0.16, rad * 0.16, cx + rad * 0.12, cy, cz, 'k', { tag: 'eng' }));
    for (let i = 0; i < n; i++) {
      const roll = (i * 360) / n + 15;
      const s = Math.sin(roll * D2R), co = Math.cos(roll * D2R);
      parts.push(B(0.06 * rad, rad * 0.14, rad * 0.95, cx, cy - s * rad * 0.5, cz + co * rad * 0.5, 'k', 0, 0, roll, { tag: 'eng', ...extra }));
    }
  };
  const nBlades = E.type === 'turboprop' ? (f.year >= 2000 ? 6 : 4) : f.cat === 'historic' && f.year < 1935 ? 2 : f.year > 1990 ? 3 : (span > 10 ? 3 : 2);
  const engY = E.count >= 4 ? [0.27, 0.5] : E.count === 3 ? [0.32] : [0.34];
  const layout = (E.layout === 'underwing' && !K.jet) ? 'wingprops' : E.layout;

  if (layout === 'nose') {
    const rad = clamp(R * 1.25, 0.9, 2.1);
    blades(xNose + 0.05, 0, secs[0].zc, rad, nBlades);
    if (f.engines.type === 'piston' && f.cat === 'historic' && (f.wing === 'biplane' || f.wing === 'triplane' || f.year < 1935)) {
      parts.push(CYL(R * 0.5, R * 1.02, R * 1.02, xNose - R * 0.25, 0, secs[0].zc, 'k', { tag: 'eng' })); // rotary / radial cowling
    }
  }
  if (layout === 'wingprops') {
    const rad = clamp(span * 0.06, 1.0, 2.6);
    const ys = twinBoom ? [boomY / (span / 2)] : engY;
    for (const fr of ys) for (const side of [1, -1]) {
      const yy = side * (twinBoom ? boomY : rootY + half * fr);
      const d = rad * 0.42;
      const le = wingLeAt(yy), z = wingZAt(yy) - (f.wing === 'high' ? d * 0.25 : 0);
      if (!twinBoom) parts.push(CYL(d * 3.6, d * 0.45, d * 0.55, le - d * 0.8, yy, z, engC, { tag: 'eng' }));
      blades(twinBoom ? le + R * 0.6 : le + d * 1.05, yy, z, rad, nBlades);
    }
    if (f.id === 'ju-52') blades(xNose + 0.05, 0, 0, clamp(R * 1.2, 1, 1.8), 3);
  }
  if (layout === 'underwing' || layout === 'overwing') {
    const quad = E.count >= 4;
    const d = clamp(f.fus * (quad ? 0.32 : 0.42), 0.7, 3.4);
    const L = d * (E.type === 'turbojet' ? 2.6 : 1.85);
    for (const fr of engY) for (const side of [1, -1]) {
      const yy = side * (rootY + half * fr);
      const wz = wingZAt(yy), le = wingLeAt(yy);
      const over = layout === 'overwing';
      const cx = over ? le - chordAt(yy) * 0.55 : le + L * 0.12;
      const cz = over ? wz + d * 0.85 : wz - d * 0.62;
      parts.push(CYL(L, d * 0.36, d * 0.5, cx, yy, cz, engC, { tag: 'eng' }));
      parts.push(CYL(0.05, d * 0.44, d * 0.44, cx + L / 2 + 0.01, yy, cz, 'k', { tag: 'eng' }));
      parts.push(B(L * 0.55, 0.18 * d, Math.abs(cz - wz), cx - L * 0.1, yy, (cz + wz) / 2, engC, 0, 0, 0, { tag: 'eng' }));
    }
  }
  if (layout === 'rear' || layout === 'tri') {
    const d = clamp(f.fus * 0.36, 0.6, 2.2);
    const L = d * 2.3;
    const ex = tailX + bodyLen * 0.24;
    const s0 = at(ex);
    for (const side of [1, -1]) {
      const yy = side * (s0.ry + d * 0.62);
      parts.push(CYL(L, d * 0.38, d * 0.5, ex, yy, s0.zc + s0.rz * 0.3, engC, { tag: 'eng' }));
      parts.push(CYL(0.05, d * 0.44, d * 0.44, ex + L / 2 + 0.01, yy, s0.zc + s0.rz * 0.3, 'k', { tag: 'eng' }));
      parts.push(B(L * 0.4, Math.abs(yy) - s0.ry * 0.8, d * 0.2, ex, side * (Math.abs(yy) + s0.ry * 0.8) / 2, s0.zc + s0.rz * 0.3, engC));
    }
    if (layout === 'tri') {
      const zc = tSec.zc + tSec.rz + d * 0.35;
      parts.push(CYL(L * 1.05, d * 0.42, d * 0.5, tailX + L * 0.62, 0, zc, engC, { tag: 'eng' }));
      parts.push(CYL(0.05, d * 0.44, d * 0.44, tailX + L * 1.15, 0, zc, 'k', { tag: 'eng' }));
    }
  }
  if (layout === 'internal' || (K.fighter && layout !== 'pusher')) {
    const two = E.count >= 2 && !flying;
    const s0 = secs[NS];
    const r = two ? s0.ry * 0.48 : Math.max(s0.ry, s0.rz) * 0.9;
    if (!flying) for (const yy of two ? [s0.ry * 0.5, -s0.ry * 0.5] : [0]) parts.push(CYL(R * 0.8, r * 0.9, r, tailX - R * 0.25, yy, s0.zc, 'k'));
    if (K.fighter && !flying) { // intakes
      const ix = leRoot + cr * 0.15;
      const s1 = at(ix);
      for (const side of [1, -1]) parts.push(B(len * 0.12, s1.ry * 0.35, s1.rz * 0.7, ix, side * s1.ry * 0.85, s1.zc - s1.rz * 0.25, 'k'));
    }
    if (flying) for (const side of [1, -1]) parts.push(B(cr * 0.25, R * 0.6, R * 0.25, leRoot - cr * 0.05, side * R * 0.9, fz.rz * 0.55, 'k'));
  }
  if (layout === 'pusher') {
    const rad = clamp(R * 1.3, 0.9, 1.6);
    if (f.id === 'wright-flyer') {
      for (const side of [1, -1]) blades(leRoot - cr * 1.15, side * span * 0.12, 0.6, 1.3, 2);
    } else blades(tailX - 0.1, 0, secs[NS].zc, rad, E.type === 'turboprop' ? 3 : 2);
  }

  // landing gear (tag 'gear' → retracts)
  const L = clamp(0.42 * f.fus, 0.45, 3.0) * (K.glider ? 0.45 : 1);
  const wr = clamp(L * 0.32, 0.18, 0.75);
  const gearH = fz.rz - fz.zc + L + (K.glider ? 0 : 0);
  const zGround = -gearH;
  const leg = (x, y, zTop, bogie = false) => {
    const zw = zGround + wr;
    const h = Math.max(0.1, zTop - zw);
    parts.push(B(wr * 0.45, wr * 0.45, h, x, y, zw + h / 2, 'm', 0, 0, 0, { tag: 'gear' }));
    if (bogie) { parts.push(WHEEL(wr, wr * 0.7, x + wr * 1.15, y, zw), WHEEL(wr, wr * 0.7, x - wr * 1.15, y, zw)); }
    else parts.push(WHEEL(wr, wr * 0.75, x, y, zw));
  };
  const heavy = len > 50;
  if (f.gear === 'tricycle') {
    const mx = -cr * 0.12;
    const track = Math.max(fz.ry * 0.9, K.fighter ? fz.ry * 1.15 : span * (K.airliner ? 0.1 : 0.12));
    const topZ = Math.abs(track) > fz.ry ? wingZAt(track) : -fz.rz * 0.5;
    for (const side of [1, -1]) leg(mx, side * track, topZ, heavy);
    if (heavy && len > 60) for (const side of [1, -1]) leg(mx - wr * 3.2, side * fz.ry * 0.6, -fz.rz * 0.5, true);
    leg(xNose - bodyLen * 0.1, 0, at(xNose - bodyLen * 0.1).zc - at(xNose - bodyLen * 0.1).rz * 0.5);
  } else if (f.gear === 'taildragger') {
    const mx = leRoot + cr * 0.05;
    const track = Math.max(fz.ry * 1.1, span * 0.11);
    for (const side of [1, -1]) leg(mx, side * track, wingZAt(track) < 0 ? wingZAt(track) : -fz.rz * 0.4);
    const tx = tailX + bodyLen * 0.06, ts = at(tx);
    const zw = ts.zc - ts.rz - wr * 0.45;
    parts.push(B(0.1, 0.1, Math.max(0.1, ts.zc - ts.rz * 0.5 - zw), tx, 0, (ts.zc - ts.rz * 0.5 + zw) / 2, 'm', 0, 0, 0, { tag: 'gear' }));
    parts.push(WHEEL(wr * 0.5, wr * 0.4, tx, 0, zw));
  } else { // skid: glider main wheel + nose skid
    leg(-cr * 0.05, 0, -fz.rz * 0.6);
    parts.push(B(len * 0.15, 0.08, 0.12, xNose - len * 0.12, 0, zGround + 0.08 + (at(xNose - len * 0.12).rz - fz.rz) * 0, 'k', 0, 0, 0, { tag: 'gear' }));
  }

  return { parts, gearH, eye, cr };
}

// ------------------------------------------------------------------ flight model + metadata
const ROLL = { heavy: [0.6, 0.3], medium: [1.1, 0.5], agile: [1.8, 0.75], aerobatic: [3.0, 0.95], fighter: [3.2, 1.0] };

export function makeBase(f) {
  const K = classify(f);
  const lv = LIVERY[f.livery] || LIVERY['white-blue'];
  let { parts, gearH, eye } = buildFleetParts(f);

  // game top speed: real vmax, with supersonic speeds compressed so the map can keep up
  const vmaxKmh = f.vmax <= 900 ? f.vmax : Math.min(1450, 900 + (f.vmax - 900) * 0.4);
  const vStall = Math.max(12, (f.vstall / 3.6) * 0.86);
  // very slow pioneers still get a usable margin between stall and top speed
  const vTop = Math.max((vmaxKmh / 3.6) * 0.97, vStall * 1.8);
  const [rollBase, pitchBase] = ROLL[f.roll] || ROLL.medium;
  const big = f.span > 55 ? 0.8 : 1;
  const accel = K.glider ? 0 : f.roll === 'fighter' ? 20 : f.roll === 'aerobatic' ? 11 : f.roll === 'agile' ? 9.5 : f.cat === 'historic' && f.year < 1920 ? 3.5 : f.roll === 'heavy' ? 7 : 7.5;
  const drag = K.glider ? (f.span > 16 ? 0.00026 : 0.00032) : accel / (vTop * vTop);
  const phys = {
    thrust: accel, drag, vStall, vRotate: vStall * 1.15,
    roll: rollBase * big, pitch: pitchBase * big,
    gearH, maxLand: Math.max(vStall * 2, vStall + 40), maxSink: f.roll === 'heavy' ? -4 : -5,
    startSpeed: K.glider ? Math.max(vStall * 1.5, 30) : clamp(vStall * 1.9, vStall + 15, vTop * 0.75),
    engine: K.glider ? 'none' : K.jet ? 'jet' : 'prop',
  };

  const style = K.glider ? 'glider' : K.fighter || (f.cat === 'military' && K.jet && f.span < 20) ? 'fighter'
    : (K.jet || (f.engines.type === 'turboprop' && (f.cat === 'commercial' || f.year >= 1995)) || f.year >= 2003) ? 'glass' : 'ga';
  const panelC = { ga: '#2b2f36', glass: '#1f2933', fighter: '#2a3038', glider: '#d7d9db' }[style];

  return {
    id: f.id, cat: f.cat, tr: f.name, en: f.name, spec: f,
    typeTr: `${f.role.tr} · ${f.maker}, ${f.year}`,
    typeEn: `${f.role.en} · ${f.maker}, ${f.year}`,
    colors: { p: lv.p, s: lv.s, a: lv.a, w: lv.w, e: lv.e },
    span: f.span,
    cam: { dist: clamp(8 + f.len * 1.15 + f.span * 0.35, 16, 140), cockpit: eye },
    cockpit: { style, engines: Math.max(1, f.engines.count || 1), panel: panelC },
    phys,
    startBonusAlt: K.glider ? 700 : 0,
    model: f.model || null,
    build: () => parts,
  };
}
