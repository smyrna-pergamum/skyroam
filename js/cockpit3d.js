/* global Cesium */
// 3D cockpit: a real cockpit model drawn around the camera in cockpit view. Its eye point is placed on
// the aircraft's eye (ac.cam.cockpit), so it moves rigidly with the aircraft. The model loads the first
// time the cockpit view is used; until then (and for aircraft without one) the 2D panel shows.
import { cockpitFor, creditFor } from './models3d.js';

export class Cockpit3D {
  constructor(scene) {
    this.scene = scene;
    this.spec = null;
    this.models = new Map();   // url -> Promise<Cesium.Model | null>
    this.model = null;         // the model shown for the current aircraft (once loaded)
    this.fix = new Cesium.Matrix4();
    this._active = false;
    this.enabled = true;
    this.onReady = null;
  }

  /** Pick the cockpit for an aircraft and work out where its eye point goes in the body frame. */
  configure(ac) {
    this.spec = cockpitFor(ac);
    if (this.model) this.model.show = false;
    this.model = null;
    this._loading = null;
    if (!this.spec) return;
    const [cx, cz] = ac.cam.cockpit;
    const [ex, ey, ez] = this.spec.eye;
    // glTF (x left, y up, z forward) -> body (x forward, y left, z up)
    Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(cx - ez, -ex, cz - ey), this.fix);
    if (this._active) this.load();
  }

  /** True once the 3D cockpit is on screen (so the 2D panel can step aside). */
  get shown() { return !!(this._active && this.enabled && this.model); }

  set active(v) {
    this._active = v;
    if (v && this.enabled) this.load();
    this.sync();
  }

  sync() { if (this.model) this.model.show = this.shown; }

  load() {
    const spec = this.spec;
    if (!spec || this.model || this._loading === spec) return;
    this._loading = spec;
    if (!this.models.has(spec.url)) {
      const credit = creditFor(spec.url);
      this.models.set(spec.url, Cesium.Model.fromGltfAsync({
        url: spec.url,
        credit: credit ? new Cesium.Credit(credit, false) : undefined,
        // shown (at the Earth's centre, out of sight) so it finishes loading; it is only used once ready
        show: true,
      }).then(m => {
        this.scene.primitives.add(m);
        return m.ready ? m : new Promise(res => m.readyEvent.addEventListener(() => res(m)));
      })
        .catch(e => { console.warn('3D cockpit failed, keeping the 2D panel', e); return null; }));
    }
    this.models.get(spec.url).then(m => {
      if (this._loading === spec) this._loading = null;
      if (!m) return;
      if (this.spec !== spec) { if (m !== this.model) m.show = false; return; }
      this.model = m;
      this.sync();
      if (this.onReady) this.onReady();
    });
  }

  /** M: body -> world matrix of the aircraft for this frame. */
  update(M) {
    if (!this.shown) return;
    Cesium.Matrix4.multiply(M, this.fix, this.model.modelMatrix);
  }
}
