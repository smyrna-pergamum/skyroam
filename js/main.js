/* global Cesium */
import { t, setLang, getLang, applyI18n } from './i18n.js';
import { LOCATIONS } from './locations.js';
import { FIXED_DT, createFlight, stepFlight, snapshot, lerpSnap, LIMITS } from './flight.js';
import { Input, KEY_HELP } from './input.js';
import { PlaneModel } from './plane.js';
import { RingCourse } from './rings.js';
import { EngineSound } from './audio.js';

const $ = id => document.getElementById(id);
const RING_COUNT = 12;

// ---------------------------------------------------------------------------
// Storage helpers (all wrapped: private mode or blocked storage must not break the game)
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'skyroam.ionToken';
const PREFS_KEY = 'skyroam.prefs';
const BEST_KEY = 'skyroam.best';

function store(kind) { try { return window[kind]; } catch { return null; } }
function readJSON(key, fallback) {
  try { return JSON.parse(store('localStorage')?.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, val) { try { store('localStorage')?.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } }

function getToken() {
  try {
    return store('localStorage')?.getItem(TOKEN_KEY) || store('sessionStorage')?.getItem(TOKEN_KEY) || '';
  } catch { return ''; }
}
function saveToken(token, remember) {
  try {
    store('localStorage')?.removeItem(TOKEN_KEY);
    store('sessionStorage')?.removeItem(TOKEN_KEY);
    if (token) store(remember ? 'localStorage' : 'sessionStorage')?.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

const prefs = Object.assign(
  { lang: null, location: 'bosphorus', mode: 'free', invert: false, assist: true, google3d: false, muted: false },
  readJSON(PREFS_KEY, {}),
);
const savePrefs = () => writeJSON(PREFS_KEY, prefs);

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
      const tiles = await Cesium.createGooglePhotorealistic3DTileset();
      scene.primitives.add(tiles);
      scene.globe.show = false; // Google tiles include their own ground
      mapMode = 'google';
      return;
    } catch (e) {
      console.warn('Google 3D tiles failed', e);
      toast(t('googleFailed'), 5000);
    }
  }
  try {
    scene.primitives.add(await Cesium.createOsmBuildingsAsync());
  } catch (e) { console.warn('OSM buildings failed', e); }
}

// ---------------------------------------------------------------------------
// Ground height under the plane
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
  // Globe hidden (Google tiles) or tile not loaded yet: sample the terrain asynchronously.
  const now = performance.now();
  if (!asyncGround.busy && now - asyncGround.last > 200) {
    asyncGround.busy = true; asyncGround.last = now;
    const c = new Cesium.Cartographic(lon, lat);
    Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [c])
      .then(([r]) => { asyncGround.h = r.height; })
      .catch(() => {})
      .finally(() => { asyncGround.busy = false; });
  }
  return asyncGround.h;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const input = new Input();
const plane = new PlaneModel(scene);
const course = new RingCourse(viewer);
const sound = new EngineSound();
sound.muted = prefs.muted;

let state = null;            // flight state (fixed-step)
let prevSnap = {}, curSnap = {}, drawSnap = {};
let accumulator = 0;
let phase = 'menu';          // 'menu' | 'flying' | 'paused' | 'crashed' | 'finished'
let camMode = 'chase';
let camPos = null;           // smoothed chase camera position
let gameMode = 'free';
let currentLoc = LOCATIONS[0];
let courseStart = 0, courseTime = 0;
let lastFrame = performance.now();
let attractAngle = 0;

input.invert = prefs.invert;

async function startFlight() {
  sound.start();
  currentLoc = LOCATIONS.find(l => l.id === $('locSelect').value) || LOCATIONS[0];
  gameMode = document.querySelector('input[name=mode]:checked').value;
  Object.assign(prefs, { location: currentLoc.id, mode: gameMode });
  savePrefs();

  state = createFlight(currentLoc);
  asyncGround = { h: undefined, busy: false, last: 0 };
  if (mapMode !== 'lite') {
    try {
      const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,
        [Cesium.Cartographic.fromDegrees(currentLoc.lon, currentLoc.lat)]);
      state.h = Math.max(state.h, (c.height || 0) + 300);
      state.ground = c.height;
    } catch { /* keep configured altitude */ }
  }
  snapshot(state, prevSnap); snapshot(state, curSnap);
  accumulator = 0;
  camPos = null; // hard cut: no camera slingshot after respawn
  input.clearEdges();

  course.clear();
  $('ringPanel').hidden = gameMode !== 'rings';
  if (gameMode === 'rings') {
    await course.build(state, RING_COUNT, mapMode !== 'lite');
    courseStart = performance.now();
    courseTime = 0;
    toast(t('ringGo'));
  }
  setPhase('flying');
}

