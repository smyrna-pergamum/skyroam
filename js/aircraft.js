// Aircraft roster. All models are original, built from boxes and cylinders.
// Body frame: +x forward, +y left, +z up, metres. Rotations in degrees: [yaw, pitch, roll].
// Colour slots: p = primary, s = secondary, a = accent; fixed: k = dark, g = glass, m = metal.

const D2R = Math.PI / 180;

// ---------- part helpers ----------
const B = (dx, dy, dz, x, y, z, c, yaw = 0, pitch = 0, roll = 0, tag) =>
  ({ s: 'box', d: [dx, dy, dz], p: [x, y, z], r: [yaw, pitch, roll], c, tag });
/** Cylinder along +x. rb = back radius, rf = front radius. */
const C = (len, rb, rf, x, y, z, c, tag) =>
  ({ s: 'cyl', d: [len, rb, rf], p: [x, y, z], r: [0, 90, 0], c, tag });

/** Pair of wing halves with sweep and dihedral (degrees). */
function wings(span, chord, th, x, z, sweep, dih, c, tag = 'wing') {
  const q = span / 4;
  const sx = Math.tan(sweep * D2R) * q;
  const dz = Math.sin(dih * D2R) * q;
  return [
    B(chord, span / 2, th, x - sx, q, z + dz, c, sweep, 0, dih, tag),
    B(chord, span / 2, th, x - sx, -q, z + dz, c, -sweep, 0, -dih, tag),
  ];
}

/** Tricycle gear: main legs at ±ym (x = xm), nose leg at xn. top = z where legs start. */
function gear(xm, ym, xn, top, leg, wr) {
  const parts = [];
  const legAt = (x, y) => {
    parts.push(B(0.25 * wr / 0.35, 0.25 * wr / 0.35, leg, x, y, top - leg / 2, 'm'));
    parts.push(B(wr * 2, wr * 0.9, wr * 2, x, y, top - leg, 'k'));
  };
  legAt(xm, ym); legAt(xm, -ym);
  if (xn !== null) legAt(xn, 0);
  return parts;
}

/** Two-blade propeller disc seen as a cross. */
const prop = (x, y, z, len, c = 'k') => [B(0.1, 0.18, len, x, y, z, c, 0, 0, 0, 'eng'), B(0.1, len, 0.18, x, y, z, c, 0, 0, 0, 'eng')];

