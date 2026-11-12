/* global Cesium */
// Builds the selected aircraft from its part list (see aircraft.js) as one Cesium Primitive.
// Body frame: +x forward, +y left, +z up (Cesium's heading/pitch/roll frame).

const FIXED_COLORS = { k: '#1f2937', g: '#0b1a2e', m: '#9ca3af', c: '#36536e' };
const D2R = Math.PI / 180;

function partMatrix(part) {
  if (part.s === 'mesh') return Cesium.Matrix4.IDENTITY;
  const [yaw, pitch, roll] = part.r.map(a => a * D2R);
  const rz = Cesium.Matrix3.fromRotationZ(yaw);
  const rx = Cesium.Matrix3.fromRotationX(roll);
  const ry = Cesium.Matrix3.fromRotationY(pitch);
  const rot = Cesium.Matrix3.multiply(Cesium.Matrix3.multiply(rz, rx, new Cesium.Matrix3()), ry, new Cesium.Matrix3());
  return Cesium.Matrix4.fromRotationTranslation(rot, new Cesium.Cartesian3(...part.p));
}

function partGeometry(part) {
  const vf = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
  if (part.s === 'mesh') return meshGeometry(part);
  if (part.s === 'ell') {
    return new Cesium.EllipsoidGeometry({ radii: new Cesium.Cartesian3(...part.d), stackPartitions: 16, slicePartitions: 20, vertexFormat: vf });
  }
  if (part.s === 'cyl') {
    const [length, rb, rf] = part.d;
    return new Cesium.CylinderGeometry({ length, topRadius: rf, bottomRadius: rb, slices: 18, vertexFormat: vf });
  }
  return Cesium.BoxGeometry.fromDimensions({ vertexFormat: vf, dimensions: new Cesium.Cartesian3(...part.d) });
}

/** Geometry already expressed in body coordinates (lofted fuselage, airfoil panels). */
function meshGeometry(part) {
  const positions = new Float64Array(part.pos);
  const n = positions.length / 3;
  const indices = part.idx ? (n > 65535 ? new Uint32Array(part.idx) : new Uint16Array(part.idx))
    : (n > 65535 ? Uint32Array : Uint16Array).from({ length: n }, (_, i) => i);
  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
      normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(part.nrm) }),
    },
    indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });
}

export class PlaneModel {
  constructor(scene) {
    this.scene = scene;
    this.primitive = null;
    this.matrix = new Cesium.Matrix4();
    this._pos = new Cesium.Cartesian3();
    this._hpr = new Cesium.HeadingPitchRoll();
    this._show = false;
    this.gearPrim = null;
    this.gear = 1;
    this.gearTop = 0;
  }

  /** (Re)build from a resolved aircraft. Gear parts go in their own primitive so they can retract. */
  build(ac) {
    for (const p of [this.primitive, this.gearPrim]) if (p) this.scene.primitives.remove(p);
    this.primitive = this.gearPrim = null;
    const colorOf = c => Cesium.Color.fromCssColorString(ac.colors[c] || FIXED_COLORS[c] || '#ffffff');
    const make = parts => this.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: parts.map(part => new Cesium.GeometryInstance({
        geometry: partGeometry(part),
        modelMatrix: partMatrix(part),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(colorOf(part.c)) },
      })),
      appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
      show: this._show,
    }));
    if (this.gltf) { this.scene.primitives.remove(this.gltf); this.gltf = null; }
    if (ac.model) this.loadGltf(ac);
    const body = ac.parts.filter(p => p.tag !== 'gear');
    const gearParts = ac.parts.filter(p => p.tag === 'gear');
    this.primitive = make(body);
    // Retract pivot: the highest point of the gear (where the legs meet the airframe).
    this.gearTop = gearParts.reduce((m, p) => Math.max(m, p.p[2] + p.d[2] / 2), -Infinity);
    this.gearPrim = gearParts.length ? make(gearParts) : null;
    this.gear = 1;
    Cesium.Matrix4.clone(this.matrix, this.primitive.modelMatrix);
  }

  /** Optional: a real .glb model (models/*.glb) replaces the generated body once it has loaded. */
  async loadGltf(ac) {
    const token = (this._gltfToken = {});
    try {
      const m = await Cesium.Model.fromGltfAsync({ url: ac.model.url || ac.model, scale: ac.model.scale || 1 });
      if (token !== this._gltfToken) return;
      this.gltf = this.scene.primitives.add(m);
      m.show = this._show;
      if (this.primitive) this.primitive.show = false;
      this._gltfFix = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationZ(((ac.model.yaw ?? 0) * Math.PI) / 180));
    } catch (e) { console.warn('Model failed, using the generated one', e); }
  }

  /** s: lon/lat (rad), h (m), heading/pitch/roll (rad). Returns the body->world matrix. */
  update(s) {
    Cesium.Cartesian3.fromRadians(s.lon, s.lat, s.h, Cesium.Ellipsoid.WGS84, this._pos);
    this._hpr.heading = s.heading - Math.PI / 2; // Cesium: heading 0 points +x east; ours is north
    this._hpr.pitch = s.pitch;
    this._hpr.roll = s.roll;
    Cesium.Transforms.headingPitchRollToFixedFrame(this._pos, this._hpr, Cesium.Ellipsoid.WGS84, undefined, this.matrix);
    if (this.primitive) Cesium.Matrix4.clone(this.matrix, this.primitive.modelMatrix);
    if (this.gltf) Cesium.Matrix4.multiply(this.matrix, this._gltfFix, this.gltf.modelMatrix);
    if (this.gearPrim) {
      // gear = 1 down, 0 up: legs fold up into the airframe (scale toward the pivot) and then hide.
      const g = Math.max(0.02, this.gear);
      const fold = this._fold || (this._fold = new Cesium.Matrix4());
      Cesium.Matrix4.fromScale(new Cesium.Cartesian3(1, 1, g), fold);
      fold[14] = this.gearTop * (1 - g);
      Cesium.Matrix4.multiply(this.matrix, fold, this.gearPrim.modelMatrix);
      this.gearPrim.show = this._show && this.gear > 0.04;
    }
    return this.matrix;
  }

  set visible(v) { this._show = v; if (this.primitive) this.primitive.show = v && !this.gltf; if (this.gltf) this.gltf.show = v; if (this.gearPrim) this.gearPrim.show = v && this.gear > 0.04; }
}
