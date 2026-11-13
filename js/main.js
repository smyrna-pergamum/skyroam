/* global Cesium */
import { t, setLang, getLang } from './i18n.js';
import { startFromPlace } from './places.js';
import { FIXED_DT, createFlight, stepFlight, snapshot, lerpSnap } from './flight.js';
import { Input } from './input.js';
import { PlaneModel } from './plane.js';
import { RingCourse } from './rings.js';
import { EngineSound } from './audio.js';
import { readJSON, writeJSON, getToken } from './storage.js';
import { initMenu } from './menu.js';
import { Cockpit } from './cockpit.js';
import { statsOf, baseById } from './aircraft.js';
import { Feel } from './feel.js';
import { MiniMap } from './minimap.js';
import { TouchControls } from './touch.js';
import { Warnings } from './warnings.js';
import { Sky, TIME_MODES, TIME_SPEEDS } from './sky.js';
import { Weather, WX_MODES } from './weather.js';
import { loadAirports, nearestAirports, runwayEnds, airportPlace, airportsLoaded } from './airports.js';
import { Mission } from './missions.js';

const $ = id => document.getElementById(id);
const RING_COUNT = 12;
const PREFS_KEY = 'skyroam.prefs';
const BEST_KEY = 'skyroam.best';

const prefs = Object.assign(
  { lang: null, mode: 'free', invert: false, assist: true, google3d: false, muted: false, aircraft: 'b:cessna-172', acCat: 'all', tab: 'fly', calm: false, minimap: true, warnings: true, tod: 'auto', wx: 'live', tspeed: 1, windMan: false, windKmh: 30, windDir: 270 },
  readJSON(PREFS_KEY, {}),
);
const savePrefs = () => writeJSON(PREFS_KEY, prefs);

// Launch links from the website: play.html?lat=..&lon=..&name=..&ac=..&hdg=..&alt=..&cam=..&lang=..&tod=..&tspeed=..&wx=..&wind=..&wdir=..&mode=..&ap=..&rwy=..&fly=1
// Values are validated and only change where you start; nothing is sent anywhere.
const launch = (() => {
  const q = new URLSearchParams(location.search);
  const num = (k, lo, hi) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  const out = { fly: q.get('fly') === '1', cam: ['chase', 'cockpit', 'nose'].includes(q.get('cam')) ? q.get('cam') : null, shot: q.get('shot') === '1' };
  if (['tr', 'en'].includes(q.get('lang'))) prefs.lang = q.get('lang');
  if (TIME_MODES.includes(q.get('tod'))) prefs.tod = q.get('tod');
  if (TIME_SPEEDS.includes(+q.get('tspeed'))) prefs.tspeed = +q.get('tspeed');
  if (WX_MODES.includes(q.get('wx'))) prefs.wx = q.get('wx');
  if (['free', 'rings', 'takeoff', 'landing'].includes(q.get('mode'))) prefs.mode = q.get('mode');
  if (/^[A-Za-z0-9]{3,4}$/.test(q.get('ap') || '')) { out.ap = q.get('ap').toUpperCase(); out.rwy = (q.get('rwy') || '').toUpperCase().slice(0, 4); }
  const wk = num('wind', 0, 200);
  if (wk !== null) { prefs.windMan = true; prefs.windKmh = Math.round(wk); prefs.windDir = Math.round(num('wdir', 0, 360) ?? prefs.windDir ?? 270) % 360; }
  const lat = num('lat', -85, 85), lon = num('lon', -180, 180);
  if (lat !== null && lon !== null) {
    const name = (q.get('name') || '').replace(/[<>]/g, '').slice(0, 80) || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    prefs.pick = Object.assign({ cat: 'search' }, prefs.pick || {}, { cat: 'search' });
    prefs.pick.search = { kind: 'search', name, lat, lon, heading: num('hdg', 0, 360) ?? 0, alt: num('alt', 50, 9000) ?? 450, back: 3000 };
  }
  const id = (q.get('ac') || '').toLowerCase();
  if (id && baseById(id).id === id) prefs.aircraft = `b:${id}`;
  if (q.toString()) history.replaceState(null, '', location.pathname); // keep the address bar clean
  return out;
})();
setLang(prefs.lang || ((navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'));

// ---------------------------------------------------------------------------
// Viewer + map layers
// ---------------------------------------------------------------------------
const token = getToken();
Cesium.Ion.defaultAccessToken = token || '';

const viewer = new Cesium.Viewer('cesium', {
  baseLayer: false,
  animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
  selectionIndicator: false, shadows: false, shouldAnimate: true,
});
const scene = viewer.scene;
scene.screenSpaceCameraController.enableInputs = false;
scene.globe.depthTestAgainstTerrain = true;
scene.globe.tileCacheSize = 300;
scene.fog.enabled = true;
scene.skyAtmosphere.show = true;
viewer.camera.frustum.near = 0.5;
const sky = new Sky(viewer);
const weather = new Weather(viewer, $('wx'));
weather.setMode(prefs.wx);
weather.setManualWind(prefs.windMan ? prefs.windKmh : NaN, prefs.windDir);
weather.onChange = () => updateWxLabel();
function updateWxLabel() { $('hWx').textContent = weather.label(getLang()); }
const TOD_KEY = { auto: 'todAuto', sunrise: 'todSunrise', day: 'todDay', dusk: 'todDusk', night: 'todNight' };

let mapMode = 'loading'; // 'lite' | 'ion' | 'google'

function addLiteImagery() {
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: new Cesium.Credit('Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
  }));
}

async function setupMap() {
  if (!token) { addLiteImagery(); mapMode = 'lite'; return; }
  try {
    const [imagery, terrain] = await Promise.all([
      Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL }),
      Cesium.createWorldTerrainAsync({ requestWaterMask: true }),
    ]);
    viewer.imageryLayers.addImageryProvider(imagery);
    viewer.terrainProvider = terrain;
    mapMode = 'ion';
  } catch (e) {
    console.warn('Cesium ion failed, falling back to Lite mode', e);
    Cesium.Ion.defaultAccessToken = '';
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    addLiteImagery();
    mapMode = 'lite';
    toast(t('tokenFailed'), 6000);
    return;
  }
  if (prefs.google3d) {
    try {
      scene.primitives.add(await Cesium.createGooglePhotorealistic3DTileset());
      scene.globe.show = false;
      mapMode = 'google';
      return;
    } catch (e) {
      console.warn('Google 3D tiles failed', e);
      toast(t('googleFailed'), 5000);
    }
  }
  try { scene.primitives.add(await Cesium.createOsmBuildingsAsync()); }
  catch (e) { console.warn('OSM buildings failed', e); }
}

