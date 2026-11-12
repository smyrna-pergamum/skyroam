/* global Cesium */
// Ring course: N glowing rings placed ahead of the plane. Pass them in order.

const R_EARTH = 6378137;
const SEGMENTS = 48;

const COLOR_NEXT = Cesium.Color.fromCssColorString('#facc15');
const COLOR_LATER = Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.55);

function rand(a, b) { return a + Math.random() * (b - a); }

export class RingCourse {
  constructor(viewer) {
    this.viewer = viewer;
    this.rings = [];
    this.index = 0;
    this.radius = 45;
    this.active = false;
    this._local = new Cesium.Cartesian3();
    this._pos = new Cesium.Cartesian3();
  }

  clear() {
    for (const r of this.rings) this.viewer.entities.remove(r.entity);
    this.rings = [];
    this.index = 0;
    this.active = false;
  }

  /** Build a course starting ahead of state s. sampleTerrain: whether real terrain heights exist. */
  async build(s, count, sampleTerrain) {
    this.clear();
    let lat = s.lat, lon = s.lon, hdg = s.heading, alt = s.h;
    const pts = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) hdg += rand(-0.5, 0.5);
      const dist = i === 0 ? 900 : rand(650, 1000);
      lat += (dist * Math.cos(hdg)) / R_EARTH;
      lon += (dist * Math.sin(hdg)) / (R_EARTH * Math.cos(lat));
      alt += i === 0 ? 0 : rand(-90, 90);
      pts.push({ lat, lon, alt, hdg });
    }

    let ground = pts.map(() => 0);
    if (sampleTerrain) {
      try {
        const cs = pts.map(p => new Cesium.Cartographic(p.lon, p.lat));
        await Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, cs);
        ground = cs.map(c => c.height || 0);
      } catch (e) { /* keep sea level */ }
    }
    pts.forEach((p, i) => { p.alt = Math.max(p.alt, ground[i] + 140); });

    this.rings = pts.map((p, i) => this._makeRing(p, i));
    this.index = 0;
    this.active = true;
    this._prevD = -Infinity;
    this._restyle();
  }

  _makeRing(p, i) {
    const center = Cesium.Cartesian3.fromRadians(p.lon, p.lat, p.alt);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
    // Ring lies in the plane spanned by "right" (perpendicular to travel) and "up".
    const rx = Math.cos(p.hdg), ry = -Math.sin(p.hdg);
    const positions = [];
    for (let k = 0; k <= SEGMENTS; k++) {
      const a = (k / SEGMENTS) * Math.PI * 2;
      const local = new Cesium.Cartesian3(
        this.radius * Math.cos(a) * rx,
        this.radius * Math.cos(a) * ry,
        this.radius * Math.sin(a),
      );
      positions.push(Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3()));
    }
    const entity = this.viewer.entities.add({
      polyline: {
        positions,
        width: 9,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: COLOR_LATER }),
      },
    });
    return { center, inv, nx: Math.sin(p.hdg), ny: Math.cos(p.hdg), entity, passed: false, i };
  }

  _restyle() {
    this.rings.forEach((r, i) => {
      r.entity.show = !r.passed && i < this.index + 4;
      r.entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
        glowPower: i === this.index ? 0.35 : 0.2,
        color: i === this.index ? COLOR_NEXT : COLOR_LATER,
      });
      r.entity.polyline.width = i === this.index ? 12 : 7;
    });
  }

  get next() { return this.rings[this.index]; }
  get done() { return this.active && this.index >= this.rings.length; }

  /**
   * Check whether the plane crossed the current ring this tick.
   * Returns 'pass' | 'finish' | null.
   */
  check(posCartesian) {
    const r = this.next;
    if (!this.active || !r) return null;
    const l = Cesium.Matrix4.multiplyByPoint(r.inv, posCartesian, this._local);
    const d = l.x * r.nx + l.y * r.ny;                       // distance along travel direction
    const lateral = Math.sqrt(Math.max(0, l.x * l.x + l.y * l.y + l.z * l.z - d * d));
    const crossed = this._prevD < 0 && d >= 0;
    this._prevD = d;
    if (crossed && lateral <= this.radius) {
      r.passed = true;
      this.index++;
      this._prevD = -Infinity;
      this._restyle();
      return this.index >= this.rings.length ? 'finish' : 'pass';
    }
    return null;
  }

  /** Vector info to the current ring for the HUD arrow. */
  navInfo(s) {
    const r = this.next;
    if (!r) return null;
    const c = Cesium.Cartographic.fromCartesian(r.center);
    const dLat = c.latitude - s.lat;
    const dLon = (c.longitude - s.lon) * Math.cos(s.lat);
    const north = dLat * R_EARTH, east = dLon * R_EARTH;
    const bearing = Math.atan2(east, north);
    let rel = bearing - s.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    return { dist: Math.hypot(north, east), rel, dy: c.height - s.h };
  }
}
