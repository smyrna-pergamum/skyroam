/* global Cesium */
// Builds the selected aircraft from its part list (see aircraft.js) as one Cesium Primitive.
// Body frame: +x forward, +y left, +z up (Cesium's heading/pitch/roll frame).

const FIXED_COLORS = { k: '#1f2937', g: '#0b1a2e', m: '#9ca3af' };
const D2R = Math.PI / 180;

function partMatrix(part) {
  const [yaw, pitch, roll] = part.r.map(a => a * D2R);
  const rz = Cesium.Matrix3.fromRotationZ(yaw);
  const rx = Cesium.Matrix3.fromRotationX(roll);
  const ry = Cesium.Matrix3.fromRotationY(pitch);
  const rot = Cesium.Matrix3.multiply(Cesium.Matrix3.multiply(rz, rx, new Cesium.Matrix3()), ry, new Cesium.Matrix3());
  return Cesium.Matrix4.fromRotationTranslation(rot, new Cesium.Cartesian3(...part.p));
}

function partGeometry(part) {
  const vf = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
  if (part.s === 'cyl') {
    const [length, rb, rf] = part.d;
    return new Cesium.CylinderGeometry({ length, topRadius: rf, bottomRadius: rb, slices: 18, vertexFormat: vf });
  }
  return Cesium.BoxGeometry.fromDimensions({ vertexFormat: vf, dimensions: new Cesium.Cartesian3(...part.d) });
}

export class PlaneModel {
  constructor(scene) {
    this.scene = scene;
    this.primitive = null;
    this.matrix = new Cesium.Matrix4();
    this._pos = new Cesium.Cartesian3();
    this._hpr = new Cesium.HeadingPitchRoll();
    this._show = false;
  }

  /** (Re)build from a resolved aircraft. */
  build(ac) {
    if (this.primitive) this.scene.primitives.remove(this.primitive);
    const colorOf = c => Cesium.Color.fromCssColorString(ac.colors[c] || FIXED_COLORS[c] || '#ffffff');
    const instances = ac.parts.map(part => new Cesium.GeometryInstance({
      geometry: partGeometry(part),
      modelMatrix: partMatrix(part),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(colorOf(part.c)) },
    }));
    this.primitive = this.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
      show: this._show,
    }));
    Cesium.Matrix4.clone(this.matrix, this.primitive.modelMatrix);
  }

  /** s: lon/lat (rad), h (m), heading/pitch/roll (rad). Returns the body->world matrix. */
  update(s) {
    Cesium.Cartesian3.fromRadians(s.lon, s.lat, s.h, Cesium.Ellipsoid.WGS84, this._pos);
    this._hpr.heading = s.heading - Math.PI / 2; // Cesium: heading 0 points +x east; ours is north
    this._hpr.pitch = s.pitch;
    this._hpr.roll = s.roll;
    Cesium.Transforms.headingPitchRollToFixedFrame(this._pos, this._hpr, Cesium.Ellipsoid.WGS84, undefined, this.matrix);
    if (this.primitive) Cesium.Matrix4.clone(this.matrix, this.primitive.modelMatrix);
    return this.matrix;
  }

  set visible(v) { this._show = v; if (this.primitive) this.primitive.show = v; }
}
