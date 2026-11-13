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

export const CLEAR = { code: 0, kind: 'clear', temp: null, cloud: 0, vis: 30000, wind: 0, dir: 0, gust: 0, wind180: 0, dir180: 0, rain: 0, live: false };

// smoothed random signal (Ornstein-Uhlenbeck): bumps, never jitter
function ou(state, dt, tau) {
  state.v += (-state.v / tau) * dt + Math.sqrt(2 * dt / tau) * (Math.random() * 2 - 1) * 1.7;
  return state.v;
}

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
    this.baseFog = this.scene.fog.density;
    this.turb = { roll: { v: 0 }, pitch: { v: 0 }, yaw: { v: 0 } };
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
    this.mode = mode === 'clear' ? 'clear' : 'live';
    this.last = null;
    if (this.mode === 'clear') this.apply({ ...CLEAR });
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
    if (!w.live) { this.wind.n = this.wind.e = this.wind.speed = 0; return this.wind; }
    const h = Math.max(0, Number.isFinite(agl) ? agl : 500);
    const k = Math.min(1, h / 180);
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
    if (!w.live || s.crashed) return;
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
    let I = (Math.max(0, w.gust - w.wind) / 14 + v.speed / 90) * nearGround;
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
    const want = this._cloudCount || 0;
    const base = (Number.isFinite(ground) ? ground : 0) + (this.now.cloud > 0.75 ? 900 : 1500);
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
    if (!show || !w.live || (kind !== 'rain' && kind !== 'snow')) {
      if (this._dirty) { ctx.clearRect(0, 0, W, H); this._dirty = false; }
      return;
    }
    ctx.clearRect(0, 0, W, H);
    this._dirty = true;
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