// ---------------------------------------------------------------------------
// Ground height
// ---------------------------------------------------------------------------
const groundCarto = new Cesium.Cartographic();
let asyncGround = { h: undefined, busy: false, last: 0 };

function groundAt(lon, lat) {
  if (mapMode === 'lite') return 0;
  groundCarto.longitude = lon; groundCarto.latitude = lat; groundCarto.height = 0;
  if (scene.globe.show) {
    const h = scene.globe.getHeight(groundCarto);
    if (h !== undefined) return h;
  }
  const now = performance.now();
  if (!asyncGround.busy && now - asyncGround.last > 200) {
    asyncGround.busy = true; asyncGround.last = now;
    Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [new Cesium.Cartographic(lon, lat)])
      .then(([r]) => { asyncGround.h = r.height; })
      .catch(() => {})
      .finally(() => { asyncGround.busy = false; });
  }
  return asyncGround.h;
}

async function terrainHeight(latDeg, lonDeg) {
  if (mapMode === 'lite' || mapMode === 'loading') return undefined;
  try {
    const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [Cesium.Cartographic.fromDegrees(lonDeg, latDeg)]);
    return c.height;
  } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const input = new Input();
input.invert = prefs.invert;
const plane = new PlaneModel(scene);
const course = new RingCourse(viewer);
const sound = new EngineSound();
const cockpit = new Cockpit($('cockpit'));
const feel = new Feel($('feel'));
const touch = new TouchControls(input, $('hud'));
const warnings = new Warnings(sound);
let warnLabel = '';
const minimap = new MiniMap($('mmCanvas'), { place: $('mmPlace'), coords: $('mmCoords'), heading: $('mmHeading') }, () => getLang());
document.body.classList.toggle('minimap-off', !prefs.minimap);
let topSpeed = 60;
// Landing gear: retracts automatically after take-off, extends near the ground. G overrides for a while.
const gearCtl = { target: 1, manualUntil: 0, announced: 1 };
sound.muted = prefs.muted;

let ac = null;                 // resolved aircraft in use
let state = null;
let prevSnap = {}, curSnap = {}, drawSnap = {};
let accumulator = 0;
let phase = 'menu';            // 'menu' | 'flying' | 'paused' | 'crashed' | 'finished'
let camMode = 'chase';          // 'chase' | 'cockpit' (interior) | 'nose'
const CAM_MODES = ['chase', 'cockpit', 'nose'];
let camPos = null;
let gameMode = 'free';
let mission = null; // runway start, take-off or landing mission
let place = null;
let courseStart = 0, courseTime = 0;
let lastFrame = performance.now();

// Menu preview: the selected aircraft hovering at the start point, camera orbiting it.
const preview = { start: null, h: 0, angle: 0.6, snap: {} };

