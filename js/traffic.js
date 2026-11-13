/* global Cesium */
// Air traffic around you, for the radar, the cockpit ND and the 3D world.
// 'sim': generated traffic (departures and arrivals on the real runways of nearby airports, airliners
//        cruising overhead). Offline, sends nothing.
// 'live': real aircraft (ADS-B) from adsb.lol through a small proxy you run yourself (see
//        tools/traffic-proxy.js), because browsers block the free services from other sites.
import { loadAirports, nearestAirports, runwayEnds, offset } from './airports.js';
import { baseById, resolveAircraft } from './aircraft.js';
import { PlaneModel } from './plane.js';

const D2R = Math.PI / 180, M_LAT = 111320;
const FT = 0.3048, KT = 0.514444;
const AIRLINES = ['THY', 'PGT', 'AJA', 'SXS', 'TKJ', 'DLH', 'BAW', 'AFR', 'KLM', 'UAE', 'QTR', 'RYR', 'EZY', 'WZZ', 'AUA', 'SWR', 'ETD', 'SVA'];
// ICAO type → fleet model used for the 3D aircraft
const TYPES = { A20N: 'a320neo', A320: 'a320neo', A21N: 'a321neo', A321: 'a321neo', B738: 'b737-800', B38M: 'b737-max8', B39M: 'b737-max8',
  A333: 'a330-300', A359: 'a350-900', B77W: 'b777-300er', B789: 'b787-9', B788: 'b787-9', E195: 'e195-e2', E290: 'e195-e2', BCS3: 'a220-300',
  AT76: 'atr72-600', AT75: 'atr72-600', DH8D: 'dash8-q400', C172: 'cessna-172' };
