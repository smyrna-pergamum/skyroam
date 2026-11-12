// Arcade flight model. Runs at a fixed timestep (see FIXED_DT); everything is SI units and radians.
// Frame: heading clockwise from north, pitch positive = nose up, roll positive = right wing down.

export const FIXED_DT = 1 / 120;

const G = 9.81;
const R_EARTH = 6378137;
const THRUST = 8.5;        // m/s² at full throttle
const DRAG = 0.0007;       // quadratic drag coefficient -> ~110 m/s top speed in level flight
const AIRBRAKE = 0.0016;   // extra drag with the air brake out
const V_STALL = 36;        // m/s
const V_ROTATE = 42;       // m/s: minimum speed to lift off
const GEAR_H = 1.6;        // m: height of the plane's origin above the wheels

// Landing limits
const MAX_SINK = -5;       // m/s
const MAX_BANK = 0.26;     // rad (~15°)
const MAX_LAND_SPEED = 95; // m/s

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap2pi = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

export function createFlight(loc) {
  return {
    lon: loc.lon * Math.PI / 180,
    lat: loc.lat * Math.PI / 180,
    h: loc.alt,
    heading: loc.heading * Math.PI / 180,
    pitch: 0,
    roll: 0,
    speed: 70,
    throttle: 0.6,
    vs: 0,
    agl: Infinity,
    ground: undefined,   // last known ground height (m MSL)
    onGround: false,
    stalled: false,
    crashed: false,
    landedEvent: null,   // set to {sink} on the tick the wheels touch down safely
  };
}

/** Copy only the fields the renderer interpolates. */
export function snapshot(s, out = {}) {
  out.lon = s.lon; out.lat = s.lat; out.h = s.h;
  out.heading = s.heading; out.pitch = s.pitch; out.roll = s.roll;
  return out;
}

/** Interpolate between two snapshots (alpha 0..1), taking the short way round for heading. */
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
 * Advance the simulation by one fixed tick.
 * inp: { pitch, roll, yaw: -1..1, throttleRate: -1..1, throttleAbs: 0..1|null, brake: bool }
 * groundH: terrain height under the plane in m, or undefined when unknown.
 */
export function stepFlight(s, inp, dt, groundH, opts) {
  if (s.crashed) return;
  s.landedEvent = null;

  // --- Throttle
  if (inp.throttleAbs != null) s.throttle = inp.throttleAbs;
  else s.throttle = clamp(s.throttle + inp.throttleRate * 0.55 * dt, 0, 1);

  const v = s.speed;
  const authority = clamp(v / 45, 0.15, 1);   // controls go mushy when slow
  const lift = clamp((v / V_STALL) ** 2, 0, 1);

  // --- Roll
  s.roll += inp.roll * 1.4 * authority * dt;
  if (opts.assist && Math.abs(inp.roll) < 0.05) s.roll -= s.roll * 1.1 * dt;
  s.roll = clamp(s.roll, -1.4, 1.4);

  // --- Pitch input acts in the body frame: when banked, pulling back also turns.
  const q = inp.pitch * 0.6 * authority;
  let dPitch = q * Math.cos(s.roll);
  let dHead = q * Math.sin(s.roll) / Math.max(0.3, Math.cos(s.pitch));

  // Coordinated turn from bank, plus a little nose drop when banked hard.
  if (!s.onGround) {
    dHead += G * Math.tan(clamp(s.roll, -1.3, 1.3)) / Math.max(v, 25) * Math.cos(s.pitch) * 0.9;
    dPitch -= (1 - Math.cos(s.roll)) * 0.12;
  }
  dHead += inp.yaw * (s.onGround ? 0.5 : 0.35) * authority;

  // Stall: the nose falls toward -35°.
  s.stalled = !s.onGround && v < V_STALL;
  if (s.stalled) dPitch += (1 - lift) * (-0.6 - s.pitch) * 1.4;

  if (opts.assist && Math.abs(inp.pitch) < 0.05 && !s.onGround && !s.stalled) {
    dPitch -= s.pitch * 0.08; // gentle settle toward level
  }

  s.pitch = clamp(s.pitch + dPitch * dt, -1.3, 1.3);
  s.heading = wrap2pi(s.heading + dHead * dt);

  // --- Speed along the flight path
  let drag = DRAG * v * v;
  if (inp.brake) drag += s.onGround ? 6 : AIRBRAKE * v * v;
  if (s.onGround) drag += 0.35; // rolling resistance
  const acc = THRUST * s.throttle - drag - G * Math.sin(s.pitch);
  s.speed = Math.max(0, v + acc * dt);

  // --- Velocity in local east/north/up
  const vh = s.speed * Math.cos(s.pitch);
  let vu = s.speed * Math.sin(s.pitch);
  if (!s.onGround) vu -= (1 - lift) * 12;          // sink when slow
  if (s.onGround && s.speed < V_ROTATE) vu = Math.min(vu, 0);

  const ve = vh * Math.sin(s.heading);
  const vn = vh * Math.cos(s.heading);
  s.lat += (vn * dt) / R_EARTH;
  s.lon += (ve * dt) / (R_EARTH * Math.cos(s.lat));
  s.h += vu * dt;
  s.vs = vu;

  // --- Ground contact
  if (groundH !== undefined && Number.isFinite(groundH)) s.ground = groundH;
  if (s.ground === undefined) { s.agl = Infinity; return; }

  s.agl = s.h - s.ground - GEAR_H;
  if (s.agl <= 0) {
    if (!s.onGround) {
      const ok = vu > MAX_SINK && Math.abs(s.roll) < MAX_BANK && s.pitch > -0.15 && s.speed < MAX_LAND_SPEED;
      if (!ok) { s.crashed = true; s.speed = 0; return; }
      s.onGround = true;
      s.landedEvent = { sink: vu };
    }
    s.h = s.ground + GEAR_H;
    s.agl = 0;
    s.vs = 0;
    if (s.pitch < 0) s.pitch = 0;
    if (s.speed < V_ROTATE) s.pitch = Math.min(s.pitch, 0.08);
    s.roll *= Math.max(0, 1 - 5 * dt);
  } else if (s.agl > 0.3) {
    s.onGround = false;
  }
}

export const LIMITS = { V_STALL, V_ROTATE, GEAR_H };