function setPreviewPlace(p) {
  place = p;
  const st = startFromPlace(p);
  sky.setMode(prefs.tod, st.lon, st.lat, prefs.tspeed);
  weather.refresh(st.lat, st.lon, true);
  preview.start = st;
  preview.h = st.alt + (ac?.startBonusAlt || 0);
  terrainHeight(st.lat, st.lon).then(g => {
    if (g !== undefined && preview.start === st) preview.h = Math.max(preview.h, g + 300 + (ac?.startBonusAlt || 0));
  });
}

let windSens = 1;
function setAircraft(resolved) {
  ac = resolved;
  // light aircraft feel wind and bumps much more than airliners
  windSens = Math.min(2.2, Math.max(0.45, 13 / (ac.base.spec?.span || ac.span || 12)));
  plane.build(ac);
  plane.visible = phase !== 'menu' ? camMode === 'chase' : true;
  course.radius = Math.max(45, ac.span * 1.6);
  topSpeed = statsOf(ac.phys).topKmh / 3.6;
  cockpit.configure(ac, statsOf(ac.phys).topKmh);
  sound.small = (ac.base.spec?.span || 12) < 12 && ac.phys.engine === 'prop';
  $('throttleLever').classList.toggle('disabled', ac.phys.engine === 'none');
}

const menu = initMenu({
  prefs, savePrefs, token,
  getMapMode: () => mapMode,
  toast: (m, ms) => toast(m, ms),
  onPlaceChange: p => setPreviewPlace(p),
  onAircraftChange: a => setAircraft(a),
  onOptions: () => { input.invert = prefs.invert; applySkyPrefs(); },
  onStart: () => startFlight(),
  onResume: () => { sound.start(); setPhase('flying'); },
});
setAircraft(menu.getAircraft());
setPreviewPlace(menu.getPlace());

async function startFlight() {
  sound.start();
  menu.closeHangar(false);
  setAircraft(menu.getAircraft());
  place = menu.getPlace();
  gameMode = ['rings', 'takeoff', 'landing'].includes(prefs.mode) ? prefs.mode : 'free';
  mission?.removeLights(); mission = null;
  // airports: a launch link naming one, or the nearest airport to a city for the missions
  if (launch.ap) {
    try {
      await loadAirports();
      const ap = airportsLoaded().find(a => a.icao === launch.ap || a.iata === launch.ap);
      if (ap) { const ends = runwayEnds(ap); prefs.pick.airport = airportPlace(ap, ends.find(e => e.id === launch.rwy) || ends[0]); prefs.pick.cat = 'airport'; place = menu.getPlace(); }
    } catch { /* stay at the chosen place */ }
    launch.ap = null;
  }
  if (place.kind !== 'airport' && (gameMode === 'takeoff' || gameMode === 'landing')) {
    try {
      await loadAirports();
      const [ap] = nearestAirports(place.lat, place.lon, 1);
      if (ap) place = airportPlace(ap, runwayEnds(ap)[0]);
    } catch { gameMode = 'free'; }
  }
  asyncGround = { h: undefined, busy: false, last: 0 };
  let st;
  if (place.kind === 'airport' && gameMode !== 'rings') {
    const rwy = place.airport.rwy;
    mission = new Mission(viewer, gameMode === 'free' ? 'ground' : gameMode, rwy, ac.phys);
    const [g0, g1] = await Promise.all([terrainHeight(rwy.lat, rwy.lon), terrainHeight(rwy.endLat, rwy.endLon)]);
    const e0 = g0 ?? (mapMode === 'lite' ? 0 : rwy.elev), e1 = g1 ?? (mapMode === 'lite' ? 0 : rwy.endElev);
    mission.addLights(e0, e1);
    st = mission.start();
    state = createFlight(st, ac.phys);
    if (!st.air) {
      Object.assign(state, { onGround: true, speed: 0, throttle: 0, pitch: 0, h: e0 + ac.phys.gearH, ground: e0, agl: 0 });
    } else {
      // on the glide path at approach speed, power set to hold it
      const v = mission.approachSpeed();
      Object.assign(state, { speed: v, pitch: -0.052, throttle: Math.min(1, Math.max(0.05, (ac.phys.drag * v * v - 9.81 * Math.sin(0.052)) / ac.phys.thrust)) });
      if (ac.phys.engine === 'none') state.throttle = 0;
    }
  } else {
    st = startFromPlace(place);
    st.alt += ac.startBonusAlt;
    state = createFlight(st, ac.phys);
    const g = await terrainHeight(st.lat, st.lon);
    if (g !== undefined) {
      state.h = Math.max(state.h, g + 300 + ac.startBonusAlt);
      state.ground = g;
    }
  }
  snapshot(state, prevSnap); snapshot(state, curSnap);
  accumulator = 0;
  camPos = null; // hard cut, no camera slingshot after respawn
  feel.reset();
  minimap.forget();
  plane.gear = gearCtl.target = gearCtl.announced = state.onGround || mission?.type === 'landing' ? 1 : 0;
  gearCtl.manualUntil = mission?.type === 'landing' ? performance.now() + 15 * 60e3 : 0; // gear stays down on the approach
  input.clearEdges();

  course.clear();
  $('ringPanel').hidden = gameMode !== 'rings';
  $('missionPanel').hidden = !mission;
  if (mission) toast(t({ ground: 'missGround', takeoff: 'missTakeoffGo', landing: 'missLandingGo' }[mission.type], { r: mission.rwy.id }), 3500);
  if (gameMode === 'rings') {
    await course.build(state, RING_COUNT, mapMode !== 'lite');
    courseStart = performance.now();
    courseTime = 0;
    toast(t('ringGo'));
  }
  $('hPlace').textContent = `${place.name} · ${menu.aircraftName(ac)}`;
  sky.setMode(prefs.tod, st.lon, st.lat, prefs.tspeed);
  weather.refresh(st.lat, st.lon, true);
  updateWxLabel();
  setPhase('flying');
}