const SIM_TYPES = ['A20N', 'A20N', 'A21N', 'B738', 'B38M', 'B38M', 'A333', 'B77W', 'B789', 'A359', 'E195', 'BCS3', 'AT76', 'DH8D'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const callsign = () => `${pick(AIRLINES)}${Math.floor(10 + Math.random() * 990)}${Math.random() < 0.3 ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) : ''}`;

export class Traffic {
  constructor(viewer, heightFn) {
    this.viewer = viewer; this.scene = viewer.scene; this.heightFn = heightFn;
    this.mode = 'sim'; this.proxy = '';
    this.list = [];             // { id, call, type, lat, lon, alt, hdg, gs, vs, ground, phase, ... }
    this.live = { busy: false, last: 0, ok: false, fail: 0 };
    this.points = this.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.labels = this.scene.primitives.add(new Cesium.LabelCollection());
    this.models = [];           // pool of generated 3D aircraft for the nearest few
    this.airports = [];         // nearby runway ends for the simulation
    this.center = null; this._apAt = null; this._seq = 0;
    this.onStatus = null;
  }

  setMode(mode, proxy) {
    const m = ['off', 'sim', 'live'].includes(mode) ? mode : 'sim';
    const p = (proxy || '').trim().replace(/\/+$/, '');
    if (m === this.mode && p === this.proxy) return;
    this.mode = m; this.proxy = p;
    this.clear();
  }

  /** Real traffic only when a proxy is set; otherwise the simulation stands in. */
  get source() { return this.mode === 'live' && this.proxy && this.live.fail < 3 ? 'live' : this.mode === 'off' ? 'off' : 'sim'; }

  clear() {
    this.list = []; this.points.removeAll(); this.labels.removeAll();
    for (const m of this.models) { m.target = null; m.model.visible = false; }
    this.live = { busy: false, last: 0, ok: false, fail: 0 };
    this.airports = []; this._apAt = null;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, me, active) {
    if (this.mode === 'off' || !me) { if (this.list.length) this.clear(); return; }
    this.center = me;
    const src = this.source;
    if (src === 'live') this.pollLive(me);
    else this.simulate(dt, me);
    if (src === 'live') for (const a of this.list) this.move(a, dt);   // dead reckoning between updates
    this.draw(me, active);
  }

  move(a, dt) {
    const p = offset(a.lat, a.lon, a.hdg, a.gs * dt);
    a.lat = p.lat; a.lon = p.lon;
    if (!a.ground) a.alt += a.vs * dt;
  }

  // ---------------------------------------------------------------- simulation
  async nearbyRunways(me) {
    if (this._apBusy) return;
    if (this._apAt && Math.hypot(me.lat - this._apAt.lat, (me.lon - this._apAt.lon) * Math.cos(me.lat * D2R)) * 111 < 40) return;
    this._apBusy = true;
    try {
      await loadAirports();
      this._apAt = { lat: me.lat, lon: me.lon };
      const aps = nearestAirports(me.lat, me.lon, 4).filter(a => a.dist < 90000);
      const ends = [];
      for (const ap of aps) {
        // one runway direction per airport is "in use"; the longest runway
        const e = runwayEnds(ap)[Math.random() < 0.5 ? 0 : 1];
        e.ap = ap.iata || ap.icao;
        const g = await this.heightFn(e.lat, e.lon);
        e.g = Number.isFinite(g) ? g : e.elev;
        ends.push(e);
      }
      this.airports = ends;
      // something to see straight away: one aircraft on approach and one rolling at each airport
      if (this.source === 'sim') for (const e of ends) { this.add(this.spawnArrival(e, true)); this.add(this.spawnDeparture(e)); }
    } catch { /* no airports: cruise traffic only */ } finally { this._apBusy = false; }
  }

  simulate(dt, me) {
    this.nearbyRunways(me);
    for (const a of this.list) this.stepSim(a, dt);
    // drop far or finished traffic
    this.list = this.list.filter(a => {
      const keep = !a.gone && distKm(me, a) < 95;
      if (!keep) this.dropDisplay(a);
      return keep;
    });
    const cruise = this.list.filter(a => a.phase === 'cruise');
    if (cruise.length < 7) this.add(this.spawnCruise(me, cruise.filter(a => distKm(me, a) < 25).length < 2));
    for (const e of this.airports) {
      const here = this.list.filter(a => a.rwy === e);
      if (here.filter(a => a.phase === 'arrival' || a.phase === 'rollout').length < 2 && Math.random() < dt * 0.05) this.add(this.spawnArrival(e, here.length === 0));
      if (here.filter(a => a.phase === 'takeoff' || a.phase === 'climb').length < 1 && Math.random() < dt * 0.03) this.add(this.spawnDeparture(e));
    }
  }

  add(a) { a.id = `s${++this._seq}`; this.list.push(a); }

  spawnCruise(me, near) {
    const ang = Math.random() * 360, d = near ? 6 + Math.random() * 16 : 30 + Math.random() * 50;
    const p = offset(me.lat, me.lon, ang, d * 1000);
    // mostly airliners at cruise level; some lower, climbing out or descending
    const fl = Math.random() < 0.3 ? 80 + Math.floor(Math.random() * 15) * 10 : 280 + Math.floor(Math.random() * 12) * 10;
    return { call: callsign(), type: pick(SIM_TYPES), lat: p.lat, lon: p.lon, alt: fl * 100 * FT, hdg: Math.random() * 360, gs: fl < 250 ? 150 + Math.random() * 40 : 220 + Math.random() * 40, vs: 0, ground: false, phase: 'cruise' };
  }

  spawnArrival(e, anywhere) {
    const d = anywhere ? 6000 + Math.random() * 22000 : 28000;
    const p = offset(e.lat, e.lon, e.hdg, -d);
    const type = pick(SIM_TYPES);
    return { call: callsign(), type, lat: p.lat, lon: p.lon, alt: e.g + Math.tan(3 * D2R) * (d + 300), hdg: e.hdg, gs: type.startsWith('AT') || type.startsWith('DH') ? 62 : 72, vs: 0, ground: false, phase: 'arrival', rwy: e };
  }

  spawnDeparture(e) {
    const p = offset(e.lat, e.lon, e.hdg, 40);
    return { call: callsign(), type: pick(SIM_TYPES), lat: p.lat, lon: p.lon, alt: e.g, hdg: e.hdg, gs: 0, vs: 0, ground: true, phase: 'takeoff', rwy: e, turnTo: Math.random() * 360 };
  }

  stepSim(a, dt) {
    const e = a.rwy;
    if (a.phase === 'arrival') {
      // fly down the 3° glide path to the aim point
      const back = alongTrack(e, a);
      a.vs = -a.gs * Math.tan(3 * D2R);
      a.alt = Math.max(e.g, e.g + Math.tan(3 * D2R) * (300 - back));
      if (back > 300) { a.phase = 'rollout'; a.ground = true; a.alt = e.g; a.vs = 0; }
    } else if (a.phase === 'rollout') {
      a.gs = Math.max(0, a.gs - 2.2 * dt);
      if (a.gs < 12) a.gone = true;                          // turned off the runway
    } else if (a.phase === 'takeoff') {
      a.gs += 2.3 * dt;
      if (a.gs > 75) { a.phase = 'climb'; a.ground = false; a.vs = 11; }
    } else if (a.phase === 'climb') {
      a.gs = Math.min(150, a.gs + 1.2 * dt);
      if (alongTrack(e, a) > e.len + 5000) {                // turn towards the departure route
        const d = ((a.turnTo - a.hdg + 540) % 360) - 180;
        a.hdg = (a.hdg + Math.sign(d) * Math.min(Math.abs(d), 2.5 * dt) + 360) % 360;
      }
      if (a.alt > e.g + 6000) a.vs = 7;
    }
    this.move(a, dt);
  }

  // ---------------------------------------------------------------- live (through the player's proxy)
  async pollLive(me) {
    const L = this.live, now = performance.now();
    if (L.busy || now - L.last < 10000) return;
    L.busy = true; L.last = now;
    try {
      const r = await fetch(`${this.proxy}/v2/point/${me.lat.toFixed(2)}/${me.lon.toFixed(2)}/50`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const seen = new Map(this.list.map(a => [a.id, a]));
      const next = [];
      for (const s of j.ac || []) {
        if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
        const ground = s.alt_baro === 'ground';
        const a = seen.get(s.hex) || { id: s.hex };
        Object.assign(a, {
          call: (s.flight || s.r || s.hex).trim(), type: s.t || '',
          lat: s.lat, lon: s.lon, ground,
          alt: ground ? (a.alt ?? me.ground ?? 0) : (Number.isFinite(s.alt_geom) ? s.alt_geom : s.alt_baro) * FT,
          hdg: s.track ?? s.true_heading ?? a.hdg ?? 0, gs: (s.gs || 0) * KT,
          vs: ((s.geom_rate ?? s.baro_rate) || 0) * FT / 60, phase: 'live',
        });
        next.push(a);
      }
      for (const a of this.list) if (!next.includes(a)) this.dropDisplay(a);
      this.list = next;
      if (!L.ok) this.onStatus?.('live');
      L.ok = true; L.fail = 0;
    } catch (e) {
      L.fail++;
      if (L.fail === 3) { this.onStatus?.('fail'); this.list.forEach(a => this.dropDisplay(a)); this.list = []; }
    } finally { L.busy = false; }
  }

  // ---------------------------------------------------------------- 3D: dots, callsigns, nearest as models
  dropDisplay(a) {
    if (a.point) this.points.remove(a.point);
    if (a.label) this.labels.remove(a.label);
    a.point = a.label = null;
    for (const m of this.models) if (m.target === a) { m.target = null; m.model.visible = false; }
  }

  draw(me, active) {
    for (const a of this.list) {
      a.km = distKm(me, a);
      const pos = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, a.alt + 2);
      if (!a.point) {
        a.point = this.points.add({ position: pos, pixelSize: 4, color: Cesium.Color.WHITE.withAlpha(0.9), outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 1,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 120000) });
        a.label = this.labels.add({ position: pos, text: a.call, font: '600 12px system-ui, sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -14), distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000),
          scaleByDistance: new Cesium.NearFarScalar(2000, 1, 25000, 0.75) });
      } else { a.point.position = pos; a.label.position = pos; }
    }
    // 3D models for the four nearest within 15 km (kept until they are 18 km away)
    for (const m of this.models) if (m.target && (!this.list.includes(m.target) || m.target.km > 18)) { m.target = null; m.model.visible = false; }
    const want = this.list.filter(a => a.km < 15 && !this.models.some(m => m.target === a)).sort((x, y) => x.km - y.km);
    for (const a of want) {
      let slot = this.models.find(m => !m.target);
      if (!slot && this.models.length < 4) { slot = { model: new PlaneModel(this.scene), id: null, target: null }; this.models.push(slot); }
      if (!slot) break;
      const id = TYPES[a.type] || 'a320neo';
      if (slot.id !== id) { slot.model.build(resolveAircraft(baseById(id))); slot.id = id; }
      slot.target = a;
    }
    for (const m of this.models) {
      if (!m.target) continue;
      const a = m.target;
      m.model.visible = active;
      m.model.gear = a.ground || (a.phase === 'arrival' && a.alt - (a.rwy?.g ?? 0) < 700) || (a.phase === 'climb' && a.alt - (a.rwy?.g ?? 0) < 300) ? 1 : 0;
      m.model.update({ lon: a.lon * D2R, lat: a.lat * D2R, h: a.alt + (a.ground ? 2.5 : 0), heading: a.hdg * D2R, pitch: a.ground ? 0 : Math.atan2(a.vs, Math.max(30, a.gs)) + 0.03, roll: 0 });
      if (a.point) a.point.show = false;
    }
    for (const a of this.list) if (a.point && !this.models.some(m => m.target === a)) a.point.show = true;
  }

  /** Traffic relative to the aircraft: metres east/north, height difference, for radar and ND. */
  relative(me) {
    const out = [];
    const c = Math.cos(me.lat * D2R);
    for (const a of this.list) {
      const dn = (a.lat - me.lat) * M_LAT, de = (a.lon - me.lon) * M_LAT * c;
      out.push({ de, dn, dist: Math.hypot(de, dn), dAlt: a.alt - me.h, vs: a.vs, hdg: a.hdg, call: a.call, type: a.type, ground: a.ground });
    }
    return out;
  }
}