function setPhase(p) {
  phase = p;
  $('menu').hidden = !(p === 'menu' || p === 'paused');
  $('resumeBtn').hidden = p !== 'paused';
  $('result').hidden = !(p === 'crashed' || p === 'finished');
  $('hud').hidden = p === 'menu';
  plane.visible = p !== 'menu' && camMode === 'chase';
  if (p === 'flying') lastFrame = performance.now();
}

function fmtTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function onCrash() {
  sound.crash();
  $('resTitle').textContent = t('crashTitle');
  $('resText').textContent = `${t('crashGround')} ${t('crashTip')}`;
  setPhase('crashed');
}

function onFinish() {
  sound.chime(true);
  const best = readJSON(BEST_KEY, {});
  const prev = best[currentLoc.id];
  const isBest = !prev || courseTime < prev;
  if (isBest) { best[currentLoc.id] = courseTime; writeJSON(BEST_KEY, best); }
  $('resTitle').textContent = t('finishTitle');
  $('resText').textContent = `${t('finishText', { t: fmtTime(courseTime) })} · ${isBest ? t('finishBest') : t('finishPrev', { t: fmtTime(prev) })}`;
  setPhase('finished');
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const C3 = Cesium.Cartesian3;
const tmp = { a: new C3(), b: new C3(), dir: new C3(), up: new C3(), right: new C3(), surf: new C3() };
const CHASE_OFFSET = new C3(-26, 0, 6.5);
const CHASE_LOOK = new C3(25, 0, 1.5);
const COCKPIT_OFFSET = new C3(1.9, 0, 1.25);
const AHEAD = new C3(100, 0, 0);
const BODY_UP = new C3(0, 0, 1);

function updateCamera(M, dt) {
  const cam = viewer.camera;
  // The menu's orbit uses lookAt(), which leaves the camera in a local frame; reset it.
  if (!Cesium.Matrix4.equals(cam.transform, Cesium.Matrix4.IDENTITY)) cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
  if (camMode === 'cockpit') {
    const eye = Cesium.Matrix4.multiplyByPoint(M, COCKPIT_OFFSET, tmp.a);
    const ahead = Cesium.Matrix4.multiplyByPoint(M, AHEAD, tmp.b);
    C3.normalize(C3.subtract(ahead, eye, tmp.dir), tmp.dir);
    C3.normalize(Cesium.Matrix4.multiplyByPointAsVector(M, BODY_UP, tmp.up), tmp.up);
    cam.setView({ destination: eye, orientation: { direction: tmp.dir, up: tmp.up } });
    return;
  }
  const desired = Cesium.Matrix4.multiplyByPoint(M, CHASE_OFFSET, tmp.a);
  if (!camPos || dt <= 0) camPos = C3.clone(desired, camPos || new C3());
  else C3.lerp(camPos, desired, 1 - Math.exp(-7 * dt), camPos); // frame-rate independent smoothing
  const look = Cesium.Matrix4.multiplyByPoint(M, CHASE_LOOK, tmp.b);
  C3.normalize(C3.subtract(look, camPos, tmp.dir), tmp.dir);
  // Blend the plane's up with the world up so the chase cam leans into turns without fully rolling.
  const bodyUp = Cesium.Matrix4.multiplyByPointAsVector(M, BODY_UP, tmp.up);
  const worldUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(camPos, tmp.surf);
  C3.normalize(C3.add(C3.multiplyByScalar(bodyUp, 0.45, bodyUp), C3.multiplyByScalar(worldUp, 0.55, worldUp), tmp.up), tmp.up);
  C3.normalize(C3.cross(tmp.dir, tmp.up, tmp.right), tmp.right);
  C3.normalize(C3.cross(tmp.right, tmp.dir, tmp.up), tmp.up);
  cam.setView({ destination: camPos, orientation: { direction: tmp.dir, up: tmp.up } });
}

function attractCamera(dt) {
  const loc = LOCATIONS.find(l => l.id === $('locSelect').value) || LOCATIONS[0];
  attractAngle += dt * 0.05;
  const center = C3.fromDegrees(loc.lon, loc.lat, Math.max(0, loc.alt - 400));
  viewer.camera.lookAt(center, new Cesium.HeadingPitchRange(attractAngle, -0.35, 4500));
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

function updateHud(s, d) {
  // Attitude every frame (smooth), numbers ~15x per second (readable).
  const rollDeg = d.roll * 180 / Math.PI, pitchDeg = d.pitch * 180 / Math.PI;
  hud.horizon.style.transform = `rotate(${-rollDeg}deg) translateY(${pitchDeg * 4}px)`;
  if ((hudTick++ % 4) !== 0) return;

  hud.speed.textContent = Math.round(s.speed * 3.6);
  hud.alt.textContent = Math.round(s.h);
  hud.agl.textContent = Number.isFinite(s.agl) ? Math.max(0, Math.round(s.agl)) : '—';
  hud.vs.textContent = s.vs.toFixed(1);
  const hdg = (Math.round(s.heading * 180 / Math.PI) + 360) % 360;
  hud.heading.textContent = `${String(hdg).padStart(3, '0')}° ${COMPASS[Math.round(hdg / 45) % 8]}`;
  hud.thr.style.width = `${Math.round(s.throttle * 100)}%`;
  hud.thrTxt.textContent = `${Math.round(s.throttle * 100)}%`;

  let warn = '';
  if (s.stalled) warn = t('stall');
  else if (!s.onGround && Number.isFinite(s.agl) && s.agl < 120 && s.vs < -12) warn = t('pullUp');
  hud.warn.hidden = !warn;
  hud.warn.textContent = warn;

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
// Main loop: fixed-step physics, interpolated rendering
// ---------------------------------------------------------------------------
const planePos = new C3();

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  input.poll(dt);

  if (input.consume('mute')) {
    prefs.muted = !prefs.muted; savePrefs();
    sound.setMuted(prefs.muted);
    toast(t(prefs.muted ? 'soundOff' : 'soundOn'), 1200);
  }

  if (phase === 'menu') { attractCamera(dt); sound.update(0, 0, false); return; }

  if (phase === 'crashed' || phase === 'finished') {
    if (input.consume('restart')) startFlight();
    if (input.consume('pause')) setPhase('menu');
    sound.update(0, 0, false);
    return;
  }
  if (phase === 'paused') {
    if (input.consume('pause')) setPhase('flying');
    sound.update(0, 0, false);
    return;
  }

  // phase === 'flying'
  if (input.consume('pause')) { setPhase('paused'); return; }
  if (input.consume('camera')) {
    camMode = camMode === 'chase' ? 'cockpit' : 'chase';
    plane.visible = camMode === 'chase';
    camPos = null;
    toast(t(camMode === 'chase' ? 'camChase' : 'camCockpit'), 1200);
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 24) {
    snapshot(state, prevSnap);
    stepFlight(state, input.axes, FIXED_DT, groundAt(state.lon, state.lat), { assist: prefs.assist });
    snapshot(state, curSnap);
    accumulator -= FIXED_DT;
    steps++;

    if (state.landedEvent) toast(state.landedEvent.sink > -1.5 ? t('landedSoft') : t('landed'));
    if (state.crashed) break;

    if (gameMode === 'rings' && course.active) {
      C3.fromRadians(state.lon, state.lat, state.h, Cesium.Ellipsoid.WGS84, planePos);
      const res = course.check(planePos);
      if (res === 'pass') sound.chime();
      if (res === 'finish') { courseTime = performance.now() - courseStart; onFinish(); break; }
    }
  }
  if (steps === 24) accumulator = 0; // tab was in background; don't spiral

  lerpSnap(prevSnap, curSnap, Math.min(1, accumulator / FIXED_DT), drawSnap);
  const M = plane.update(drawSnap);
  updateCamera(M, dt);

  if (gameMode === 'rings' && phase === 'flying') courseTime = performance.now() - courseStart;
  updateHud(state, drawSnap);
  sound.update(state.throttle, state.speed, phase === 'flying');

  if (state.crashed && phase === 'flying') onCrash();
});

// ---------------------------------------------------------------------------
// Menu wiring
// ---------------------------------------------------------------------------
function renderMenu() {
  applyI18n();
  $('langBtn').textContent = getLang() === 'tr' ? 'EN' : 'TR';
  const sel = $('locSelect');
  sel.innerHTML = '';
  for (const l of LOCATIONS) {
    const o = document.createElement('option');
    o.value = l.id; o.textContent = getLang() === 'tr' ? l.tr : l.en;
    sel.appendChild(o);
  }
  sel.value = prefs.location;
  document.querySelector(`input[name=mode][value=${prefs.mode === 'rings' ? 'rings' : 'free'}]`).checked = true;
  updateModeHint();
  $('optInvert').checked = prefs.invert;
  $('optAssist').checked = prefs.assist;
  $('optGoogle').checked = prefs.google3d;
  $('tokenInput').value = token ? '••••••••' : '';
  updateMapStatus();

  const tb = $('keysTable');
  tb.innerHTML = '';
  for (const [label, keys] of KEY_HELP) {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = t(label);
    const b = document.createElement('td');
    for (const k of keys) { const kb = document.createElement('kbd'); kb.textContent = k; b.appendChild(kb); }
    tr.append(a, b); tb.appendChild(tr);
  }
  const pad = document.createElement('tr');
  const pd = document.createElement('td'); pd.colSpan = 2; pd.textContent = t('kPad');
  pad.appendChild(pd); tb.appendChild(pad);
}

function updateModeHint() {
  const m = document.querySelector('input[name=mode]:checked').value;
  $('modeHint').textContent = t(m === 'rings' ? 'modeRingsHint' : 'modeFreeHint');
}

function updateMapStatus() {
  const el = $('mapStatus');
  const map = { loading: ['statusLoading', ''], lite: ['statusLite', 'lite'], ion: ['statusIon', 'ion'], google: ['statusGoogle', 'ion'] };
  const [k, cls] = map[mapMode];
  el.textContent = t(k);
  el.className = `pill ${cls}`;
}

$('langBtn').addEventListener('click', () => {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  prefs.lang = getLang(); savePrefs();
  renderMenu();
});
$('locSelect').addEventListener('change', e => { prefs.location = e.target.value; savePrefs(); });
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
  prefs.mode = r.value; savePrefs(); updateModeHint();
}));
$('optInvert').addEventListener('change', e => { prefs.invert = input.invert = e.target.checked; savePrefs(); });
$('optAssist').addEventListener('change', e => { prefs.assist = e.target.checked; savePrefs(); });
$('optGoogle').addEventListener('change', e => { prefs.google3d = e.target.checked; savePrefs(); });

$('startBtn').addEventListener('click', () => { startFlight(); });
$('resumeBtn').addEventListener('click', () => { sound.start(); setPhase('flying'); });
$('resRetryBtn').addEventListener('click', () => { startFlight(); });
$('resMenuBtn').addEventListener('click', () => setPhase('menu'));

$('tokenInput').addEventListener('focus', e => { if (e.target.value.startsWith('•')) e.target.value = ''; });
$('saveTokenBtn').addEventListener('click', () => {
  const v = $('tokenInput').value.trim();
  if (v.startsWith('•')) { location.reload(); return; }   // unchanged, just apply other settings
  if (v && !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) { toast(t('tokenBad'), 3500); return; }
  saveToken(v, $('optRemember').checked);
  location.reload();
});
$('forgetBtn').addEventListener('click', () => { saveToken('', false); location.reload(); });

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touchNote').hidden = false;

renderMenu();
setPhase('menu');
setupMap().then(updateMapStatus);

// Expose for debugging in the console only.
window.skyroam = { viewer, get state() { return state; }, LIMITS };
