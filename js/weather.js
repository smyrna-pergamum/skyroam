/* global Cesium */
// Live weather from Open-Meteo (free, no key): clouds, haze, rain or snow, wind aloft and turbulence.
// Only the position rounded to ~1 km is sent, and only while weather is set to 'live'.

const API = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'temperature_2m,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_180m,wind_direction_180m,precipitation';
const D2R = Math.PI / 180;
const R = 6378137;
const MAX_CLOUDS = 22;

// WMO weather codes → [tr, en, kind]; kind: clear | cloud | fog | rain | snow | storm
const CODES = {
  0: ['Açık', 'Clear', 'clear'], 1: ['Az bulutlu', 'Mainly clear', 'clear'], 2: ['Parçalı bulutlu', 'Partly cloudy', 'cloud'],
  3: ['Kapalı', 'Overcast', 'cloud'], 45: ['Sis', 'Fog', 'fog'], 48: ['Kırağılı sis', 'Rime fog', 'fog'],
  51: ['Hafif çisenti', 'Light drizzle', 'rain'], 53: ['Çisenti', 'Drizzle', 'rain'], 55: ['Yoğun çisenti', 'Dense drizzle', 'rain'],
  56: ['Donan çisenti', 'Freezing drizzle', 'rain'], 57: ['Donan çisenti', 'Freezing drizzle', 'rain'],
  61: ['Hafif yağmur', 'Light rain', 'rain'], 63: ['Yağmur', 'Rain', 'rain'], 65: ['Şiddetli yağmur', 'Heavy rain', 'rain'],
  66: ['Donan yağmur', 'Freezing rain', 'rain'], 67: ['Donan yağmur', 'Freezing rain', 'rain'],
  71: ['Hafif kar', 'Light snow', 'snow'], 73: ['Kar', 'Snow', 'snow'], 75: ['Yoğun kar', 'Heavy snow', 'snow'], 77: ['Kar taneleri', 'Snow grains', 'snow'],
  80: ['Sağanak', 'Showers', 'rain'], 81: ['Sağanak', 'Showers', 'rain'], 82: ['Şiddetli sağanak', 'Violent showers', 'rain'],
  85: ['Kar sağanağı', 'Snow showers', 'snow'], 86: ['Yoğun kar sağanağı', 'Heavy snow showers', 'snow'],
  95: ['Gök gürültülü fırtına', 'Thunderstorm', 'storm'], 96: ['Dolulu fırtına', 'Thunderstorm, hail', 'storm'], 99: ['Dolulu fırtına', 'Thunderstorm, hail', 'storm'],
};

// Weather the player can pick instead of the live weather (wind in m/s, from the south-west)
export const WX_MODES = ['live', 'clear', 'cloudy', 'overcast', 'rain', 'snow', 'storm', 'fog'];
const PRESETS = {
  clear:    { code: 0,  cloud: 0.05, vis: 40000, wind: 3,   wind180: 6,  gust: 4,  rain: 0 },
  cloudy:   { code: 2,  cloud: 0.5,  vis: 25000, wind: 5,   wind180: 9,  gust: 8,  rain: 0 },
  overcast: { code: 3,  cloud: 1,    vis: 15000, wind: 6,   wind180: 11, gust: 10, rain: 0 },
  rain:     { code: 63, cloud: 0.95, vis: 6000,  wind: 7,   wind180: 12, gust: 12, rain: 2.5 },
  snow:     { code: 73, cloud: 0.95, vis: 2500,  wind: 5,   wind180: 9,  gust: 9,  rain: 1.5, temp: -3 },
  storm:    { code: 95, cloud: 1,    vis: 3500,  wind: 11,  wind180: 18, gust: 24, rain: 6 },
  fog:      { code: 45, cloud: 0.3,  vis: 400,   wind: 1.5, wind180: 3,  gust: 2,  rain: 0 },
};

export const CLEAR = { code: 0, kind: 'clear', temp: null, cloud: 0, vis: 30000, wind: 0, dir: 0, gust: 0, wind180: 0, dir180: 0, rain: 0, live: false };

// smoothed random signal (Ornstein-Uhlenbeck): bumps, never jitter
function ou(state, dt, tau) {
  state.v += (-state.v / tau) * dt + Math.sqrt(2 * dt / tau) * (Math.random() * 2 - 1) * 1.7;
  return state.v;
}


