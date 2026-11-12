/* global Cesium */
// A small original plane built from boxes, so the project ships with no third-party model.
// Body frame: +x forward, +y left, +z up (Cesium's heading/pitch/roll frame).

const PARTS = [
  // size x, y, z        offset x, y, z        colour
  [[8.0, 1.3, 1.3],     [0.0, 0, 0.0],        '#eef2f7'], // fuselage
  [[1.6, 1.0, 1.0],     [4.6, 0, -0.05],      '#2563eb'], // nose
  [[0.25, 0.25, 0.25],  [5.5, 0, -0.05],      '#111827'], // spinner
  [[0.12, 0.18, 3.0],   [5.6, 0, -0.05],      '#374151'], // propeller blade
  [[1.4, 0.95, 0.75],   [1.6, 0, 0.9],        '#0f172a'], // canopy
  [[2.0, 12.5, 0.22],   [0.9, 0, 0.35],       '#eef2f7'], // wing
  [[0.7, 12.6, 0.24],   [0.2, 0, 0.36],       '#dc2626'], // wing trailing stripe
  [[1.4, 4.4, 0.18],    [-3.6, 0, 0.35],      '#eef2f7'], // horizontal stabiliser
  [[1.5, 0.2, 2.0],     [-3.7, 0, 1.4],       '#dc2626'], // fin
  [[0.25, 0.25, 1.1],   [1.3, 1.4, -0.85],    '#374151'], // left gear leg
  [[0.25, 0.25, 1.1],   [1.3, -1.4, -0.85],   '#374151'], // right gear leg
  [[0.6, 0.3, 0.6],     [1.3, 1.4, -1.35],    '#111827'], // left wheel
  [[0.6, 0.3, 0.6],     [1.3, -1.4, -1.35],   '#111827'], // right wheel
];

export class PlaneModel {
  constructor(scene) {
    const instances = PARTS.map(([size, off, col]) => new Cesium.GeometryInstance({
      geometry: Cesium.BoxGeometry.fromDimensions({
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        dimensions: new Cesium.Cartesian3(...size),
      }),
      modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(...off)),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(col)),
      },
    }));
    this.primitive = scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
      show: false,
    }));
    this.matrix = new Cesium.Matrix4();
    this._pos = new Cesium.Cartesian3();
    this._hpr = new Cesium.HeadingPitchRoll();
  }

  /** Place the plane; s holds lon/lat (rad), h (m), heading/pitch/roll (rad). Returns the body->world matrix. */
  update(s) {
    Cesium.Cartesian3.fromRadians(s.lon, s.lat, s.h, Cesium.Ellipsoid.WGS84, this._pos);
    // Cesium heading 0 points the model's +x east; ours is 0 = north.
    this._hpr.heading = s.heading - Math.PI / 2;
    this._hpr.pitch = s.pitch;
    this._hpr.roll = s.roll;
    Cesium.Transforms.headingPitchRollToFixedFrame(this._pos, this._hpr, Cesium.Ellipsoid.WGS84, undefined, this.matrix);
    Cesium.Matrix4.clone(this.matrix, this.primitive.modelMatrix);
    return this.matrix;
  }

  set visible(v) { this.primitive.show = v; }
}