// ---------- roster ----------
// phys: thrust (m/s² at full), drag (quadratic), vStall, vRotate, roll, pitch (rad/s), gearH (m),
//       maxLand (m/s), maxSink (m/s, negative), startSpeed (m/s), engine: prop|jet|none
export const AIRCRAFT = [
  {
    id: 'serce', cat: 'civil', tr: 'Serçe', en: 'Sparrow',
    typeTr: 'Eğitim uçağı', typeEn: 'Light trainer',
    colors: { p: '#eef2f7', s: '#2563eb', a: '#dc2626' },
    span: 12.5, cam: { dist: 26, cockpit: [1.9, 1.25] },
    phys: { thrust: 7.5, drag: 0.0007, vStall: 30, vRotate: 36, roll: 1.4, pitch: 0.6, gearH: 1.65, maxLand: 85, maxSink: -5, startSpeed: 60, engine: 'prop' },
    build: () => [
      B(8, 1.3, 1.3, 0, 0, 0, 'p'),
      B(1.6, 1.0, 1.0, 4.6, 0, -0.05, 's'),
      B(0.25, 0.25, 0.25, 5.5, 0, -0.05, 'k'),
      ...prop(5.6, 0, -0.05, 3.0),
      B(1.4, 0.95, 0.75, 1.6, 0, 0.9, 'g'),
      ...wings(12.5, 2.0, 0.22, 0.9, 0.35, 0, 3, 'p'),
      B(0.7, 1.4, 0.24, 0.2, 0, 0.36, 'a'),
      B(1.4, 4.4, 0.18, -3.6, 0, 0.35, 'p'),
      B(1.5, 0.2, 2.0, -3.7, 0, 1.4, 'a'),
      ...gear(1.3, 1.4, null, -0.5, 0.85, 0.3),
    ],
  },
  {
    id: 'akrobat', cat: 'civil', tr: 'Akrobat', en: 'Stunt Bi',
    typeTr: 'Akrobasi çift kanatlı', typeEn: 'Aerobatic biplane',
    colors: { p: '#facc15', s: '#dc2626', a: '#111827' },
    span: 8, cam: { dist: 22, cockpit: [-0.2, 1.0] },
    phys: { thrust: 10, drag: 0.0008, vStall: 30, vRotate: 34, roll: 2.6, pitch: 0.9, gearH: 1.6, maxLand: 80, maxSink: -5, startSpeed: 60, engine: 'prop' },
    build: () => [
      B(6, 1.0, 1.1, 0, 0, 0, 'p'),
      B(1.0, 0.9, 0.9, 3.4, 0, 0, 's'),
      B(0.3, 0.3, 0.3, 4.0, 0, 0, 'k'),
      ...prop(4.1, 0, 0, 2.4),
      B(1.5, 8, 0.18, 1.0, 0, -0.45, 'p', 0, 0, 0, 'wing'),
      B(1.5, 8, 0.18, 1.3, 0, 1.25, 's', 0, 0, 0, 'wing'),
      B(0.12, 0.12, 1.6, 1.15, 2.8, 0.4, 'k'), B(0.12, 0.12, 1.6, 1.15, -2.8, 0.4, 'k'),
      B(1.0, 0.7, 0.55, -0.2, 0, 0.75, 'g'),
      B(1.1, 3.2, 0.15, -2.6, 0, 0.2, 'p'),
      B(1.2, 0.15, 1.4, -2.7, 0, 1.0, 's'),
      ...gear(1.4, 1.0, null, -0.5, 0.8, 0.3),
    ],
  },
  {
    id: 'suzulen', cat: 'civil', tr: 'Süzülen', en: 'Glider',
    typeTr: 'Planör (motorsuz)', typeEn: 'Sailplane (no engine)',
    colors: { p: '#f8fafc', s: '#e2e8f0', a: '#ef4444' },
    span: 18, cam: { dist: 24, cockpit: [2.0, 0.75] },
    phys: { thrust: 0, drag: 0.00032, vStall: 22, vRotate: 26, roll: 1.0, pitch: 0.5, gearH: 0.85, maxLand: 60, maxSink: -4, startSpeed: 34, engine: 'none' },
    startBonusAlt: 700,
    build: () => [
      B(7, 0.7, 0.8, 0, 0, 0, 'p'),
      B(1.2, 0.6, 0.6, 3.9, 0, -0.05, 'p'),
      B(1.6, 0.6, 0.5, 2.2, 0, 0.5, 'g'),
      ...wings(18, 1.1, 0.15, 0.6, 0.35, 0, 2, 'p'),
      B(0.6, 0.3, 0.16, 0.4, 9.0, 0.66, 'a'), B(0.6, 0.3, 0.16, 0.4, -9.0, 0.66, 'a'),
      B(1.1, 0.15, 1.6, -3.2, 0, 1.0, 'a'),
      B(0.8, 3.2, 0.12, -3.5, 0, 1.8, 's'),
      B(0.6, 0.25, 0.6, 0.8, 0, -0.55, 'k'),
    ],
  },
  {
    id: 'bizjet', cat: 'civil', tr: 'Yıldırım', en: 'Bolt',
    typeTr: 'İş jeti', typeEn: 'Business jet',
    colors: { p: '#f8fafc', s: '#0f766e', a: '#d4af37' },
    span: 16, cam: { dist: 34, cockpit: [7.4, 0.7] },
    phys: { thrust: 9, drag: 0.00035, vStall: 48, vRotate: 56, roll: 1.2, pitch: 0.45, gearH: 1.85, maxLand: 110, maxSink: -4.5, startSpeed: 110, engine: 'jet' },
    build: () => [
      C(15, 0.95, 0.95, 0, 0, 0, 'p'),
      C(2.5, 0.95, 0.25, 8.75, 0, 0, 'p'),
      C(3, 0.3, 0.95, -9, 0, 0.2, 'p'),
      B(0.8, 1.4, 0.4, 7.4, 0, 0.5, 'g'),
      B(12, 1.92, 0.22, 0.5, 0, 0.3, 's'),
      ...wings(16, 2.4, 0.25, 0.5, -0.6, 25, 4, 'p'),
      C(3, 0.5, 0.55, -5, 1.6, 0.6, 'm', 'eng'), C(3, 0.5, 0.55, -5, -1.6, 0.6, 'm', 'eng'),
      B(1, 0.8, 0.2, -5, 1.1, 0.5, 'm'), B(1, 0.8, 0.2, -5, -1.1, 0.5, 'm'),
      B(2.6, 0.25, 3.0, -8.4, 0, 2.0, 'p', 0, -25, 0),
      ...wings(6, 1.4, 0.2, -9.6, 3.4, 25, 0, 'a', 'tail'),
      ...gear(-0.5, 1.6, 6, -0.8, 0.7, 0.35),
    ],
  },
  {
    id: 'regional', cat: 'commercial', tr: 'Bölge', en: 'Regional',
    typeTr: 'Turboprop yolcu uçağı', typeEn: 'Turboprop airliner',
    colors: { p: '#f8fafc', s: '#e11d48', a: '#1e3a8a' },
    span: 27, cam: { dist: 52, cockpit: [10.4, 0.6] },
    phys: { thrust: 7, drag: 0.0004, vStall: 44, vRotate: 52, roll: 0.9, pitch: 0.4, gearH: 2.45, maxLand: 100, maxSink: -4.5, startSpeed: 95, engine: 'prop' },
    build: () => [
      C(20, 1.3, 1.3, 0, 0, 0, 'p'),
      C(2.5, 1.3, 0.4, 11.25, 0, -0.1, 'p'),
      C(4, 0.4, 1.3, -12, 0, 0.4, 'p'),
      B(0.8, 2.0, 0.5, 10.3, 0, 0.65, 'g'),
      B(16, 2.62, 0.35, 0.5, 0, 0.2, 's'),
      B(2.6, 27, 0.3, 1.5, 0, 1.35, 'p', 0, 0, 0, 'wing'),
      C(3.5, 0.55, 0.65, 2.6, 4.5, 1.0, 'm', 'eng'), C(3.5, 0.55, 0.65, 2.6, -4.5, 1.0, 'm', 'eng'),
      ...prop(4.45, 4.5, 1.0, 3.6), ...prop(4.45, -4.5, 1.0, 3.6),
      B(3, 0.3, 4, -11.8, 0, 2.9, 'a', 0, -20, 0),
      B(2, 8.5, 0.2, -13.0, 0, 4.8, 'p'),
      ...gear(1, 2, 9, -1.1, 0.9, 0.45),
    ],
  },
  {
    id: 'yolcu', cat: 'commercial', tr: 'Yolcu', en: 'Liner',
    typeTr: 'Dar gövde jet yolcu uçağı', typeEn: 'Narrow-body jetliner',
    colors: { p: '#f8fafc', s: '#dc2626', a: '#dc2626' },
    span: 34, cam: { dist: 72, cockpit: [16.4, 0.9] },
    phys: { thrust: 7.5, drag: 0.00022, vStall: 58, vRotate: 68, roll: 0.7, pitch: 0.32, gearH: 3.25, maxLand: 120, maxSink: -4, startSpeed: 130, engine: 'jet' },
    build: () => [
      C(30, 1.95, 1.95, 0, 0, 0, 'p'),
      C(4, 1.95, 0.5, 17, 0, -0.1, 'p'),
      C(6, 0.5, 1.95, -18, 0, 0.4, 'p'),
      B(1, 2.6, 0.5, 16.3, 0, 0.85, 'g'),
      B(24, 3.92, 0.3, 1, 0, 0.55, 'k'),
      B(26, 3.94, 0.25, 0, 0, -0.15, 's'),
      ...wings(34, 4.5, 0.4, 1, -1.0, 25, 5, 'p'),
      C(4, 1.0, 1.1, 2.5, 6, -1.7, 'm', 'eng'), C(4, 1.0, 1.1, 2.5, -6, -1.7, 'm', 'eng'),
      B(2, 0.3, 0.8, 1.5, 6, -0.9, 'm'), B(2, 0.3, 0.8, 1.5, -6, -0.9, 'm'),
      B(5, 0.4, 6.5, -16.8, 0, 4.4, 'a', 0, -30, 0),
      ...wings(12, 2.6, 0.25, -18, 0.6, 30, 6, 'p', 'tail'),
      ...gear(-1, 3, 13, -1.6, 1.1, 0.55),
    ],
  },
  {
    id: 'dev', cat: 'commercial', tr: 'Dev', en: 'Titan',
    typeTr: 'Geniş gövde, dört motorlu', typeEn: 'Wide-body, four engines',
    colors: { p: '#f8fafc', s: '#1d4ed8', a: '#f59e0b' },
    span: 60, cam: { dist: 115, cockpit: [29.5, 1.5] },
    phys: { thrust: 7, drag: 0.00018, vStall: 64, vRotate: 76, roll: 0.55, pitch: 0.27, gearH: 5.0, maxLand: 125, maxSink: -4, startSpeed: 140, engine: 'jet' },
    build: () => [
      C(55, 3, 3, 0, 0, 0, 'p'),
      C(6, 3, 0.8, 30.5, 0, -0.2, 'p'),
      C(9, 0.8, 3, -32, 0, 0.8, 'p'),
      B(1.5, 4, 0.7, 29.2, 0, 1.4, 'g'),
      B(46, 6.02, 0.4, 2, 0, 0.9, 'k'),
      B(48, 6.04, 0.35, 0, 0, -0.3, 's'),
      ...wings(60, 8, 0.6, 2, -1.8, 32, 6, 'p'),
      C(5.5, 1.5, 1.6, 0.5, 9, -2.4, 'm', 'eng'), C(5.5, 1.5, 1.6, 0.5, -9, -2.4, 'm', 'eng'),
      C(5.5, 1.4, 1.5, -5, 18, -1.5, 'm', 'eng'), C(5.5, 1.4, 1.5, -5, -18, -1.5, 'm', 'eng'),
      B(9, 0.6, 11, -30.5, 0, 7.5, 'a', 0, -35, 0),
      ...wings(22, 4.5, 0.4, -32, 1, 32, 6, 'p', 'tail'),
      ...gear(-2, 4.5, 24, -2.6, 1.6, 0.8),
    ],
  },
  {
    id: 'yuk', cat: 'military', tr: 'Katır', en: 'Mule',
    typeTr: 'Askeri kargo, dört pervaneli', typeEn: 'Military cargo, four props',
    colors: { p: '#6b7280', s: '#4b5563', a: '#111827' },
    span: 40, cam: { dist: 78, cockpit: [15.2, 1.2] },
    phys: { thrust: 6.5, drag: 0.0004, vStall: 40, vRotate: 48, roll: 0.7, pitch: 0.35, gearH: 3.3, maxLand: 100, maxSink: -5, startSpeed: 95, engine: 'prop' },
    build: () => [
      C(28, 2.4, 2.4, 0, 0, 0, 'p'),
      C(3.5, 2.4, 0.8, 15.75, 0, -0.3, 'p'),
      C(8, 0.6, 2.4, -18, 0, 1.0, 'p'),
      B(1, 3, 0.6, 15.2, 0, 1.15, 'g'),
      B(4, 40, 0.5, 1.5, 0, 2.4, 'p', 0, 0, 0, 'wing'),
      ...[6.5, -6.5, 13, -13].flatMap(y => [C(4, 0.8, 0.9, 3.5, y, 1.9, 's', 'eng'), ...prop(5.6, y, 1.9, 4)]),
      B(5, 0.5, 7, -19.5, 0, 5.5, 'p', 0, -20, 0),
      B(3.5, 15, 0.35, -21.5, 0, 8.8, 'p'),
      B(6, 1.2, 1.2, 0, 2.6, -1.8, 's'), B(6, 1.2, 1.2, 0, -2.6, -1.8, 's'),
      B(1.4, 0.6, 1.4, 0, 2.6, -2.6, 'k'), B(1.4, 0.6, 1.4, 0, -2.6, -2.6, 'k'),
      ...gear(0, 0, 11, -1.9, 0.7, 0.7).slice(4),
    ],
  },
  {
    id: 'pervane', cat: 'military', tr: 'Kartal', en: 'Warbird',
    typeTr: 'Pervaneli savaş uçağı (klasik)', typeEn: 'Classic prop fighter',
    colors: { p: '#9ca3af', s: '#374151', a: '#dc2626' },
    span: 11.5, cam: { dist: 24, cockpit: [0.8, 1.2] },
    phys: { thrust: 11, drag: 0.00065, vStall: 38, vRotate: 44, roll: 2.0, pitch: 0.8, gearH: 2.05, maxLand: 90, maxSink: -5, startSpeed: 90, engine: 'prop' },
    build: () => [
      B(8.5, 1.2, 1.4, 0, 0, 0, 'p'),
      C(1.6, 0.7, 0.6, 5.05, 0, 0, 'p'),
      C(0.6, 0.35, 0.05, 6.15, 0, 0, 'a'),
      ...prop(6.0, 0, 0, 3.4),
      B(1.8, 0.8, 0.7, 0.8, 0, 0.95, 'g'),
      ...wings(11.5, 2.2, 0.25, 1.2, -0.45, 8, 6, 'p'),
      B(1.3, 4, 0.18, -4, 0, 0.2, 'p'),
      B(1.6, 0.2, 1.8, -4.1, 0, 1.2, 'p'),
      B(0.6, 0.22, 0.6, -4.4, 0, 1.9, 'a'),
      B(1.0, 1.22, 1.42, 3.8, 0, 0, 'a'),
      ...gear(1.5, 1.5, null, -0.6, 1.1, 0.35),
      B(0.25, 0.15, 0.25, -4, 0, -0.8, 'k'),
    ],
  },
  {
    id: 'sahin', cat: 'military', tr: 'Şahin', en: 'Falcon',
    typeTr: 'Jet savaş uçağı', typeEn: 'Jet fighter',
    colors: { p: '#94a3b8', s: '#64748b', a: '#1e293b' },
    span: 10, cam: { dist: 28, cockpit: [4.3, 1.05] },
    phys: { thrust: 22, drag: 0.00035, vStall: 52, vRotate: 62, roll: 3.2, pitch: 1.0, gearH: 1.8, maxLand: 120, maxSink: -5, startSpeed: 150, engine: 'jet' },
    build: () => [
      B(13, 1.4, 1.3, 0, 0, 0, 'p'),
      C(3.5, 0.7, 0.08, 8.25, 0, 0, 'p'),
      B(3, 0.7, 1.0, 1.5, 1.0, -0.2, 's'), B(3, 0.7, 1.0, 1.5, -1.0, -0.2, 's'),
      B(2.4, 0.8, 0.7, 4.3, 0, 0.85, 'g'),
      B(5, 3, 0.2, -1.5, 0, 0, 'p'),
      ...wings(10, 4.5, 0.2, -1, 0, 40, 0, 'p'),
      B(2.4, 0.15, 2.4, -5.2, 1.0, 1.6, 'a', 0, -30, -12), B(2.4, 0.15, 2.4, -5.2, -1.0, 1.6, 'a', 0, -30, 12),
      ...wings(6, 1.8, 0.15, -5.8, 0, 35, -3, 's', 'tail'),
      C(1.2, 0.6, 0.65, -7.1, 0, 0, 'k', 'eng'),
      ...gear(-2, 1.2, 4, -0.65, 0.85, 0.3),
    ],
  },
  {
    id: 'golge', cat: 'military', tr: 'Gölge', en: 'Shade',
    typeTr: 'Uçan kanat bombardıman', typeEn: 'Flying-wing bomber',
    colors: { p: '#374151', s: '#1f2937', a: '#111827' },
    span: 52, cam: { dist: 90, cockpit: [5.5, 1.4] },
    phys: { thrust: 9, drag: 0.0002, vStall: 58, vRotate: 68, roll: 0.8, pitch: 0.35, gearH: 2.9, maxLand: 120, maxSink: -4.5, startSpeed: 140, engine: 'jet' },
    build: () => [
      B(14, 8, 2, 0, 0, 0, 'p'),
      B(4, 4, 1.2, 8.5, 0, 0, 'p'),
      ...wings(52, 10, 0.8, -2, 0, 35, 0, 'p'),
      B(2, 2.5, 0.5, 5.5, 0, 1.1, 'g'),
      B(3, 1.5, 0.6, 1, 3, 1.1, 's', 0, 0, 0, 'eng'), B(3, 1.5, 0.6, 1, -3, 1.1, 's', 0, 0, 0, 'eng'),
      ...gear(-2, 5, 6, -1, 1.2, 0.7),
    ],
  },
];

