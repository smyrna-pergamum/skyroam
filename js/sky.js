/* global Cesium */
// Day and night. Cesium's own sun lighting drives the terminator, the sky colour and the stars;
// NASA Black Marble city lights show on the night side. The time of day is either the real time
// at the place ('auto') or a fixed moment of the local solar day ('day' | 'dusk' | 'night').

export const TIME_MODES = ['auto', 'day', 'dusk', 'night'];

const NIGHT_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
const D2R = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Street lights for the close-up view. NASA's night map is ~500 m per pixel, a soft glow from low
// altitude; here each satellite tile is turned into points of light: built-up grey and roads glow
// warm, water, forest, fields and snow stay dark. Deterministic per pixel, so tiles never flicker.
function lightsProvider() {
  const p = new Cesium.UrlTemplateImageryProvider({ url: ESRI, maximumLevel: 16, credit: new Cesium.Credit('Imagery © Esri, Maxar, Earthstar Geographics') });
  const fetchTile = p.requestImage.bind(p);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  let empty = null; // far tiles (zoom < 11) stay empty: no download, NASA's glow covers them
  p.requestImage = (x, y, level, request) => {
    if (level < 11) return (empty ||= createImageBitmap(new ImageData(1, 1)));
    const pending = fetchTile(x, y, level, request);
    if (!pending) return pending;
    return pending.then(img => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
      const d = ctx.getImageData(0, 0, 256, 256).data;
      // built-up score per 4×4 block: grey, mid-bright pixels; not water, vegetation, snow or shadow
      const block = new Float32Array(64 * 64);
      for (let i = 0, px = 0; i < d.length; i += 4, px++) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = 0.3 * r + 0.59 * g + 0.11 * b;
        if (lum < 70 || lum > 235 || mx - mn > 46 || g > r + 6 || b > r + 12) continue;
        block[((px >> 10) << 6) + ((px & 255) >> 2)] += Math.min(1, (lum - 70) / 90) * (1 - (mx - mn) / 46) / 16;
      }
      ctx.clearRect(0, 0, 256, 256);
      const dens = Math.min(1, 0.4 + (level - 11) * 0.13); // more lamps as you get closer
      for (let k = 0; k < 4096; k++) {
        const u = block[k];
        if (u < 0.15) continue;
        const bx = (k & 63) * 4, by = (k >> 6) * 4;
        // a soft warm floor that survives texture filtering from far away
        ctx.fillStyle = `rgba(255,170,80,${(0.14 + u * 0.3).toFixed(3)})`;
        ctx.fillRect(bx, by, 4, 4);
        let h = (k * 2654435761 + x * 97 + y * 131 + level) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
        if ((h & 1023) / 1024 > Math.min(0.9, u * dens * 1.7)) continue;
        const white = ((h >>> 12) & 3) === 0;                         // a few cool white lamps among sodium ones
        ctx.fillStyle = white ? 'rgba(255,244,220,0.95)' : 'rgba(255,196,110,0.95)';
        ctx.beginPath();
        ctx.arc(bx + 0.5 + ((h >>> 16) & 3), by + 0.5 + ((h >>> 20) & 3), 1.25 + u * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      return createImageBitmap(canvas);
    });
  };
  return p;
}

export class Sky {
  constructor(viewer) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.mode = 'auto';
    this.night = null;
    this.elev = 90;           // sun elevation (deg) at the last point asked about
    this._sun = new Cesium.Cartesian3();
    this._n = new Cesium.Cartesian3();
    this._p = new Cesium.Cartesian3();
    this._m = new Cesium.Matrix3();

