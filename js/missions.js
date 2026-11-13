/* global Cesium */
// Take-off and landing missions on real runways, with runway edge lights and PAPI lights.
import { offset, runwayFrame } from './airports.js';

const GLIDE = 3;            // degrees
const AIM = 300;            // touchdown aim point, metres past the threshold
const D2R = Math.PI / 180;

export class Mission {
  /** type: 'takeoff' | 'landing' | 'ground' (free flight from the runway, no scoring) */
  constructor(viewer, type, rwy, ph) {
    this.viewer = viewer; this.type = type; this.rwy = rwy; this.ph = ph;
    this.t = 0; this.maxCross = 0; this.touch = null; this.done = null; this.rolling = false;
    this.lights = null; this.papi = [];
    this.groundElev = rwy.elev;  // replaced by the terrain height at the threshold when known
  }

  /** Where the flight starts. */
  start() {
    const r = this.rwy;
    if (this.type === 'landing') {
      const d = 9000;
      const p = offset(r.lat, r.lon, r.hdg, -d);
      return { lat: p.lat, lon: p.lon, alt: this.groundElev + Math.tan(GLIDE * D2R) * (d + AIM), heading: r.hdg, air: true };
    }
    const p = offset(r.lat, r.lon, r.hdg, 60);
    return { lat: p.lat, lon: p.lon, alt: this.groundElev, heading: r.hdg, air: false };
  }

  approachSpeed() { return Math.max(this.ph.vStall * 1.3, this.ph.vStall + 10); }

  /** Lights along the runway: white edges, green threshold, red far end, and a PAPI bar on the left. */
  addLights(elevStart, elevEnd) {
    const r = this.rwy, scene = this.viewer.scene;
    this.groundElev = elevStart;
    const pts = this.lights = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const at = (along, cross, color, size = 6) => {
      const k = Math.max(0, Math.min(1, along / r.len));
      const c = offset(r.lat, r.lon, r.hdg, along);
      const q = offset(c.lat, c.lon, r.hdg + 90, cross);
      return pts.add({
        position: Cesium.Cartesian3.fromDegrees(q.lon, q.lat, elevStart + (elevEnd - elevStart) * k + 1.2),
        color, pixelSize: size, scaleByDistance: new Cesium.NearFarScalar(300, 1.5, 15000, 0.8),
      });
    };
    const half = r.width / 2 + 3, white = Cesium.Color.fromCssColorString('#fff3d6');
    for (let a = 0; a <= r.len; a += 60) { at(a, -half, white); at(a, half, white); }
    for (let c = -half; c <= half; c += 5) { at(-2, c, Cesium.Color.LIME, 6); at(r.len + 2, c, Cesium.Color.RED, 6); }
    // PAPI: four lights left of the aim point; each turns white when you are above its angle
    this.papi = [2.5, 2.83, 3.17, 3.5].map((ang, i) => ({ ang, p: at(AIM, -(half + 15 + i * 9), Cesium.Color.RED, 9) }));
  }

  removeLights() {
    if (this.lights) this.viewer.scene.primitives.remove(this.lights);
    this.lights = null; this.papi = [];
  }

  /** Per frame: guidance for the HUD; also sets the PAPI lights. */
  guidance(s) {
    const f = runwayFrame(this.rwy, s.lat / D2R, s.lon / D2R);
    const height = s.h - this.groundElev;
    const toAim = AIM - f.along;
    const angle = toAim > 1 ? Math.atan2(height, toAim) / D2R : 90;
    for (const L of this.papi) {
      const white = angle > L.ang;
      if (L.white !== white) { L.white = white; L.p.color = white ? Cesium.Color.WHITE : Cesium.Color.RED; }
    }
    return { along: f.along, cross: f.cross, toThr: -f.along, gsDev: height - Math.tan(GLIDE * D2R) * Math.max(0, toAim), angle };
  }

  /** Every physics step (so a touchdown is never missed): decides the mission result. */
  update(s, dt) {
    if (this.done || this.type === 'ground') return;
    const r = this.rwy, half = r.width / 2;
    const f = runwayFrame(r, s.lat / D2R, s.lon / D2R);
    this.t += dt;

    if (this.type === 'takeoff') {
      if (s.speed > 3) this.rolling = true;
      if (s.onGround && this.rolling) {
        this.maxCross = Math.max(this.maxCross, Math.abs(f.cross));
        if (Math.abs(f.cross) > half + 6) this.finish(false, 'missRanOff');
        else if (f.along > r.len + 80) this.finish(false, 'missOverrun');
      }
      if (!s.onGround && s.agl > 120) this.finish(true, 'missTakeoffOk', { t: this.t, dev: this.maxCross });
      return;
    }

    // landing
    if (s.landedEvent && !this.touch) {
      const onRwy = f.along > -20 && f.along < r.len && Math.abs(f.cross) < half + 4;
      if (!onRwy) { this.finish(false, 'missOffRunway'); return; }
      this.touch = { along: f.along, cross: f.cross, sink: s.landedEvent.sink };
    }
    if (this.touch) {
      this.maxCross = Math.max(this.maxCross, Math.abs(f.cross));
      if (Math.abs(f.cross) > half + 6) this.finish(false, 'missRanOff');
      else if (f.along > r.len + 60) this.finish(false, 'missOverrun');
      else if (s.speed < 2) {
        const T = this.touch;
        // score out of 100: soft touchdown, near the aim point, on the centreline
        const sink = Math.max(0, Math.min(40, (-T.sink - 0.6) * 18));
        const aim = Math.min(35, Math.abs(T.along - AIM) / 20);
        const cl = Math.min(25, Math.abs(T.cross) * 2.5);
        this.finish(true, 'missLandOk', { score: Math.round(100 - sink - aim - cl), sink: -T.sink, aim: T.along - AIM, cl: T.cross });
      }
    } else if (!s.onGround && f.along > r.len) this.finish(false, 'missMissed');
    return;
  }

  finish(ok, key, vals = {}) { this.done = { ok, key, vals }; }
}
