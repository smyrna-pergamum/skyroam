// Airports and runways (OurAirports, public domain): large airports with scheduled flights,
// plus every Turkish airport with scheduled flights. Loaded only when needed (~200 KB).

const D2R = Math.PI / 180, R = 6371000;
let data = null, loading = null;

export function loadAirports() {
  if (data) return Promise.resolve(data);
  loading ??= fetch('data/airports.json').then(r => r.json()).then(j => { data = j.airports.map(unpack); return data; })
    .catch(e => { loading = null; throw e; });
  return loading;
}
export const airportsLoaded = () => data;

function unpack([icao, iata, name, city, country, lat, lon, elev, rw]) {
  return { icao, iata, name, city, country, lat, lon, elev, runways: rw, key: `${icao} ${iata} ${name} ${city}`.toLocaleLowerCase('tr') };
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}
export function distM(lat1, lon1, lat2, lon2) {
  const dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Point `d` metres from (lat, lon) along `hdg` degrees. */
export function offset(lat, lon, hdg, d) {
  const h = hdg * D2R;
  return { lat: lat + (d * Math.cos(h)) / R / D2R, lon: lon + (d * Math.sin(h)) / (R * Math.cos(lat * D2R)) / D2R };
}

/** Both directions of every runway: take off / land from threshold (lat, lon) towards the far end. */
export function runwayEnds(ap) {
  const out = [];
  for (const [a, alat, alon, ael, b, blat, blon, bel, len, width] of ap.runways) {
    out.push({ id: a, lat: alat, lon: alon, elev: ael, endLat: blat, endLon: blon, endElev: bel, hdg: bearingDeg(alat, alon, blat, blon), len, width });
    out.push({ id: b, lat: blat, lon: blon, elev: bel, endLat: alat, endLon: alon, endElev: ael, hdg: bearingDeg(blat, blon, alat, alon), len, width });
  }
  return out;
}

export function searchAirports(q, limit = 12) {
  if (!data) return [];
  const s = q.trim().toLocaleLowerCase('tr');
  if (s.length < 2) return [];
  const up = q.trim().toUpperCase();
  const exact = data.filter(a => a.iata === up || a.icao === up);
  const rest = data.filter(a => !exact.includes(a) && a.key.includes(s));
  return exact.concat(rest).slice(0, limit);
}

export function nearestAirports(lat, lon, limit = 8) {
  if (!data) return [];
  return data.map(a => [distM(lat, lon, a.lat, a.lon), a]).sort((x, y) => x[0] - y[0]).slice(0, limit).map(([d, a]) => Object.assign({ dist: d }, a));
}

/** The place the menu stores: start on the runway threshold, pointing down the runway. */
export function airportPlace(ap, end) {
  return {
    kind: 'airport', name: `${ap.city || ap.name} ${ap.iata || ap.icao} · ${end.id}`,
    lat: end.lat, lon: end.lon, heading: end.hdg, alt: end.elev + 450, back: 0,
    airport: { icao: ap.icao, iata: ap.iata, name: ap.name, city: ap.city, rwy: end },
  };
}

/** Position relative to a runway end: metres along the centreline from the threshold, and to the right of it. */
export function runwayFrame(rwy, latDeg, lonDeg) {
  const dn = (latDeg - rwy.lat) * D2R * R, de = (lonDeg - rwy.lon) * D2R * R * Math.cos(rwy.lat * D2R);
  const h = rwy.hdg * D2R;
  return { along: dn * Math.cos(h) + de * Math.sin(h), cross: -dn * Math.sin(h) + de * Math.cos(h) };
}
