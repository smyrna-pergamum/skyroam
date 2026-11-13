/* global Cesium */
// Live weather from Open-Meteo (free, no key): clouds, haze, rain or snow, wind and gusts.
// Only the rounded position of the aircraft is sent, and only while weather is set to 'live'.

const API = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'temperature_2m,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation';
const D2R = Math.PI / 180;
const R = 6378137;

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

export const CLEAR = { code: 0, kind: 'clear', temp: null, cloud: 0, vis: 30000, wind: 0, dir: 0, gust: 0, rain: 0, live: false };

export class Weather {
  constructor(viewer, canvas) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'live';
    this.now = { ...CLEAR };
    this.last = null;          // { lat, lon, at }
    this.busy = false;
    this.onChange = null;
    this.clouds = this.scene.primitives.add(new Cesium.CloudCollection({ noiseDetail: 16 }));
    this.cloudBase = 1500;
    this.drops = [];
    this.flash = 0;
    this.baseFog = this.scene.fog.density;
    this._t = 0;
    this._gust = 0;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const r = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * r; this.canvas.height = innerHeight * r;
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
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
      const q = `latitude=${latDeg.toFixed(2)}&longitude=${lonDeg.toFixed(2)}&current=${FIELDS}&wind_speed_unit=ms`;
      const r = await fetch(`${API}?${q}`);
      if (!r.ok) throw new Error(r.status);
      const c = (await r.json()).current || {};
      const code = c.weather_code ?? 0;
      this.apply({
        code, kind: (CODES[code] || CODES[0])[2], temp: c.temperature_2m ?? null,
        cloud: (c.cloud_cover ?? 0) / 100, vis: c.visibility ?? 30000,
        wind: c.wind_speed_10m ?? 0, dir: c.wind_direction_10m ?? 0, gust: c.wind_gusts_10m ?? 0,
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
    this._cloudCount = w.kind === 'fog' ? 0 : Math.round(w.cloud * 46);
    this.drops = [];
    this.onChange?.(w);
  }

  label(lang) {
    const w = this.now;
    if (!w.live) return '';
    const name = (CODES[w.code] || CODES[0])[lang === 'tr' ? 0 : 1];
    const kmh = Math.round(w.wind * 3.6);
    const temp = w.temp === null ? '' : `, ${Math.round(w.temp)} °C`;
    return lang === 'tr' ? `${name}${temp}, rüzgâr ${Math.round(w.dir)}° ${kmh} km/sa` : `${name}${temp}, wind ${Math.round(w.dir)}° ${kmh} km/h`;
  }

  /** Wind as m/s toward north and east (the direction it blows to), plus a gust factor for bumps. */
  windVector() {
    const w = this.now, to = (w.dir + 180) * D2R;
    // the 10 m wind is weaker than the wind aloft; scale it up a little
    return { n: Math.cos(to) * w.wind * 1.4, e: Math.sin(to) * w.wind * 1.4, gust: Math.max(0, w.gust - w.wind) };
  }

  /** Move the aircraft with the air mass and add gentle bumps. Call once per physics step. */
  stepFlight(s, dt) {
    if (!this.now.live || s.onGround || s.crashed) return;
    const v = this.windVector();
    s.lat += (v.n * dt) / R;
    s.lon += (v.e * dt) / (R * Math.cos(s.lat));
    this._t += dt;
    const g = Math.min(1, v.gust / 12) * (this.now.kind === 'storm' ? 1.8 : 1);
    if (g > 0.02) {
      this._gust += (Math.random() - 0.5) * dt * 6;
      this._gust *= Math.exp(-dt * 1.5);
      s.roll += this._gust * g * dt * 0.6;
      s.pitch += Math.sin(this._t * 1.7) * g * dt * 0.02;
    }
  }

  /** Per frame: keep cumulus around the aircraft and draw rain or snow. */
  frame(dt, lonDeg, latDeg, h, heading, speed, ground, dark, showFx) {
    // clouds: a field around the aircraft, recycled ahead when they fall behind
    const want = this._cloudCount || 0;
    const base = (Number.isFinite(ground) ? ground : 0) + (this.now.cloud > 0.75 ? 900 : 1500);
    if (want && this.clouds.length < want) {
      for (let i = this.clouds.length; i < want; i++) this.addCloud(lonDeg, latDeg, base, heading, i < want * 0.5);
    }
    if (want && (this._recycle = (this._recycle || 0) + 1) % 30 === 0) {
      const me = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, h);
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds.get(i);
        if (Cesium.Cartesian3.distance(c.position, me) > 9000) c.position = this.cloudPos(lonDeg, latDeg, base, heading, true);
      }
    }
    for (let i = 0; i < this.clouds.length; i++) this.clouds.get(i).brightness = 1 - dark * 0.8;
    this.drawPrecip(dt, speed, dark, showFx);
  }

  cloudPos(lonDeg, latDeg, base, heading, ahead) {
    const a = ahead ? heading + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const d = ahead ? 5000 + Math.random() * 3500 : 600 + Math.random() * 7500;
    const dn = Math.cos(a) * d, de = Math.sin(a) * d;
    return Cesium.Cartesian3.fromDegrees(lonDeg + de / (111320 * Math.cos(latDeg * D2R)), latDeg + dn / 111320, base + Math.random() * 500);
  }

  addCloud(lonDeg, latDeg, base, heading, ahead) {
    const w = 900 + Math.random() * 1500;
    this.clouds.add({
      position: this.cloudPos(lonDeg, latDeg, base, heading, ahead),
      scale: new Cesium.Cartesian2(w, w * (0.28 + Math.random() * 0.2)),
      maximumSize: new Cesium.Cartesian3(50, 15, 13),
      slice: 0.36 + Math.random() * 0.1,
      brightness: 1,
    });
  }

  drawPrecip(dt, speed, dark, show) {
    const ctx = this.ctx, W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    const w = this.now;
    const kind = w.kind === 'storm' ? 'rain' : w.kind;
    if (!show || !w.live || (kind !== 'rain' && kind !== 'snow')) return;
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