// ------------------------------------------------------------------ overcast deck
// A solid layer of cloud when the sky is (nearly) fully covered: a grey ceiling from below, a sunlit
// carpet of cloud tops from above, white-out inside. Two curved discs that follow the aircraft.
const DECK_SRC = `
float dkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dkNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkHash(i), dkHash(i + vec2(1.0, 0.0)), f.x), mix(dkHash(i + vec2(0.0, 1.0)), dkHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float dkFbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * dkNoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  float n = dkFbm(st * scale);
  float billow = dkFbm(st * scale * 3.7 + n * 2.0);
  m.diffuse = color.rgb * (0.72 + 0.22 * n + 0.14 * billow);
  float r = length(st - 0.5) * 2.0;
  m.alpha = color.a * (1.0 - smoothstep(0.72, 1.0, r));
  return m;
}`;

function deckAppearance(top) {
  const material = new Cesium.Material({
    fabric: { uniforms: { color: new Cesium.Color(1, 1, 1, 1), scale: 160.0 }, source: DECK_SRC },
    translucent: true,
  });
  return new Cesium.MaterialAppearance({
    material, flat: true, translucent: true, closed: false, faceForward: false,
    renderState: {
      cull: { enabled: true, face: top ? Cesium.CullFace.BACK : Cesium.CullFace.FRONT },
      depthTest: { enabled: true }, depthMask: false, blending: Cesium.BlendingState.ALPHA_BLEND,
    },
  });
}

// cloud base and top above the ground (m) for a fully covered sky
const DECK_LAYERS = { cloud: [1100, 1800], rain: [850, 1900], snow: [800, 1700], storm: [750, 2900], fog: [250, 900] };