function setPhase(p) {
  phase = p;
  if (p !== 'flying') { warnings.reset(); warnLabel = ''; }
  $('menu').hidden = !(p === 'menu' || p === 'paused');
  $('resumeBtn').hidden = p !== 'paused';
  $('result').hidden = !(p === 'crashed' || p === 'finished');
  $('hud').hidden = p === 'menu';
  plane.visible = p === 'menu' || camMode === 'chase';
  applyCamView();
  if (p === 'menu') { course.clear(); mission?.removeLights(); mission = null; $('missionPanel').hidden = true; setPreviewPlace(menu.getPlace()); }
  lastFrame = performance.now();
}

function fmtTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function onCrash(reason = 'crashGround') {
  sound.crash();
  feel.addTrauma(1);
  $('resTitle').textContent = t('crashTitle');
  $('resText').textContent = `${t(reason)} ${t('crashTip')}`;
  setPhase('crashed');
}

function onMission(done) {
  sound.chime(done.ok);
  const v = done.vals;
  const fmt = { t: v.t?.toFixed(0), dev: v.dev?.toFixed(1), score: v.score, sink: v.sink?.toFixed(1), aim: v.aim === undefined ? '' : `${v.aim > 0 ? '+' : ''}${Math.round(v.aim)}`, cl: v.cl?.toFixed(1) };
  $('resTitle').textContent = t(done.ok ? 'missOkTitle' : 'missFailTitle');
  $('resText').textContent = t(done.key, fmt);
  setPhase('finished');
}

