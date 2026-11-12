/* global Cesium */
import { t, setLang } from './i18n.js';
import { startFromPlace } from './places.js';
import { FIXED_DT, createFlight, stepFlight, snapshot, lerpSnap } from './flight.js';
import { Input } from './input.js';
import { PlaneModel } from './plane.js';
import { RingCourse } from './rings.js';
import { EngineSound } from './audio.js';
import { readJSON, writeJSON, getToken } from './storage.js';
import { initMenu } from './menu.js';
import { Cockpit } from './cockpit.js';
import { statsOf } from './aircraft.js';

const $ = id => document.getElementById(id);
const RING_COUNT = 12;
const PREFS_KEY = 'skyroam.prefs';
const BEST_KEY = 'skyroam.best';

const prefs = Object.assign(
  { lang: null, mode: 'free', invert: false, assist: true, google3d: false, muted: false, aircraft: 'b:serce', acCat: 'all', tab: 'fly' },
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
let place = null;
let courseStart = 0, courseTime = 0;
let lastFrame = performance.now();

// Menu preview: the selected aircraft hovering at the start point, camera orbiting it.
const preview = { start: null, h: 0, angle: 0.6, snap: {} };

function setPreviewPlace(p) {
  place = p;
  const st = startFromPlace(p);
  preview.start = st;
  preview.h = st.alt + (ac?.startBonusAlt || 0);
  terrainHeight(st.lat, st.lon).then(g => {
    if (g !== undefined && preview.start === st) preview.h = Math.max(preview.h, g + 300 + (ac?.startBonusAlt || 0));
  });
}

function setAircraft(resolved) {
  ac = resolved;
  plane.build(ac);
  plane.visible = phase !== 'menu' ? camMode === 'chase' : true;
  course.radius = Math.max(45, ac.span * 1.6);
  cockpit.configure(ac, statsOf(ac.phys).topKmh);
  $('throttleLever').classList.toggle('disabled', ac.phys.engine === 'none');
}

const menu = initMenu({
  prefs, savePrefs, token,
  getMapMode: () => mapMode,
  toast: (m, ms) => toast(m, ms),
  onPlaceChange: p => setPreviewPlace(p),
  onAircraftChange: a => setAircraft(a),
  onOptions: () => { input.invert = prefs.invert; },
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
  gameMode = prefs.mode === 'rings' ? 'rings' : 'free';
  const st = startFromPlace(place);
  st.alt += ac.startBonusAlt;

  state = createFlight(st, ac.phys);
  asyncGround = { h: undefined, busy: false, last: 0 };
  const g = await terrainHeight(st.lat, st.lon);
  if (g !== undefined) {
    state.h = Math.max(state.h, g + 300 + ac.startBonusAlt);
    state.ground = g;
  }
  snapshot(state, prevSnap); snapshot(state, curSnap);
  accumulator = 0;
  camPos = null; // hard cut, no camera slingshot after respawn
  input.clearEdges();

  course.clear();
  $('ringPanel').hidden = gameMode !== 'rings';
  if (gameMode === 'rings') {
    await course.build(state, RING_COUNT, mapMode !== 'lite');
    courseStart = performance.now();
    courseTime = 0;
    toast(t('ringGo'));
  }
  $('hPlace').textContent = `${place.name} · ${menu.aircraftName(ac)}`;
  setPhase('flying');
}

function setPhase(p) {
  phase = p;
  $('menu').hidden = !(p === 'menu' || p === 'paused');
  $('resumeBtn').hidden = p !== 'paused';
  $('result').hidden = !(p === 'crashed' || p === 'finished');
  $('hud').hidden = p === 'menu';
  plane.visible = p === 'menu' || camMode === 'chase';
  applyCamView();
  if (p === 'menu') { course.clear(); setPreviewPlace(menu.getPlace()); }
  lastFrame = performance.now();
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

function updateCamera(M, dt) {
  const cam = viewer.camera;
  resetCameraFrame(cam);
  const d = ac.cam.dist;
  if (camMode !== 'chase') {
    const [cx, cz] = ac.cam.cockpit;
    const eye = Cesium.Matrix4.multiplyByPoint(M, C3.fromElements(cx, 0, cz, tmp.off), tmp.a);
    const ahead = Cesium.Matrix4.multiplyByPoint(M, AHEAD, tmp.b);
    C3.normalize(C3.subtract(ahead, eye, tmp.dir), tmp.dir);
    C3.normalize(Cesium.Matrix4.multiplyByPointAsVector(M, BODY_UP, tmp.up), tmp.up);
    cam.setView({ destination: eye, orientation: { direction: tmp.dir, up: tmp.up } });
    return;
  }
  const desired = Cesium.Matrix4.multiplyByPoint(M, C3.fromElements(-d, 0, d * 0.25, tmp.off), tmp.a);
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

  if (phase === 'menu') { menuPreview(dt); sound.update(0, 0, false, 'prop'); return; }

  if (phase === 'crashed' || phase === 'finished') {
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
  if (steps === 24) accumulator = 0;

  lerpSnap(prevSnap, curSnap, Math.min(1, accumulator / FIXED_DT), drawSnap);
  const M = plane.update(drawSnap);
  updateCamera(M, dt);

  if (gameMode === 'rings' && phase === 'flying') courseTime = performance.now() - courseStart;
  updateHud(state, drawSnap);
  updateLever();
  if (camMode === 'cockpit') {
    const view = Object.assign({}, state, drawSnap);
    cockpit.draw(view, input.axes, dt, gameMode === 'rings' && course.active ? course.navInfo(state) : null);
  }
  sound.update(state.throttle, state.speed, phase === 'flying', ac.phys.engine);

  if (state.crashed && phase === 'flying') onCrash();
});

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touchNote').hidden = false;

setPhase('menu');
setupMap().then(() => { menu.updateMapStatus(); setPreviewPlace(menu.getPlace()); });

window.skyroam = { viewer, get state() { return state; }, get aircraft() { return ac; } };