export class Weather {
  constructor(viewer, canvas) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'live';
    this.now = { ...CLEAR };
    this.utcOffset = null;     // seconds, from Open-Meteo (timezone=auto)
    this.last = null;          // { lat, lon, at }
    this.busy = false;
    this.onChange = null;
    this.clouds = this.scene.primitives.add(new Cesium.CloudCollection({ noiseDetail: 16 }));
    this.drops = [];
    this.flash = 0;
    this.deck = null;           // { lon, lat, base, top, prims } in metres above the ellipsoid
    this.inCloud = 0;           // 0..1 white-out inside the deck
    this.aboveDeck = false;
    this._deckApp = null;
    this.baseFog = this.scene.fog.density;
    this.turb = { roll: { v: 0 }, pitch: { v: 0 }, yaw: { v: 0 } };
    this.manual = null;        // { speed m/s, from deg } when the player sets the wind
    this.wind = { n: 0, e: 0, speed: 0, to: 0 }; // at the aircraft, m/s, direction it blows to (rad)
    this._dirty = false;
    this._cloudDark = -1;
    this._tick = 0;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const r = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * r; this.canvas.height = innerHeight * r;
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
    this._dirty = true;
  }

  setMode(mode) {
    this.mode = WX_MODES.includes(mode) ? mode : 'live';
    this.last = null;
    if (this.mode === 'live') return;
    const p = PRESETS[this.mode];
    this.apply({ ...CLEAR, ...p, kind: CODES[p.code][2], temp: p.temp ?? null, dir: 225, dir180: 240, live: true, preset: true });
  }

  /** Wind set by hand (km/h, the direction it comes from in degrees), or null for the weather's own. */
  setManualWind(kmh, fromDeg) {
    this.manual = Number.isFinite(kmh) ? { speed: Math.max(0, kmh) / 3.6, from: ((fromDeg % 360) + 360) % 360 } : null;
  }

  /** Gusts above the mean wind (m/s), which drive the turbulence. */
  gustExcess() {
    if (this.manual) return this.manual.speed * 0.35;
    return Math.max(0, this.now.gust - this.now.wind);
  }

  /** Fetch again when the aircraft has moved 40 km or 15 minutes have passed. */
  async refresh(latDeg, lonDeg, force = false) {
    if (this.mode !== 'live' || this.busy) return;
    const l = this.last;
    if (!force && l && Date.now() - l.at < 15 * 60e3 && Math.hypot(latDeg - l.lat, (lonDeg - l.lon) * Math.cos(latDeg * D2R)) * 111 < 40) return;
    this.busy = true;
    this.last = { lat: latDeg, lon: lonDeg, at: Date.now() };
    try {
      const q = `latitude=${latDeg.toFixed(2)}&longitude=${lonDeg.toFixed(2)}&current=${FIELDS}&wind_speed_unit=ms&timezone=auto`;
      const r = await fetch(`${API}?${q}`);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), c = j.current || {};
      if (Number.isFinite(j.utc_offset_seconds)) this.utcOffset = j.utc_offset_seconds;
      const code = c.weather_code ?? 0;
      this.apply({
        code, kind: (CODES[code] || CODES[0])[2], temp: c.temperature_2m ?? null,
        cloud: (c.cloud_cover ?? 0) / 100, vis: c.visibility ?? 30000,
        wind: c.wind_speed_10m ?? 0, dir: c.wind_direction_10m ?? 0, gust: c.wind_gusts_10m ?? 0,
        wind180: c.wind_speed_180m ?? (c.wind_speed_10m ?? 0) * 1.5, dir180: c.wind_direction_180m ?? c.wind_direction_10m ?? 0,
        rain: c.precipitation ?? 0, live: true,
      });
    } catch (e) {
      console.warn('Weather unavailable', e);
      this.last = { lat: latDeg, lon: lonDeg, at: Date.now() - 12 * 60e3 }; // try again in ~3 minutes
    } finally { this.busy = false; }
  }

  apply(w) {
    this.now = w;
    // Haze from visibility, thicker under low cloud.
    this.scene.fog.density = Math.max(this.baseFog, Math.min(2.5e-3, 2.2 / Math.max(300, w.vis))) * (1 + w.cloud * 0.5);
    this.clouds.removeAll();
    this._cloudDark = -1;
    this._cloudCount = w.kind === 'fog' ? 0 : Math.round(w.cloud * MAX_CLOUDS);
    this.drops = [];
    this._dirty = true;
    this.removeDeck();
    this.onChange?.(w);
  }

  label(lang) {
    const w = this.now;
    if (!w.live) return '';
    const name = (CODES[w.code] || CODES[0])[lang === 'tr' ? 0 : 1];
    return w.temp === null ? name : `${name}, ${Math.round(w.temp)} °C`;
  }

  /** Wind at a height above ground: the 10 m wind near the ground, growing to the 180 m wind and
   *  then stronger with height (about +60 % by 3 km). Direction veers between the two. */
  windAt(agl) {
    const w = this.now;
    const h = Math.max(0, Number.isFinite(agl) ? agl : 500);
    const k = Math.min(1, h / 180);
    if (this.manual) {
      // the set speed holds from ~180 m up; slower near the ground
      const m = this.manual, to = (m.from + 180) * D2R, speed = m.speed * (0.65 + 0.35 * k);
      this.wind.speed = speed; this.wind.to = to;
      this.wind.n = Math.cos(to) * speed; this.wind.e = Math.sin(to) * speed;
      return this.wind;
    }
    if (!w.live) { this.wind.n = this.wind.e = this.wind.speed = 0; return this.wind; }
    let speed = w.wind + (w.wind180 - w.wind) * k;
    if (h > 180) speed *= 1 + Math.min(1, (h - 180) / 2800) * 0.6;
    let dd = ((w.dir180 - w.dir + 540) % 360) - 180;              // shortest turn between the two
    const from = w.dir + dd * k;
    const to = (from + 180) * D2R;
    this.wind.speed = speed; this.wind.to = to;
    this.wind.n = Math.cos(to) * speed; this.wind.e = Math.sin(to) * speed;
    return this.wind;
  }

  /** The aircraft moves with the air mass (drift) and is bumped by turbulence: stronger in gusty
   *  or stormy air, near the ground, and for light aircraft. sens: 0.5 heavy … 2.5 very light.
   *  Call once per physics step. */
  stepFlight(s, dt, sens = 1) {
    const w = this.now;
    if ((!w.live && !this.manual) || s.crashed) return;
    const v = this.windAt(s.agl);
    if (s.onGround) {
      // on the runway the nose weathervanes a little into a crosswind; the wheels resist most of it
      if (s.speed > 15) s.heading -= Math.sin(v.to - s.heading) * v.speed * 0.0006 * sens * dt * 60 / Math.max(15, s.speed);
      return;
    }
    s.lat += (v.n * dt) / R;
    s.lon += (v.e * dt) / (R * Math.cos(s.lat));
    // turbulence intensity 0..~1.5
    const agl = Number.isFinite(s.agl) ? s.agl : 1000;
    const nearGround = 1 + Math.max(0, 1 - agl / 600) * 0.8;
    let I = (this.gustExcess() / 14 + v.speed / 90) * nearGround;
    if (w.kind === 'storm') I *= 2; else if (w.kind === 'rain' || w.kind === 'snow') I *= 1.25;
    I = Math.min(1, I) * Math.min(1.5, sens);
    if (I < 0.03) return;
    s.roll += ou(this.turb.roll, dt, 0.7) * I * 0.05 * dt;
    s.pitch += ou(this.turb.pitch, dt, 0.9) * I * 0.012 * dt;
    s.heading += ou(this.turb.yaw, dt, 1.2) * I * 0.008 * dt;
    s.h += this.turb.pitch.v * I * 0.5 * dt;  // small rising and sinking air
  }

  /** Per frame: keep cumulus around the aircraft and draw rain or snow. */
  frame(dt, lonDeg, latDeg, h, heading, speed, ground, dark, showFx) {
    this.updateDeck(lonDeg, latDeg, ground, dark);
    const want = this._cloudCount || 0;
    // with an overcast deck the cumulus are the bumps rising out of its top
    const base = this.deck ? this.deck.top - 260 : (Number.isFinite(ground) ? ground : 0) + (this.now.cloud > 0.75 ? 900 : 1500);
    // add at most two clouds per frame, never on top of the camera
    if (want && this.clouds.length < want) {
      for (let i = 0; i < 2 && this.clouds.length < want; i++) this.addCloud(lonDeg, latDeg, base, heading, this.clouds.length > want * 0.5);
    }
    if (want && (++this._tick % 45) === 0) {
      const me = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, h);
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds.get(i);
        if (Cesium.Cartesian3.distance(c.position, me) > 11000) c.position = this.cloudPos(lonDeg, latDeg, base, heading, true);
      }
    }
    if (Math.abs(dark - this._cloudDark) > 0.03) {
      this._cloudDark = dark;
      for (let i = 0; i < this.clouds.length; i++) this.clouds.get(i).brightness = 1 - dark * 0.8;
    }
    this.drawPrecip(dt, speed, dark, showFx);
  }

  /** Overcast: keep a deck of cloud around the aircraft (rebuilt every ~25 km). */
  updateDeck(lonDeg, latDeg, ground, dark) {
    const w = this.now;
    const layer = w.live && w.cloud >= 0.85 ? DECK_LAYERS[w.kind] || DECK_LAYERS.cloud : null;
    if (!layer) { this.removeDeck(); this.inCloud = 0; this.aboveDeck = false; return; }
    const d = this.deck;
    const far = d && Math.hypot(latDeg - d.lat, (lonDeg - d.lon) * Math.cos(latDeg * D2R)) * 111 > 25;
    if (!d || far) {
      let g = Number.isFinite(ground) ? ground : this.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lonDeg, latDeg));
      g = Math.max(0, Number.isFinite(g) ? g : 0);
      // keep the same layer heights while flying on (no jumps over hills)
      const base = d && far ? d.base : g + layer[0], top = d && far ? d.top : g + layer[1];
      this.buildDeck(lonDeg, latDeg, base, top);
    }
    // colour: bright tops in the sun, grey underside, both dim at night
    const k = 1 - dark * 0.85;
    if (Math.abs(k - (this.deck.k ?? -1)) > 0.02) {
      this.deck.k = k;
      const [topApp, botApp] = this._deckApp;
      topApp.material.uniforms.color = new Cesium.Color(0.97 * k, 0.97 * k, 0.99 * k, 1);
      const gk = (w.kind === 'storm' ? 0.42 : w.kind === 'rain' || w.kind === 'snow' ? 0.55 : 0.66) * k;
      botApp.material.uniforms.color = new Cesium.Color(gk, gk * 1.02, gk * 1.06, 1);
    }
    // white-out inside the layer, judged at the camera
    const camH = this.scene.camera.positionCartographic.height;
    const { base, top } = this.deck, edge = 90;
    this.inCloud = camH <= base || camH >= top ? 0 : Math.min(1, (camH - base) / edge, (top - camH) / edge);
    this.aboveDeck = camH >= top;
  }

  buildDeck(lonDeg, latDeg, base, top) {
    this.removeDeck(true);
    if (!this._deckApp) this._deckApp = [deckAppearance(true), deckAppearance(false)];
    const center = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg);
    const disc = (h, app) => this.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.EllipseGeometry({
          center, semiMajorAxis: 160000, semiMinorAxis: 160000, height: h,
          granularity: 0.0008, vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
        }),
      }),
      appearance: app, asynchronous: false,
    }));
    this.deck = { lon: lonDeg, lat: latDeg, base, top, k: this.deck?.k, prims: [disc(top, this._deckApp[0]), disc(base, this._deckApp[1])] };
    this.deck.k = -1;
  }

  removeDeck() {
    if (!this.deck) return;
    for (const p of this.deck.prims) this.scene.primitives.remove(p);
    this.deck = null;
  }

  cloudPos(lonDeg, latDeg, base, heading, ahead) {
    const a = ahead ? heading + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const d = ahead ? 6000 + Math.random() * 4000 : 2200 + Math.random() * 7500;
    const dn = Math.cos(a) * d, de = Math.sin(a) * d;
    return Cesium.Cartesian3.fromDegrees(lonDeg + de / (111320 * Math.cos(latDeg * D2R)), latDeg + dn / 111320, base + Math.random() * 500);
  }

  addCloud(lonDeg, latDeg, base, heading, ahead) {
    const w = 900 + Math.random() * 1300;
    this.clouds.add({
      position: this.cloudPos(lonDeg, latDeg, base, heading, ahead),
      scale: new Cesium.Cartesian2(w, w * (0.28 + Math.random() * 0.2)),
      maximumSize: new Cesium.Cartesian3(50, 15, 13),
      slice: 0.36 + Math.random() * 0.1,
      brightness: 1 - Math.max(0, this._cloudDark) * 0.8,
    });
  }

  drawPrecip(dt, speed, dark, show) {
    const ctx = this.ctx, W = innerWidth, H = innerHeight;
    const w = this.now;
    const kind = w.kind === 'storm' ? 'rain' : w.kind;
    const fog = this.inCloud > 0.01;
    const falling = show && w.live && (kind === 'rain' || kind === 'snow') && !this.aboveDeck;
    if (!falling && !fog) {
      if (this._dirty) { ctx.clearRect(0, 0, W, H); this._dirty = false; }
      return;
    }
    ctx.clearRect(0, 0, W, H);
    this._dirty = true;
    if (fog) {
      const g = Math.round(205 * (1 - dark * 0.8));
      ctx.fillStyle = `rgba(${g},${g},${Math.min(255, g + 8)},${(0.97 * this.inCloud).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (!falling) return;
    const amount = Math.min(1, 0.25 + (w.rain || 0.4) / 4) * (w.kind === 'storm' ? 1.3 : 1);
    const n = Math.round((kind === 'snow' ? 420 : 340) * amount * Math.min(1.4, W / 1000));
    while (this.drops.length < n) this.drops.push({ x: Math.random() * W, y: Math.random() * H, z: 0.4 + Math.random() * 0.6 });
    this.drops.length = n;
    const sp = Math.min(1, speed / 120);
    const fall = kind === 'snow' ? 70 : 900, slant = kind === 'snow' ? 30 : 160 + sp * 500;
    ctx.strokeStyle = kind === 'snow' ? `rgba(255,255,255,${0.95 - dark * 0.3})` : `rgba(200,215,235,${0.42 - dark * 0.15})`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const d of this.drops) {
      d.y += fall * d.z * dt * (1 + sp * 1.5);
      d.x -= slant * d.z * dt * 0.25;
      if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
      if (d.x < -20) d.x = W + 10;
      if (kind === 'snow') { ctx.moveTo(d.x + 2.4 * d.z, d.y); ctx.arc(d.x, d.y, 2.4 * d.z, 0, Math.PI * 2); }
      else { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + slant * 0.03 * d.z, d.y - (14 + sp * 22) * d.z); }
    }
    if (kind === 'snow') ctx.fill(); else ctx.stroke();
    if (w.kind === 'storm') {
      if (this.flash <= 0 && Math.random() < dt * 0.08) this.flash = 0.35;
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(230,235,255,${this.flash * (0.5 + dark * 0.5)})`;
        ctx.fillRect(0, 0, W, H);
        this.flash -= dt * 1.6;
      }
    }
  }
}