function distKm(me, a) {
  return Math.hypot(a.lat - me.lat, (a.lon - me.lon) * Math.cos(me.lat * D2R)) * 111.32;
}
function alongTrack(e, a) {
  const dn = (a.lat - e.lat) * M_LAT, de = (a.lon - e.lon) * M_LAT * Math.cos(e.lat * D2R);
  return dn * Math.cos(e.hdg * D2R) + de * Math.sin(e.hdg * D2R);
}

// ---------------------------------------------------------------- radar scope (HUD)
export class RadarScope {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.range = 20000; this.t = 0; this.alert = 0;
    this.resize();
  }

  resize() {
    const r = Math.min(devicePixelRatio || 1, 2), s = this.cv.clientWidth || 180;
    this.cv.width = this.cv.height = Math.round(s * r);
    this.g.setTransform(r, 0, 0, r, 0, 0); this.size = s;
  }

  /** rel: from Traffic.relative(); hdg rad; returns the alert level (0 none, 1 traffic, 2 close). */
  draw(dt, rel, hdg, source, lang) {
    const g = this.g, S = this.size, c = S / 2, R = c - 4;
    if (this.cv.clientWidth && Math.abs(this.cv.clientWidth - S) > 1) this.resize();
    this.t += dt;
    g.clearRect(0, 0, S, S);
    const bg = g.createRadialGradient(c, c, 0, c, c, R);
    bg.addColorStop(0, 'rgba(6,40,22,.92)'); bg.addColorStop(1, 'rgba(2,16,9,.92)');
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
    g.strokeStyle = 'rgba(80,255,140,.55)'; g.lineWidth = 1.2; g.stroke();
    // range rings and heading-up compass
    g.strokeStyle = 'rgba(80,255,140,.22)'; g.lineWidth = 1;
    for (const k of [1 / 3, 2 / 3]) { g.beginPath(); g.arc(c, c, R * k, 0, Math.PI * 2); g.stroke(); }
    g.save(); g.translate(c, c); g.rotate(-hdg);
    for (let i = 0; i < 36; i++) {
      g.save(); g.rotate(i * 10 * D2R);
      g.strokeStyle = `rgba(80,255,140,${i % 9 === 0 ? 0.8 : 0.35})`;
      g.beginPath(); g.moveTo(0, -R); g.lineTo(0, -R + (i % 3 === 0 ? 7 : 4)); g.stroke();
      if (i % 9 === 0) { g.fillStyle = 'rgba(140,255,180,.9)'; g.font = '600 10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText((lang === 'tr' ? ['K', 'D', 'G', 'B'] : ['N', 'E', 'S', 'W'])[i / 9], 0, -R + 18); }
      g.restore();
    }
    g.restore();
    // sweep with a fading phosphor trail
    const sweep = (this.t * Math.PI) % (Math.PI * 2);    // one turn every 2 s
    g.save(); g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, sweep - Math.PI / 2 - 0.9, sweep - Math.PI / 2); g.closePath(); g.clip();
    if (g.createConicGradient) {
      const cg = g.createConicGradient(sweep - Math.PI / 2 - 0.9, c, c);
      cg.addColorStop(0, 'rgba(80,255,140,0)'); cg.addColorStop(0.143, 'rgba(80,255,140,.28)'); cg.addColorStop(0.1431, 'rgba(80,255,140,0)');
      g.fillStyle = cg;
    } else g.fillStyle = 'rgba(80,255,140,.1)';
    g.fillRect(0, 0, S, S); g.restore();
    // blips: brightest just after the sweep passes them
    let alert = 0;
    const k = R / this.range;
    g.font = '600 9px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const a of rel) {
      if (a.dist > this.range * 1.02) continue;
      const brg = Math.atan2(a.de, a.dn) - hdg;          // relative bearing, heading-up
      const x = c + Math.sin(brg) * a.dist * k, y = c - Math.cos(brg) * a.dist * k;
      const behind = (((sweep - ((brg + Math.PI * 4) % (Math.PI * 2))) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const glow = 0.35 + 0.65 * Math.exp(-behind / 2.2);
      const close = !a.ground && Math.abs(a.dAlt) < 300 && a.dist < 3000 ? (a.dist < 1200 && Math.abs(a.dAlt) < 150 ? 2 : 1) : 0;
      alert = Math.max(alert, close);
      const col = close === 2 ? `rgba(255,70,60,${glow})` : close === 1 ? `rgba(255,190,40,${glow})` : `rgba(120,255,160,${glow})`;
      g.save(); g.translate(x, y); g.rotate(a.hdg * D2R - hdg);
      g.fillStyle = col; g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(0, 2); g.lineTo(-3.5, 4); g.closePath(); g.fill();
      g.restore();
      if (a.dist < this.range * 0.85) {
        const rh = Math.round(a.dAlt / FT / 100);
        const arrow = a.vs > 2.5 ? '↑' : a.vs < -2.5 ? '↓' : '';
        g.fillStyle = col;
        g.fillText(a.call, x + 6, y - 5);
        g.fillText(a.ground ? 'GND' : `${rh > 0 ? '+' : ''}${rh}${arrow}`, x + 6, y + 5);
      }
    }
    // own aircraft
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c, c - 6); g.lineTo(c, c + 5); g.moveTo(c - 5, c - 1); g.lineTo(c + 5, c - 1); g.moveTo(c - 2.5, c + 4); g.lineTo(c + 2.5, c + 4); g.stroke();
    // labels
    g.fillStyle = 'rgba(140,255,180,.85)'; g.font = '600 10px system-ui, sans-serif';
    g.textAlign = 'left'; g.fillText(`${Math.round(this.range / 1000)} km`, 8, S - 10);
    g.textAlign = 'right'; g.fillText(source === 'live' ? (lang === 'tr' ? 'CANLI' : 'LIVE') : 'SIM', S - 8, S - 10);
    this.alert = alert;
    return alert;
  }
}
