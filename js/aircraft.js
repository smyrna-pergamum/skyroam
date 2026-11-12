// Aircraft roster: 100 real-world types (data in fleet.js, models + flight models generated in fleetgen.js).
import { FLEET } from './fleet.js';
import { makeBase } from './fleetgen.js';

export const AIRCRAFT = FLEET.map(makeBase);

// Ids of the original hand-built aircraft (v1-v3), mapped to their closest real types so saved
// choices and hangar builds keep working.
export const ALIASES = {
  serce: 'cessna-172', akrobat: 'pitts-s2b', suzulen: 'ask-21', bizjet: 'citation-cj4', regional: 'atr72-600',
  yolcu: 'a320neo', dev: 'b777-300er', yuk: 'c-130j', pervane: 'p-51d', sahin: 'f-16c', golge: 'b-2',
};
export const baseById = id => AIRCRAFT.find(a => a.id === (ALIASES[id] || id)) || AIRCRAFT.find(a => a.id === 'cessna-172') || AIRCRAFT[0];

export const CATEGORIES = ['civil', 'commercial', 'military', 'historic'];

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

  // Parts are only needed when the aircraft is actually shown, so build them lazily.
  let partsCache = null;
  const makeParts = () => base.build().map(p => {
    const k = Math.pow(m.power, 0.35);
    if (p.s === 'mesh') {
      if (m.wing === 1 || (p.tag !== 'wing' && !p.onWing)) return p;
      return { ...p, pos: p.pos.map((v, i) => (i % 3 === 1 ? v * m.wing : v)) };
    }
    const q = { ...p, d: [...p.d], p: [...p.p] };
    if (p.tag === 'wing') { q.d[1] *= m.wing; q.p[1] *= m.wing; }
    if (p.tag === 'eng') {
      if (Math.abs(q.p[1]) > 0.5) q.p[1] *= m.wing;
      if (p.s === 'cyl') { q.d[1] *= k; q.d[2] *= k; } else if (p.s === 'ell') { q.d = q.d.map(v => v * k); } else { q.d[1] *= k; q.d[2] *= k; }
    }
    if (p.tag === 'gear' && Math.abs(q.p[1]) > 1.5) q.p[1] *= m.wing;
    return q;
  });

  return {
    baseId: base.id, base, mods: m, colors: { ...base.colors, ...colors },
    phys: ph, get parts() { return (partsCache ||= makeParts()); }, cam: base.cam, cockpit: base.cockpit, span: base.span * m.wing,
    startBonusAlt: base.startBonusAlt || 0, model: base.model || null,
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