export const CATEGORIES = ['civil', 'commercial', 'military'];

export const DEFAULT_MODS = { power: 1, wing: 1, agility: 1 };

/** Turn a base aircraft + mods + colours into everything the game needs. */
export function resolveAircraft(base, mods = DEFAULT_MODS, colors = base.colors) {
  const m = { ...DEFAULT_MODS, ...mods };
  const ph = { ...base.phys };
  ph.thrust *= m.power;
  ph.vStall /= Math.sqrt(m.wing);
  ph.vRotate /= Math.sqrt(m.wing);
  ph.drag *= 0.8 + 0.2 * m.wing;
  ph.roll *= m.agility / Math.pow(m.wing, 0.3);
  ph.pitch *= Math.pow(m.agility, 0.7);

  const parts = base.build().map(p => {
    const q = { ...p, d: [...p.d], p: [...p.p] };
    if (p.tag === 'wing') { q.d[1] *= m.wing; q.p[1] *= m.wing; }
    if (p.tag === 'eng') {
      const k = Math.pow(m.power, 0.35);
      if (p.s === 'cyl') { q.d[1] *= k; q.d[2] *= k; } else { q.d[1] *= k; q.d[2] *= k; }
    }
    return q;
  });

  return {
    baseId: base.id, base, mods: m, colors: { ...base.colors, ...colors },
    phys: ph, parts, cam: base.cam, span: base.span * m.wing,
    startBonusAlt: base.startBonusAlt || 0,
  };
}

/** Human-friendly stats for the cards. */
export function statsOf(ph) {
  const top = ph.thrust > 0 ? Math.sqrt(ph.thrust / ph.drag) : 0;
  return {
    topKmh: Math.round(top * 3.6),
    stallKmh: Math.round(ph.vStall * 3.6),
    agility: Math.min(1, ph.roll / 3.2),
    speed01: Math.min(1, top / 260),
    lift01: Math.min(1, Math.max(0, (70 - ph.vStall) / 50)),
  };
}