    const g = this.scene.globe;
    g.baseColor = Cesium.Color.fromCssColorString('#04060b'); // the default blue shows through the night side
    g.enableLighting = true;            // real sun: terminator, darker sky, stars at night
    g.dynamicAtmosphereLighting = true;
    g.dynamicAtmosphereLightingFromSun = true;
    // Real low-sun lighting leaves the ground almost black; lift it so dusk still reads.
    g.lambertDiffuseMultiplier = 4.5;
    g.vertexShadowDarkness = 0.42;
    g.lightingFadeOutDistance = 6.5e7; g.lightingFadeInDistance = 9e7; // keep lighting on from any height
    g.nightFadeOutDistance = 6.5e7; g.nightFadeInDistance = 9e7;
    this.scene.highDynamicRange = false;  // no white glare on the city lights
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;
  }

  /** Call after the base map is in place (it may be replaced later; update() re-adds the lights). */
  attach() {
    const layers = this.viewer.imageryLayers;
    for (let i = 0; i < layers.length; i++) {
      const l = layers.get(i);
      if (l !== this.night && l !== this.lamps) { l.nightAlpha = 0.2; l.dayAlpha = 1; }
    }
    if (!this.night || !layers.contains(this.night)) {
      this.night = layers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: NIGHT_URL, maximumLevel: 8,
        credit: new Cesium.Credit('City lights: NASA Black Marble (GIBS)'),
      }));
    }
    if (!this.lamps || !layers.contains(this.lamps)) this.lamps = layers.addImageryProvider(lightsProvider());
    layers.raiseToTop(this.night);
    layers.raiseToTop(this.lamps);
    Object.assign(this.night, { dayAlpha: 0, nightAlpha: 0.8, brightness: 0.5, contrast: 2.4, gamma: 2.6, saturation: 1.3 });
    Object.assign(this.lamps, { dayAlpha: 0, nightAlpha: 1, show: false });
  }

  /** Close to the ground the street lights carry the night; from high up NASA's glow does. */
  _grade(dark, height) {
    if (!this.night) return;
    const low = 1 - Math.min(1, Math.max(0, (height - 2500) / 12000));
    this.night.nightAlpha = 0.85 - 0.55 * low;
    this.lamps.show = dark > 0.05;   // no extra tile requests in daylight
  }

  /** Sun elevation in degrees above the horizon at lon/lat (degrees). */
  sunElevation(lonDeg, latDeg, time = this.viewer.clock.currentTime) {
    const sun = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, this._sun);
    const m = Cesium.Transforms.computeIcrfToFixedMatrix(time, this._m) || Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, this._m);
    Cesium.Matrix3.multiplyByVector(m, sun, sun);
    const p = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, 0, Cesium.Ellipsoid.WGS84, this._p);
    const n = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(p, this._n);
    Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(sun, p, sun), sun);
    return Math.asin(Cesium.Cartesian3.dot(sun, n)) / D2R;
  }

  /** Set the clock for the chosen mode at this place. */
  setMode(mode, lonDeg, latDeg) {
    this.mode = TIME_MODES.includes(mode) ? mode : 'auto';
    const clock = this.viewer.clock;
    const now = Cesium.JulianDate.now();
    if (this.mode === 'auto') { clock.currentTime = now; return; }
    // Local solar noon today: 12:00 UTC shifted by longitude.
    const noon = Cesium.JulianDate.fromDate(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 12)));
    Cesium.JulianDate.addSeconds(noon, -lonDeg / 15 * 3600, noon);
    if (this.mode === 'day') { Cesium.JulianDate.addSeconds(noon, -1.5 * 3600, clock.currentTime); return; } // late morning light
    if (this.mode === 'night') { Cesium.JulianDate.addSeconds(noon, 11 * 3600, clock.currentTime); return; }
    // dusk: walk the afternoon until the sun is 1° above the horizon
    const t = new Cesium.JulianDate();
    let pick = Cesium.JulianDate.addSeconds(noon, 5 * 3600, new Cesium.JulianDate());
    for (let s = 0; s <= 12 * 3600; s += 300) {
      Cesium.JulianDate.addSeconds(noon, s, t);
      if (this.sunElevation(lonDeg, latDeg, t) < 1) { pick = Cesium.JulianDate.clone(t); break; }
    }
    clock.currentTime = pick;
  }

  /** Per frame (cheap enough), with the camera's position in degrees. Returns darkness 0..1. */
  update(lonDeg, latDeg, cloud = 0) {
    if (this.night && (!this.viewer.imageryLayers.contains(this.night) || !this.viewer.imageryLayers.contains(this.lamps))) this.attach();
    this.elev = this.sunElevation(lonDeg, latDeg);
    const dark = 1 - smooth(-7, 4, this.elev);      // 0 day … 1 full night
    const sa = this.scene.skyAtmosphere;
    sa.brightnessShift = -0.25 * cloud - 0.15 * dark;
    sa.saturationShift = -0.55 * cloud;
    // the ground's own atmosphere glows blue at night; dim it so the lights carry the scene
    const ga = this.scene.atmosphere;
    if (ga) { ga.brightnessShift = -0.7 * dark - 0.15 * cloud; ga.saturationShift = -0.4 * dark - 0.3 * cloud; }
    this.scene.globe.showGroundAtmosphere = dark < 0.6;
    // models (and the generated aircraft) get dimmer at night, never fully black
    if (this.scene.light) this.scene.light.intensity = Math.max(0.45, 2.0 * (1 - 0.7 * dark) * (1 - 0.35 * cloud));
    // overcast: a flatter, dimmer ground
    const layers = this.viewer.imageryLayers;
    for (let i = 0; i < layers.length; i++) {
      const l = layers.get(i);
      if (l !== this.night && l !== this.lamps) { l.brightness = 1 - 0.3 * cloud; l.saturation = 1 - 0.35 * cloud; }
    }
    this.dark = dark;
    this._grade(dark, this.viewer.camera.positionCartographic.height);
    return dark;
  }
}