function onFinish() {
  sound.chime(true);
  const best = readJSON(BEST_KEY, {});
  const key = `${place.name}|${ac.baseId}`;
  const prev = best[key];
  const isBest = !prev || courseTime < prev;
  if (isBest) { best[key] = courseTime; writeJSON(BEST_KEY, best); }
  $('resTitle').textContent = t('finishTitle');
  $('resText').textContent = `${t('finishText', { t: fmtTime(courseTime) })} · ${isBest ? t('finishBest') : t('finishPrev', { t: fmtTime(prev) })}`;
  setPhase('finished');
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const C3 = Cesium.Cartesian3;
const tmp = { a: new C3(), b: new C3(), dir: new C3(), up: new C3(), right: new C3(), surf: new C3(), off: new C3() };
const AHEAD = new C3(200, 0, 0);
const BODY_UP = new C3(0, 0, 1);

function resetCameraFrame(cam) {
  if (!Cesium.Matrix4.equals(cam.transform, Cesium.Matrix4.IDENTITY)) cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

function updateCamera(M, dt, fx) {
  const cam = viewer.camera;
  cam.frustum.fov = Cesium.Math.toRadians(fx.fov);
  resetCameraFrame(cam);
  const d = ac.cam.dist;
  if (camMode !== 'chase') {
    const [cx, cz] = ac.cam.cockpit;
    const eye = Cesium.Matrix4.multiplyByPoint(M, C3.fromElements(cx, 0, cz, tmp.off), tmp.a);
    const ahead = Cesium.Matrix4.multiplyByPoint(M, AHEAD, tmp.b);
    C3.normalize(C3.subtract(ahead, eye, tmp.dir), tmp.dir);
    C3.normalize(Cesium.Matrix4.multiplyByPointAsVector(M, BODY_UP, tmp.up), tmp.up);
    cam.setView({ destination: eye, orientation: { direction: tmp.dir, up: tmp.up } });
    applyShake(cam, fx);
    return;
  }
  const dd = d * fx.distScale;
  const desired = Cesium.Matrix4.multiplyByPoint(M, C3.fromElements(-dd, 0, dd * 0.25, tmp.off), tmp.a);
  if (!camPos || dt <= 0) camPos = C3.clone(desired, camPos || new C3());
  else C3.lerp(camPos, desired, 1 - Math.exp(-7 * dt), camPos); // frame-rate independent smoothing
  const look = Cesium.Matrix4.multiplyByPoint(M, C3.fromElements(d, 0, d * 0.06, tmp.off), tmp.b);
  C3.normalize(C3.subtract(look, camPos, tmp.dir), tmp.dir);
  const bodyUp = Cesium.Matrix4.multiplyByPointAsVector(M, BODY_UP, tmp.up);
  const worldUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(camPos, tmp.surf);
  C3.normalize(C3.add(C3.multiplyByScalar(bodyUp, 0.45, bodyUp), C3.multiplyByScalar(worldUp, 0.55, worldUp), tmp.up), tmp.up);
  C3.normalize(C3.cross(tmp.dir, tmp.up, tmp.right), tmp.right);
  C3.normalize(C3.cross(tmp.right, tmp.dir, tmp.up), tmp.up);
  cam.setView({ destination: camPos, orientation: { direction: tmp.dir, up: tmp.up } });
  applyShake(cam, fx);
}

function applyShake(cam, fx) {
  if (fx.yaw) cam.lookRight(fx.yaw);
  if (fx.pitch) cam.lookUp(fx.pitch);
  if (fx.roll) cam.twistRight(fx.roll);
}

function menuPreview(dt) {
  if (!preview.start || !ac) return;
  const st = preview.start;
  const s = preview.snap;
  s.lat = st.lat * Math.PI / 180; s.lon = st.lon * Math.PI / 180; s.h = preview.h;
  s.heading = st.heading * Math.PI / 180; s.pitch = 0.04; s.roll = Math.sin(performance.now() / 2200) * 0.12;
  plane.update(s);
  preview.angle += dt * 0.12;
  const cam = viewer.camera;
  const center = C3.fromRadians(s.lon, s.lat, s.h, Cesium.Ellipsoid.WGS84, tmp.a);
  cam.frustum.fov = Cesium.Math.toRadians(60);
  cam.lookAt(center, new Cesium.HeadingPitchRange(s.heading + preview.angle, -0.22, ac.cam.dist * 2.4));
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hud = {
  speed: $('hSpeed'), alt: $('hAlt'), agl: $('hAgl'), vs: $('hVs'), heading: $('hHeading'),
  thr: $('hThrottle'), thrTxt: $('hThrottleTxt'), horizon: $('horizon'), warn: $('warn'),
  rCount: $('rCount'), rTime: $('rTime'), rArrow: $('rArrow'), rDist: $('rDist'), rDy: $('rDy'),
};
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
let hudTick = 0;

// Mission panel: runway, distance, glide path and centreline guidance
function updateMissionPanel(s) {
  const g = mission.guidance(s), r = mission.rwy;
  const lr = c => (Math.abs(c) < 3 ? t('mCentre') : `${c > 0 ? '◀' : '▶'} ${Math.round(Math.abs(c))} m`);
  $('mTitle').textContent = `${t({ ground: 'mGround', takeoff: 'mTakeoff', landing: 'mLanding' }[mission.type])} · ${t('runway')} ${r.id}`;
  if (mission.type === 'landing' && !s.onGround) {
    const gs = Math.abs(g.gsDev) < 8 ? t('mOnPath') : `${g.gsDev > 0 ? '▼' : '▲'} ${Math.round(Math.abs(g.gsDev))} m`;
    $('mLine1').textContent = `${(Math.max(0, g.toThr) / 1000).toFixed(1)} km · ${t('mGlide')} ${gs}`;
    $('mLine2').textContent = `${t('mCl')} ${lr(g.cross)} · ${t('mVapp')} ${Math.round(mission.approachSpeed() * 3.6)} km/h`;
  } else {
    $('mLine1').textContent = s.onGround ? `Vr ${Math.round(ac.phys.vRotate * 3.6)} km/h · ${Math.max(0, Math.round(r.len - g.along))} m ${t('mLeft')}` : `${Math.round(s.agl)} m AGL`;
    $('mLine2').textContent = `${t('mCl')} ${lr(g.cross)}`;
  }
}

function updateHud(s, d) {
  const rollDeg = d.roll * 180 / Math.PI, pitchDeg = d.pitch * 180 / Math.PI;
  hud.horizon.style.transform = `rotate(${-rollDeg}deg) translateY(${pitchDeg * 4}px)`;
  if ((hudTick++ % 4) !== 0) return;

  hud.speed.textContent = Math.round(s.speed * 3.6);
  hud.alt.textContent = Math.round(s.h);
  hud.agl.textContent = Number.isFinite(s.agl) ? Math.max(0, Math.round(s.agl)) : '—';
  hud.vs.textContent = s.vs.toFixed(1);
  const hdg = (Math.round(s.heading * 180 / Math.PI) + 360) % 360;
  hud.heading.textContent = `${String(hdg).padStart(3, '0')}° ${COMPASS[Math.round(hdg / 45) % 8]}`;
  const thr = ac.phys.engine === 'none' ? 0 : s.throttle;
  hud.thr.style.width = `${Math.round(thr * 100)}%`;
  hud.thrTxt.textContent = ac.phys.engine === 'none' ? '—' : `${Math.round(thr * 100)}%`;

  const WARN_TEXT = { 'STALL': 'stall', 'PULL UP': 'pullUp', 'SINK RATE': 'warnSink', 'TOO LOW GEAR': 'warnGear', 'BANK ANGLE': 'warnBank', 'OVERSPEED': 'warnOverspeed' };
  const warn = warnLabel ? t(WARN_TEXT[warnLabel] || 'stall') : '';
  hud.warn.hidden = !warn;
  hud.warn.textContent = warn;

  if (mission) updateMissionPanel(s);
  if (gameMode === 'rings' && course.active) {
    hud.rCount.textContent = `${Math.min(course.index + 1, course.rings.length)}/${course.rings.length}`;
    hud.rTime.textContent = fmtTime(courseTime);
    const n = course.navInfo(s);
    if (n) {
      hud.rArrow.style.transform = `rotate(${n.rel * 180 / Math.PI - 90}deg)`;
      hud.rDist.textContent = Math.round(n.dist);
      hud.rDy.textContent = Math.abs(n.dy) < 25 ? '' : `${n.dy > 0 ? '▲' : '▼'} ${Math.round(Math.abs(n.dy))} m`;
    }
  }
}

let toastTimer = 0;
function toast(msg, ms = 2500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------------------------------------------------------------------
// Camera view + on-screen throttle lever
// ---------------------------------------------------------------------------
function applyCamView() {
  const inCockpit = camMode === 'cockpit' && phase !== 'menu';
  cockpit.visible = inCockpit;
  document.body.classList.toggle('cockpit-on', inCockpit);
}

const lever = { track: $('tlTrack'), knob: $('tlKnob'), fill: $('tlFill'), txt: $('tlTxt'), dragging: false };
function leverSet(clientY) {
  if (!state || ac.phys.engine === 'none') return;
  const r = lever.track.getBoundingClientRect();
  const pad = 10;
  const f = 1 - (clientY - r.top - pad) / (r.height - pad * 2);
  state.throttle = Math.min(1, Math.max(0, f));
}
lever.track.addEventListener('pointerdown', e => {
  lever.dragging = true;
  lever.track.setPointerCapture(e.pointerId);
  leverSet(e.clientY);
  e.preventDefault();
});
lever.track.addEventListener('pointermove', e => { if (lever.dragging) leverSet(e.clientY); });
const leverUp = () => { lever.dragging = false; };
lever.track.addEventListener('pointerup', leverUp);
lever.track.addEventListener('pointercancel', leverUp);
lever.track.addEventListener('wheel', e => {
  if (!state) return;
  state.throttle = Math.min(1, Math.max(0, state.throttle - Math.sign(e.deltaY) * 0.05));
  e.preventDefault();
}, { passive: false });

// Crash / finish screen buttons (mouse and touch)
$('resRetryBtn').addEventListener('click', () => { if (phase === 'crashed' || phase === 'finished') startFlight(); });
$('resMenuBtn').addEventListener('click', () => { if (phase === 'crashed' || phase === 'finished') setPhase('menu'); });

function updateGear(dt) {
  const now = performance.now();
  if (input.consume('gear')) {
    gearCtl.target = gearCtl.target > 0.5 ? 0 : 1;
    gearCtl.manualUntil = now + 20000;
  } else if (now > gearCtl.manualUntil) {
    const agl = Number.isFinite(state.agl) ? state.agl : state.h;
    if (state.onGround) gearCtl.target = 1;
    else if (gearCtl.target === 1 && agl > 250 && state.vs > -2) gearCtl.target = 0;
    else if (gearCtl.target === 0 && (agl < 180 || (agl < 450 && state.vs < -4))) gearCtl.target = 1;
  }
  const rate = dt / 3; // about three seconds for a full cycle
  plane.gear += Math.max(-rate, Math.min(rate, gearCtl.target - plane.gear));
  if (gearCtl.target !== gearCtl.announced) {
    gearCtl.announced = gearCtl.target;
    toast(t(gearCtl.target ? 'gearDown' : 'gearUp'), 1400);
    sound.gear?.(gearCtl.target);
  }
}

function updateLever() {
  const thr = ac.phys.engine === 'none' ? 0 : state.throttle;
  const pct = Math.round(thr * 100);
  lever.knob.style.bottom = `calc(10px + ${thr} * (100% - 20px))`;
  lever.fill.style.height = `calc(${thr} * (100% - 6px))`;
  lever.txt.textContent = ac.phys.engine === 'none' ? '—' : `${pct}%`;
  lever.track.setAttribute('aria-valuenow', String(pct));
}

// ---------------------------------------------------------------------------
// Main loop: fixed-step physics, interpolated rendering
// ---------------------------------------------------------------------------
const planePos = new C3();

// Where the sky is looked at: the aircraft in flight, the preview point in the menu.
function skyPoint() {
  if (state && phase !== 'menu') return { lon: state.lon * 180 / Math.PI, lat: state.lat * 180 / Math.PI, h: state.h, hdg: state.heading, v: state.speed, g: state.ground };
  const st = preview.start;
  return st ? { lon: st.lon, lat: st.lat, h: preview.h, hdg: st.heading * Math.PI / 180, v: 0, g: undefined } : null;
}
let skyTick = 0, dark = 0;
function skyFrame(dt) {
  const p = skyPoint();
  if (!p) return;
  if ((skyTick++ % 10) === 0) {
    dark = sky.update(p.lon, p.lat, weather.now.live ? weather.now.cloud * (weather.aboveDeck ? 0.1 : 1) : 0); // clear sun above the overcast
    document.body.classList.toggle('is-night', dark > 0.6);
  }
  if ((skyTick % 600) === 0 && phase === 'flying') weather.refresh(p.lat, p.lon);
  weather.frame(dt, p.lon, p.lat, p.h, p.hdg, p.v, p.g, dark, phase === 'flying' && camMode !== 'nose');
  if ((skyTick % 15) === 0) updateClockWind(p);
}
// HUD: local time at the place, and the wind relative to the nose (arrow shows where it blows to)
const hClock = $('hClock'), hWind = $('hWind'), hWindArrow = $('hWindArrow'), hWindTxt = $('hWindTxt');
function updateClockWind(p) {
  hClock.textContent = `${t('hudLocal')} ${sky.localTime(p.lon, weather.utcOffset)}${sky.speed > 1 ? ` (×${sky.speed})` : ''}`;
  const w = weather.windAt(state && phase !== 'menu' ? state.agl : 500);
  const on = (weather.now.live || weather.manual) && w.speed >= 0.5;
  hWind.hidden = !on;
  if (!on) return;
  hWindArrow.style.transform = `rotate(${((w.to - p.hdg) * 180 / Math.PI).toFixed(0)}deg)`;
  hWindTxt.textContent = `${t('hudWind')} ${Math.round(w.speed * 3.6)} km/h`;
}
function applySkyPrefs() {
  const p = skyPoint();
  if (p) sky.setMode(prefs.tod, p.lon, p.lat, prefs.tspeed);
  if (weather.mode !== prefs.wx) { weather.setMode(prefs.wx); if (p) weather.refresh(p.lat, p.lon, true); }
  weather.setManualWind(prefs.windMan ? prefs.windKmh : NaN, prefs.windDir);
  updateWxLabel();
}

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  input.poll(dt);

  if (input.consume('minimap')) {
    prefs.minimap = !prefs.minimap; savePrefs();
    document.body.classList.toggle('minimap-off', !prefs.minimap);
    toast(t(prefs.minimap ? 'minimapOn' : 'minimapOff'), 1200);
  }
  if (input.consume('mute')) {
    prefs.muted = !prefs.muted; savePrefs();
    sound.setMuted(prefs.muted);
    toast(t(prefs.muted ? 'soundOff' : 'soundOn'), 1200);
  }

  if (input.consume('timeOfDay')) {
    prefs.tod = TIME_MODES[(TIME_MODES.indexOf(prefs.tod) + 1) % TIME_MODES.length]; savePrefs();
    applySkyPrefs();
    const p = skyPoint();
    toast(`${t(TOD_KEY[prefs.tod])}${p ? ` · ${sky.localTime(p.lon, weather.utcOffset)}` : ''}`, 1600);
  }
  skyFrame(dt);

  if (phase === 'menu') { feel.draw(dt, 0, 0, false); menuPreview(dt); sound.update(0, 0, false, 'prop'); return; }

  if (phase === 'crashed' || phase === 'finished') {
    feel.draw(dt, 0, 0, false);
    if (input.consume('restart')) startFlight();
    if (input.consume('pause')) setPhase('menu');
    sound.update(0, 0, false, ac.phys.engine);
    return;
  }
  if (phase === 'paused') {
    if (input.consume('pause')) setPhase('flying');
    sound.update(0, 0, false, ac.phys.engine);
    return;
  }

  if (input.consume('pause')) { setPhase('paused'); return; }
  if (input.consume('camera')) {
    camMode = CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length];
    plane.visible = camMode === 'chase';
    camPos = null;
    applyCamView();
    toast(t({ chase: 'camChase', cockpit: 'camCockpit', nose: 'camNose' }[camMode]), 1200);
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 24) {
    snapshot(state, prevSnap);
    stepFlight(state, input.axes, FIXED_DT, groundAt(state.lon, state.lat), { assist: prefs.assist }, ac.phys);
    weather.stepFlight(state, FIXED_DT, windSens);
    snapshot(state, curSnap);
    accumulator -= FIXED_DT;
    steps++;

    if (state.landedEvent && plane.gear < 0.6) { state.crashed = true; state.crashReason = 'crashGear'; break; }
    if (state.landedEvent) feel.addTrauma(Math.min(0.6, 0.15 + Math.abs(state.landedEvent.sink) * 0.08));
    if (state.landedEvent) toast(state.landedEvent.sink > -1.5 ? t('landedSoft') : t('landed'));
    if (state.crashed) break;
    if (mission) {
      mission.update(state, FIXED_DT);
      if (mission.done) { onMission(mission.done); break; }
    }

    if (gameMode === 'rings' && course.active) {
      C3.fromRadians(state.lon, state.lat, state.h, Cesium.Ellipsoid.WGS84, planePos);
      const res = course.check(planePos);
      if (res === 'pass') sound.chime();
      if (res === 'finish') { courseTime = performance.now() - courseStart; onFinish(); break; }
    }
  }
  if (steps === 24) accumulator = 0;

  lerpSnap(prevSnap, curSnap, Math.min(1, accumulator / FIXED_DT), drawSnap);
  updateGear(dt);
  warnings.enabled = prefs.warnings !== false;
  warnLabel = warnings.update(state, ac, plane.gear, topSpeed, phase === 'flying');
  const M = plane.update(drawSnap);
  const fxOn = !prefs.calm;
  const fx = feel.update(dt, state, topSpeed, fxOn, camMode);
  updateCamera(M, dt, fx);
  feel.draw(dt, fx.sp01 || 0, feel.acc, fxOn && phase === 'flying');
  if (prefs.minimap && (hudTick % 3) === 0) {
    minimap.update(drawSnap.lat * 180 / Math.PI, drawSnap.lon * 180 / Math.PI, state.heading * 180 / Math.PI, state.agl, state.speed);
  }

  if (gameMode === 'rings' && phase === 'flying') courseTime = performance.now() - courseStart;
  updateHud(state, drawSnap);
  updateLever();
  if (camMode === 'cockpit') {
    const view = Object.assign({}, state, drawSnap);
    // what lands on the windscreen: rain or snow below the cloud deck, moisture inside cloud
    const wn = weather.now, falling = wn.live && !weather.aboveDeck && ['rain', 'snow', 'storm'].includes(wn.kind);
    cockpit.wet = {
      kind: falling ? (wn.kind === 'snow' ? 'snow' : 'rain') : weather.inCloud > 0.3 ? 'mist' : null,
      amount: Math.min(1, 0.3 + (wn.rain || 0.4) / 4) * (wn.kind === 'storm' ? 1.3 : 1), dark,
    };
    cockpit.wind = weather.windAt(state.agl);
    cockpit.gear = plane.gear;
    cockpit.draw(view, input.axes, dt, gameMode === 'rings' && course.active ? course.navInfo(state) : null);
  }
  sound.update(state.throttle, state.speed, phase === 'flying', ac.phys.engine);

  if (state.crashed && phase === 'flying') onCrash(state.crashReason);
});

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touchNote').hidden = false;

setPhase('menu');
setupMap().then(() => {
  sky.attach();
  menu.updateMapStatus(); setPreviewPlace(menu.getPlace());
  if (launch.fly) {
    $('welcome').hidden = true;
    if (launch.cam) camMode = launch.cam;
    if (launch.shot) document.body.classList.add('shot');
    startFlight();
    // browsers only allow sound after a tap or key press
    // (keep trying until the browser really lets the audio run)
    const wake = () => {
      sound.start();
      setTimeout(() => { if (sound.ctx?.state === 'running') { removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); } }, 50);
    };
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
  }
});

window.skyroam = { viewer, sky, weather, sound, get state() { return state; }, get aircraft() { return ac; }, get mission() { return mission; } };
