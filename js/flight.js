// Arcade flight model. Runs at a fixed timestep (see FIXED_DT); SI units and radians.
// Frame: heading clockwise from north, pitch positive = nose up, roll positive = right wing down.
// Each aircraft supplies its own `ph` (see aircraft.js).

export const FIXED_DT = 1 / 120;

const G = 9.81;
const R_EARTH = 6378137;
const MAX_BANK = 0.26; // rad (~15°) allowed at touchdown

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap2pi = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** start: {lat, lon (deg), alt (m), heading (deg)} */
export function createFlight(start, ph) {
  return {
    lon: start.lon * Math.PI / 180,
    lat: start.lat * Math.PI / 180,
    h: start.alt,
    heading: start.heading * Math.PI / 180,
    pitch: ph.engine === 'none' ? -0.05 : 0,
    roll: 0,
    speed: ph.startSpeed,
    throttle: ph.engine === 'none' ? 0 : 0.65,
    vs: 0,
    agl: Infinity,
    ground: undefined,
    onGround: false,
    stalled: false,
    crashed: false,
    landedEvent: null,
  };
}

export function snapshot(s, out = {}) {
  out.lon = s.lon; out.lat = s.lat; out.h = s.h;
  out.heading = s.heading; out.pitch = s.pitch; out.roll = s.roll;
  return out;
}

export function lerpSnap(a, b, alpha, out = {}) {
  const L = (x, y) => x + (y - x) * alpha;
  out.lon = L(a.lon, b.lon); out.lat = L(a.lat, b.lat); out.h = L(a.h, b.h);
  let dh = b.heading - a.heading;
  if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
  out.heading = a.heading + dh * alpha;
  out.pitch = L(a.pitch, b.pitch); out.roll = L(a.roll, b.roll);
  return out;
}

/**
 * Advance one fixed tick.
 * inp: { pitch, roll, yaw: -1..1, throttleRate: -1..1, throttleAbs: 0..1|null, brake: bool }
 */
export function stepFlight(s, inp, dt, groundH, opts, ph) {
  if (s.crashed) return;
  s.landedEvent = null;

  if (ph.engine !== 'none') {
    if (inp.throttleAbs != null) s.throttle = inp.throttleAbs;
    else s.throttle = clamp(s.throttle + inp.throttleRate * 0.55 * dt, 0, 1);
  }

  const v = s.speed;
  const authority = clamp(v / (ph.vStall * 1.3), 0.15, 1);
  const lift = clamp((v / ph.vStall) ** 2, 0, 1);

  // Roll
  s.roll += inp.roll * ph.roll * authority * dt;
  if (opts.assist && Math.abs(inp.roll) < 0.05) s.roll -= s.roll * 1.1 * dt;
  s.roll = clamp(s.roll, -1.4, 1.4);

  // Pitch input in the body frame: banked + pull = turn
  const q = inp.pitch * ph.pitch * authority;
  let dPitch = q * Math.cos(s.roll);
  let dHead = q * Math.sin(s.roll) / Math.max(0.3, Math.cos(s.pitch));

  if (!s.onGround) {
    dHead += G * Math.tan(clamp(s.roll, -1.3, 1.3)) / Math.max(v, 25) * Math.cos(s.pitch) * 0.9;
    dPitch -= (1 - Math.cos(s.roll)) * 0.12;
  }
  dHead += inp.yaw * (s.onGround ? 0.5 : 0.35) * authority;

  s.stalled = !s.onGround && v < ph.vStall;
  if (s.stalled) dPitch += (1 - lift) * (-0.6 - s.pitch) * 1.4;
  if (opts.assist && Math.abs(inp.pitch) < 0.05 && !s.onGround && !s.stalled) dPitch -= s.pitch * 0.08;

  s.pitch = clamp(s.pitch + dPitch * dt, -1.3, 1.3);
  s.heading = wrap2pi(s.heading + dHead * dt);

  // Speed along the flight path
  let drag = ph.drag * v * v;
  if (inp.brake) drag += s.onGround ? 6 : ph.drag * 2.3 * v * v;
  if (s.onGround) drag += 0.35;
  const acc = ph.thrust * s.throttle - drag - G * Math.sin(s.pitch);
  s.speed = Math.max(0, v + acc * dt);

  const vh = s.speed * Math.cos(s.pitch);
  let vu = s.speed * Math.sin(s.pitch);
  if (!s.onGround) vu -= (1 - lift) * 12;
  if (s.onGround && s.speed < ph.vRotate) vu = Math.min(vu, 0);

  s.lat += (vh * Math.cos(s.heading) * dt) / R_EARTH;
  s.lon += (vh * Math.sin(s.heading) * dt) / (R_EARTH * Math.cos(s.lat));
  s.h += vu * dt;
  s.vs = vu;

  // Ground contact
  if (groundH !== undefined && Number.isFinite(groundH)) s.ground = groundH;
  if (s.ground === undefined) { s.agl = Infinity; return; }

  s.agl = s.h - s.ground - ph.gearH;
  // Wheels follow the ground while rolling: the terrain under the runway can read a few metres lower
  // when map tiles refine, which must not count as a lift-off (and then a hard landing). Only lifting
  // off at flying speed, or rolling off a real drop, leaves the ground.
  if (s.onGround && s.agl > 0 && (s.speed < ph.vRotate || (vu <= 0.5 && s.agl < 3))) s.agl = 0;
  if (s.agl <= 0) {
    if (!s.onGround) {
      const ok = vu > ph.maxSink && Math.abs(s.roll) < MAX_BANK && s.pitch > -0.15 && s.speed < ph.maxLand;
      if (!ok) { s.crashed = true; s.speed = 0; return; }
      s.onGround = true;
      s.landedEvent = { sink: vu };
    }
    s.h = s.ground + ph.gearH;
    s.agl = 0;
    s.vs = 0;
    if (s.pitch < 0) s.pitch = 0;
    if (s.speed < ph.vRotate) s.pitch = Math.min(s.pitch, 0.08);
    s.roll *= Math.max(0, 1 - 5 * dt);
  } else if (s.agl > 0.3) {
    s.onGround = false;
  }
}
