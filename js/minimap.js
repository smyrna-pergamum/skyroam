// Small heading-up OpenStreetMap minimap with a compass ring, coordinates and the place below you.
// Tiles: tile.openstreetmap.org (attribution shown). Place names: Nominatim reverse geocoding,
// throttled to at most one request per 20 s and only after moving a few kilometres.

const TILE = 256;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class MiniMap {
  constructor(canvas, els, lang) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.els = els;          // { place, coords, heading }
    this.lang = lang;
    this.cache = new Map();
    this.zoom = 13;
    this.last = { t: 0, lat: 999, lon: 999, busy: false };
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = this.cv.clientWidth || 170;
    this.size = css;
    this.cv.width = Math.round(css * dpr); this.cv.height = Math.round(css * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  tile(z, x, y) {
    const n = 2 ** z;
    const tx = ((x % n) + n) % n;
    if (y < 0 || y >= n) return null;
    const key = `${z}/${tx}/${y}`;
    let img = this.cache.get(key);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = `https://tile.openstreetmap.org/${key}.png`;
      this.cache.set(key, img);
      if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  /** lat/lon in degrees, heading in degrees, agl in metres, speed in m/s. */
  update(lat, lon, heading, agl, speed) {
    const target = (Number.isFinite(agl) ? (agl < 600 ? 14 : agl < 2000 ? 13 : agl < 5000 ? 12 : 11) : 12) - (speed > 220 ? 1 : 0);
    if (Math.abs(target - this.zoom) >= 1) this.zoom = target;
    const z = this.zoom, n = 2 ** z;
    const latR = lat * Math.PI / 180;
    const x = ((lon + 180) / 360) * n;
    const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;

    const { g, size } = this;
    const c = size / 2, R = c - 12;
    g.clearRect(0, 0, size, size);

    // map, rotated heading-up
    g.save();
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#aad3df'; g.fillRect(0, 0, size, size);
    g.translate(c, c);
    g.rotate(-heading * Math.PI / 180);
    const fx = Math.floor(x), fy = Math.floor(y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const img = this.tile(z, fx + dx, fy + dy);
        if (img) g.drawImage(img, (fx + dx - x) * TILE, (fy + dy - y) * TILE, TILE, TILE);
      }
    }
    g.restore();

    // compass ring (rotates with heading)
    g.save();
    g.translate(c, c);
    g.beginPath(); g.arc(0, 0, R + 6, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(10,18,32,.85)'; g.lineWidth = 12; g.stroke();
    g.rotate(-heading * Math.PI / 180);
    g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 36; i++) {
      g.save(); g.rotate(i * 10 * Math.PI / 180);
      if (i % 9 === 0) {
        g.fillStyle = i === 0 ? '#f87171' : '#e5e7eb';
        g.fillText('NESW'[i / 9], 0, -(R + 6));
      } else {
        g.strokeStyle = 'rgba(229,231,235,.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, -(R + 2)); g.lineTo(0, -(R + (i % 3 ? 5 : 9))); g.stroke();
      }
      g.restore();
    }
    g.restore();

    // own aircraft (always pointing up)
    g.fillStyle = '#facc15'; g.strokeStyle = '#111827'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c + 7, c + 7); g.lineTo(c, c + 3); g.lineTo(c - 7, c + 7); g.closePath();
    g.fill(); g.stroke();
    // lubber mark
    g.fillStyle = '#facc15';
    g.beginPath(); g.moveTo(c, 13); g.lineTo(c - 5, 3); g.lineTo(c + 5, 3); g.closePath(); g.fill();

    const hdg = (Math.round(heading) + 360) % 360;
    this.els.heading.textContent = `${String(hdg).padStart(3, '0')}° ${COMPASS[Math.round(hdg / 45) % 8]}`;
    this.els.coords.textContent = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
    this.maybeGeocode(lat, lon);
  }

  maybeGeocode(lat, lon) {
    const now = performance.now();
    const L = this.last;
    const moved = Math.hypot((lat - L.lat) * 111, (lon - L.lon) * 111 * Math.cos(lat * Math.PI / 180));
    if (L.busy || (now - L.t < 20000 && L.t) || moved < 3) return;
    L.busy = true; L.t = now; L.lat = lat; L.lon = lon;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&accept-language=${this.lang()}`;
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || d.error) { this.els.place.textContent = '—'; return; }
        const a = d.address || {};
        const local = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || '';
        this.els.place.textContent = [local, a.country].filter(Boolean).join(', ') || d.name || '—';
      })
      .catch(() => {})
      .finally(() => { L.busy = false; });
  }

  forget() { this.last = { t: 0, lat: 999, lon: 999, busy: false }; this.els.place.textContent = '…'; }
}
