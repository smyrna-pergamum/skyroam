// SkyRoam live air traffic proxy: a Cloudflare Worker you run on your own (free) account.
//
// Browsers block the free ADS-B services from other sites (no CORS headers), so the game asks this
// Worker instead. It forwards only one kind of request, a circle around a point, to adsb.lol
// (https://api.adsb.lol, ODbL data) and adds CORS headers for the SkyRoam site.
//
// Setup (about 5 minutes, see the README for the long version):
//   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → name it, e.g. skyroam-traffic → Deploy
//   2. Edit code → replace everything with this file → Deploy
//   3. Copy the address (https://skyroam-traffic.<you>.workers.dev) into SkyRoam → Settings → Live air traffic
// Optional: Settings → Variables → ALLOWED_ORIGINS = comma-separated list of sites that may use it
// (default: the official SkyRoam site and localhost).
//
// No keys, no secrets, nothing stored. Responses are cached for 5 seconds to spare adsb.lol.

const UPSTREAM = 'https://api.adsb.lol';
const DEFAULT_ORIGINS = ['https://smyrna-pergamum.github.io'];
const PATH = /^\/v2\/point\/(-?\d{1,2}(?:\.\d{1,4})?)\/(-?\d{1,3}(?:\.\d{1,4})?)\/(\d{1,3})$/;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowed = list.length ? list : DEFAULT_ORIGINS;
  if (allowed.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function reply(body, status, origin, extra = {}) {
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return new Response(body, { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const origin = allowedOrigin(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: origin ? 204 : 403, headers: origin ? {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin',
      } : {} });
    }
    if (request.method !== 'GET') return reply('{"error":"method"}', 405, origin);
    if (!origin) return reply('{"error":"origin not allowed"}', 403, null);

    const m = PATH.exec(new URL(request.url).pathname);
    if (!m) return reply('{"error":"use /v2/point/{lat}/{lon}/{nm}"}', 404, origin);
    const lat = +m[1], lon = +m[2], dist = Math.min(100, +m[3]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || dist < 1) return reply('{"error":"range"}', 400, origin);

    const url = `${UPSTREAM}/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${dist}`;
    const cache = caches.default, key = new Request(url);
    let res = await cache.match(key);
    if (!res) {
      try {
        const up = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'skyroam-traffic-proxy' } });
        if (!up.ok) return reply(`{"error":"upstream ${up.status}"}`, 502, origin);
        res = new Response(await up.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' } });
        ctx.waitUntil(cache.put(key, res.clone()));
      } catch {
        return reply('{"error":"upstream unreachable"}', 502, origin);
      }
    }
    return reply(await res.text(), 200, origin);
  },
};
