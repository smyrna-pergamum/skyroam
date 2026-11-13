// SkyRoam website: an evening flight from Istanbul to Pergamon, driven by scroll.
// The map is live CesiumJS (Esri imagery by day, NASA Black Marble city lights by night),
// the aircraft are the game's own generated models, and the sun really sets as you scroll.
import { resolveAircraft, baseById } from '../js/aircraft.js';
import { PlaneModel } from '../js/plane.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- words
const TR = {
  skip: 'Havalanmaya geç', gateHead: 'Bütün dünya bir pist.', gateLoading: 'Kanatlarının altındaki gezegen yükleniyor.',
  gateReady: 'Hazır. Hava kararmak üzere.', enter: 'Göğe gir', enterQuiet: 'Sessiz gir', gateNote: 'Sesle girersin. İstediğin an kapatabilirsin.',
  play: 'Hemen oyna',
  w1: 'İstanbul, Boğaz', h1: 'Kendi sokağından havalan.', l1: 'SkyRoam, bütün gezegenin gerçek haritası üzerinde ücretsiz bir uçuş oyunu. Tarayıcında çalışır.',
  w2: 'Marmara Denizi üzerinde', h2: 'Kanatların yüzyılı.', l2: 'Yüzü aşkın gerçek uçak, her biri gerçek boyutu ve hızıyla kuruldu. Kaydırmaya devam et, değişmelerini izle.',
  w3: 'Çanakkale Boğazı, gün batarken', h3: 'Öne otur.', l3: 'Yolcu uçaklarında cam ekranlar, Cessna’da yuvarlak göstergeler ve sana “pull up” diyen bir ses.',
  w4: 'Truva, ışıklar yanarken', h4: 'İki başparmakla uç.', l4: 'Telefon, klavye ya da oyun kolu. Kurulum yok, hesap yok, reklam yok.',
  w5: 'Bergama, karanlık çökünce', h5: 'Nereden havalanacaksın?',
  townLabel: 'Havalanacağın kasaba ya da şehir', townPh: 'Herhangi bir yer yaz', takeoff: 'Havalan',
  l5: 'Lite modda harita ücretsiz ve düzdür. Dağlar ve binalar için kendi ücretsiz Cesium ion anahtarını ekle; anahtar tarayıcından çıkmaz.',
  openGame: 'Oyunu aç', source: 'Kaynak kod',
  soundOn: 'Ses açık', soundOff: 'Ses kapalı', motion: 'Hareketi azalt', clear: 'Sade görünüm', hint: 'Uçmak için kaydır',
  c1: 'Kalkış', c2: 'Uçaklar', c3: 'Kokpit', c4: 'Kontroller', c5: 'Senin yerin',
  searching: 'Aranıyor…', none: 'Bu adla bir yer bulamadım. Başka bir yazımla dene.', failed: 'Arama şu an çalışmıyor. Oyunu açıp menüden seçebilirsin.',
  pick: 'Hangisi?', empty: 'Önce bir yer adı yaz.',
};
const EN = {};
document.querySelectorAll('[data-i18n]').forEach(el => { EN[el.dataset.i18n] = el.textContent; });
document.querySelectorAll('[data-i18n-ph]').forEach(el => { EN[el.dataset.i18nPh] = el.placeholder; });
Object.assign(EN, {
  gateReady: 'Ready. The sun is about to set.', soundOn: 'Sound on',
  c1: 'Take off', c2: 'Aircraft', c3: 'Cockpit', c4: 'Controls', c5: 'Your place',
  searching: 'Searching…', none: 'No place by that name. Try another spelling.', failed: 'Search is not answering right now. Open the game and pick a place from the menu.',
  pick: 'Which one?', empty: 'Type a place name first.',
});
const LANG_KEY = 'skyroam.site.lang';
let lang = (() => {
  try { const s = localStorage.getItem(LANG_KEY); if (s === 'tr' || s === 'en') return s; } catch { /* storage off */ }
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
})();
const t = k => (lang === 'tr' ? TR : EN)[k] ?? EN[k] ?? k;
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('langBtn').textContent = lang === 'tr' ? 'EN' : 'TR';
  $('langBtn').setAttribute('aria-label', lang === 'tr' ? 'English' : 'Türkçe');
  if (ready) $('gateLine').textContent = t('gateReady');
  $('soundBtn').textContent = t(soundOn ? 'soundOn' : 'soundOff');
  $('chName').textContent = t(`c${chapter + 1}`);
}
$('langBtn').addEventListener('click', () => {
  lang = lang === 'tr' ? 'en' : 'tr';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage off */ }
  applyLang();
});

// ---------------------------------------------------------------- the route: Istanbul to Pergamon
// lat, lon, altitude (m). Flies south-west, into the December sunset.
const ROUTE = [
  [41.175, 29.085, 700], [41.085, 29.045, 800], [41.005, 28.985, 1000], [40.86, 28.62, 1500],
  [40.66, 27.95, 2100], [40.43, 27.10, 2300], [40.20, 26.48, 1700], [40.02, 26.30, 1300],
  [39.86, 26.20, 1200], [39.55, 26.45, 1300], [39.30, 26.75, 1100], [39.17, 27.05, 800], [39.133, 27.184, 650],
];
// Each chapter's share of the route (0..1), so places line up with words.
const CH_ROUTE = [0, 0.16, 0.5, 0.7, 0.86, 1];
// Time of day: golden hour over Istanbul, after dark over Pergamon (21 December, UTC).
const T0 = '2026-12-21T12:55:00Z', T1 = '2026-12-21T15:05:00Z';
// Aircraft per chapter; chapter 2 runs through the century.
const CENTURY = ['wright-flyer', 'bleriot-xi', 'sopwith-camel', 'spirit-st-louis', 'dc-3', 'spitfire-ix', 'constellation', 'b707-320b', 'concorde', 'b747-400', 'a380-800', 'hurjet'];
const CH_PLANE = ['a320neo', null, 'b777-300er', 'cessna-172', 'hurjet'];

// Catmull-Rom through the waypoints, then an arc-length table so speed is even.
function crPoint(i, f) {
  const P = k => ROUTE[clamp(k, 0, ROUTE.length - 1)];
  const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
  const f2 = f * f, f3 = f2 * f;
  return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3));
}
const SAMPLES = [];
{
  const N = 1600;
  let len = 0, prev = null;
  for (let s = 0; s <= N; s++) {
    const g = (s / N) * (ROUTE.length - 1);
    const i = Math.min(ROUTE.length - 2, Math.floor(g));
    const p = crPoint(i, g - i);
    if (prev) {
      const dy = (p[0] - prev[0]) * 111320, dx = (p[1] - prev[1]) * 111320 * Math.cos(p[0] * D2R);
      len += Math.hypot(dx, dy);
    }
    SAMPLES.push({ p, len });
    prev = p;
  }
  SAMPLES.forEach(s => { s.u = s.len / len; });
}
function at(u) {
  u = clamp(u, 0, 1);
  let lo = 0, hi = SAMPLES.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SAMPLES[m].u < u) lo = m; else hi = m; }
  const a = SAMPLES[lo], b = SAMPLES[hi], f = (u - a.u) / Math.max(1e-9, b.u - a.u);
  return [0, 1, 2].map(k => lerp(a.p[k], b.p[k], f));
}
function headingAt(u) {
  const a = at(u - 0.0015), b = at(u + 0.0015);
  return Math.atan2((b[1] - a[1]) * Math.cos(a[0] * D2R), b[0] - a[0]); // compass, radians, 0 = north
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- page state
let ready = false, soundOn = false, chapter = 0;
let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let progress = 0, shown = 0; // scroll progress and the eased value the camera follows

function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
}
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', readScroll);

const sections = [...document.querySelectorAll('.chapter')];
function chapterUi() {
  // fade each chapter's words in and out as its stretch passes
  const vh = innerHeight;
  sections.forEach((s, i) => {
    const r = s.getBoundingClientRect();
    const enter = clamp((vh - r.top) / (vh * 0.5), 0, 1);
    const leave = i === sections.length - 1 ? 1 : clamp((r.bottom - vh * 0.55) / (vh * 0.45), 0, 1);
    const off = r.top >= vh || r.bottom <= 0; // out of view: leave it at rest, fully visible
    s.querySelector('.chapter__text').style.setProperty('--o', off ? '1' : (Math.min(enter, leave)).toFixed(3));
    if (r.top < vh * 0.5 && r.bottom > vh * 0.5) chapter = i;
  });
  $('chN').textContent = sections[chapter].dataset.n;
  $('chName').textContent = t(`c${chapter + 1}`);
  [...$('dots').children].forEach((d, i) => d.classList.toggle('is-on', i <= chapter));
  $('hint').style.opacity = progress > 0.97 ? '0' : '1';
}
// route position for a page progress: chapters map onto their stretch of the route
function routeU(p) {
  const n = sections.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const h = sections[i].offsetHeight;
    const total = sections.reduce((a, s) => a + s.offsetHeight, 0);
    const a = acc / total, b = (acc + h) / total;
    if (p <= b || i === n - 1) {
      const f = clamp((p - a) / Math.max(1e-6, b - a), 0, 1);
      return { u: lerp(CH_ROUTE[i], CH_ROUTE[i + 1], f), ch: i, f };
    }
    acc += h;
  }
  return { u: 1, ch: n - 1, f: 1 };
}

// ---------------------------------------------------------------- buttons
$('motionBtn').setAttribute('aria-pressed', String(reduce));
$('motionBtn').addEventListener('click', () => { reduce = !reduce; $('motionBtn').setAttribute('aria-pressed', String(reduce)); });
$('clearBtn').addEventListener('click', () => {
  const on = document.body.classList.toggle('clear');
  $('clearBtn').setAttribute('aria-pressed', String(on));
});
$('soundBtn').addEventListener('click', () => setSound(!soundOn));

// ---------------------------------------------------------------- sound: the game's own recordings
const audio = { ctx: null, loops: {} };
async function startAudio() {
  if (audio.ctx) { audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = audio.ctx = new AC();
  audio.master = ctx.createGain(); audio.master.gain.value = 0; audio.master.connect(ctx.destination);
  const load = async (k, url, a, b) => {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = a; src.loopEnd = Math.min(b, buf.duration);
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(audio.master); src.start(0, a);
      audio.loops[k] = { src, g };
    } catch { /* silent is fine */ }
  };
  await Promise.all([load('prop', 'sounds/prop.mp3', 0.5, 22.3), load('jet', 'sounds/jet.mp3', 1, 9.5), load('wind', 'sounds/wind.mp3', 0.3, 4.7)]);
}
function setSound(on) {
  soundOn = on;
  $('soundBtn').setAttribute('aria-pressed', String(on));
  $('soundBtn').textContent = t(on ? 'soundOn' : 'soundOff');
  if (on) startAudio();
  if (audio.ctx) audio.master.gain.setTargetAtTime(on ? 0.55 : 0, audio.ctx.currentTime, 0.4);
}
let lastP = 0, rush = 0;
function updateAudio(dt, engine) {
  if (!audio.ctx || !soundOn) return;
  const v = Math.abs(shown - lastP) / Math.max(dt, 1e-3); lastP = shown;
  rush = lerp(rush, clamp(v * 18, 0, 1), 1 - Math.exp(-dt * 3));
  const t0 = audio.ctx.currentTime, L = audio.loops;
  const jet = engine === 'jet';
  L.prop?.g.gain.setTargetAtTime(jet ? 0 : 0.35 + rush * 0.4, t0, 0.3);
  L.prop?.src.playbackRate.setTargetAtTime(0.85 + rush * 0.35, t0, 0.3);
  L.jet?.g.gain.setTargetAtTime(jet ? 0.22 + rush * 0.35 : 0, t0, 0.5);
  L.jet?.src.playbackRate.setTargetAtTime(0.85 + rush * 0.25, t0, 0.5);
  L.wind?.g.gain.setTargetAtTime(0.12 + rush * 0.5, t0, 0.3);
}
document.addEventListener('visibilitychange', () => { if (audio.ctx) document.hidden ? audio.ctx.suspend() : audio.ctx.resume(); });

// ---------------------------------------------------------------- the gate
function enter(withSound) {
  $('gate').classList.add('is-gone');
  document.documentElement.classList.remove('gated');
  if (withSound) setSound(true);
  $('main').focus?.();
}
$('enterSound').addEventListener('click', () => enter(true));
$('enterQuiet').addEventListener('click', () => enter(false));
function setReady() {
  if (ready) return;
  ready = true;
  $('pct').textContent = '100';
  $('pctBar').style.transform = 'scaleX(1)';
  $('gateLine').textContent = t('gateReady');
  $('gate').classList.add('is-ready');
  $('enterSound').focus({ preventScroll: true });
}
// The gate is skipped when someone arrives deep-linked to a chapter.
if (location.hash && location.hash !== '#') { $('gate').classList.add('is-gone'); }

// ---------------------------------------------------------------- town search (same as the game's menu)
const form = $('takeoff'), input = $('town'), msg = $('takeoffMsg'), list = $('townList'), go = $('takeoffBtn');
function playUrl(r) {
  const q = new URLSearchParams({
    fly: '1', lang, lat: r.latitude.toFixed(5), lon: r.longitude.toFixed(5),
    name: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : r.country].filter(Boolean).join(', '),
    alt: String(Math.round((r.elevation || 0) + 450)),
  });
  if (lastCentury) q.set('ac', lastCentury);
  return `play.html?${q}`;
}
const say = (text, err = false) => { msg.textContent = text; msg.classList.toggle('is-error', err); };
form.addEventListener('submit', async e => {
  e.preventDefault();
  const name = input.value.trim();
  list.hidden = true; list.replaceChildren();
  if (!name) { say(t('empty'), true); input.focus(); return; }
  say(t('searching')); go.setAttribute('aria-busy', 'true'); go.disabled = true;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${lang}&format=json`);
    if (!r.ok) throw new Error(r.status);
    const res = (await r.json()).results || [];
    if (!res.length) { say(t('none'), true); return; }
    if (res.length === 1) { location.href = playUrl(res[0]); return; }
    say(t('pick'));
    for (const p of res) {
      const a = document.createElement('a'); a.href = playUrl(p); a.append(p.name);
      const sub = [p.admin1, p.country].filter(Boolean).join(', ');
      if (sub) { const s = document.createElement('small'); s.textContent = sub; a.append(s); }
      const li = document.createElement('li'); li.append(a); list.append(li);
    }
    list.hidden = false; list.querySelector('a')?.focus();
  } catch { say(t('failed'), true); }
  finally { go.removeAttribute('aria-busy'); go.disabled = false; }
});

// ---------------------------------------------------------------- the world
let lastCentury = null;
function boot() {
  const C = window.Cesium;
  if (!C) throw new Error('no cesium');
  const viewer = new C.Viewer('world', {
    baseLayer: false, animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
    shouldAnimate: false, creditContainer: $('credits'), msaaSamples: 4,
  });
  document.documentElement.classList.add('gl');
  window.skyroamSite = { viewer };
  const scene = viewer.scene, globe = scene.globe;
  viewer.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  scene.screenSpaceCameraController.enableInputs = false; // the page scrolls; the camera follows the flight
  const day = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 17, credit: new C.Credit('Imagery © Esri, Maxar, Earthstar Geographics'),
  }));
  const night = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    maximumLevel: 8, credit: new C.Credit('City lights: NASA Black Marble'),
  }));
  night.alpha = 0; night.brightness = 1.15; night.contrast = 1.1; night.saturation = 0.8;
  // The real low winter sun would leave the ground almost black, so the dusk is graded by hand:
  // the imagery dims and warms as you fly, then the city lights come up.
  globe.enableLighting = false;
  globe.showGroundAtmosphere = true;
  globe.dynamicAtmosphereLighting = false;
  globe.maximumScreenSpaceError = 1.6;
  globe.baseColor = C.Color.fromCssColorString('#0a1020');
  scene.highDynamicRange = false;
  scene.fog.enabled = true; scene.fog.density = 0.00018; scene.fog.minimumBrightness = 0.02;
  scene.skyAtmosphere.atmosphereLightIntensity = 22;
  scene.skyAtmosphere.perFragmentAtmosphere = true;
  scene.sun.glowFactor = 1.3;
  const bloom = scene.postProcessStages.bloom;
  bloom.enabled = false;
  bloom.uniforms.contrast = 119; bloom.uniforms.brightness = -0.3; bloom.uniforms.glowOnly = false;
  bloom.uniforms.delta = 1.0; bloom.uniforms.sigma = 3.0; bloom.uniforms.stepSize = 1.0;

  const T0j = C.JulianDate.fromIso8601(T0), T1j = C.JulianDate.fromIso8601(T1);
  const span = C.JulianDate.secondsDifference(T1j, T0j);

  // the golden trail along the whole route
  const trail = [];
  for (let i = 0; i <= 600; i++) { const p = at(i / 600); trail.push(C.Cartesian3.fromDegrees(p[1], p[0], p[2] - 6)); }
  viewer.entities.add({ polyline: { positions: trail, width: 9, arcType: C.ArcType.NONE,
    material: new C.PolylineGlowMaterialProperty({ glowPower: 0.22, taperPower: 1, color: C.Color.fromCssColorString('#ffbe5c').withAlpha(0.95) }) } });

  // the aircraft: the game's own models
  const plane = new PlaneModel(scene);
  let planeId = null, ac = null;
  function usePlane(id) {
    if (id === planeId) return;
    planeId = id;
    ac = resolveAircraft(baseById(id));
    plane.build(ac);
    plane.gear = 0; plane.visible = true;
    lastCentury = id; // the launch link takes the aircraft on screen
    if (CENTURY.includes(id)) { const f = baseById(id).spec || {}; $('planeName').textContent = `${f.name}, ${f.year}`; }
  }
  usePlane(CH_PLANE[0]);

  // loading figure for the gate: counts up while tiles arrive, 100 once the view is complete
  const bootAt = performance.now();
  let loadedFrames = 0;
  function gateProgress() {
    if (ready) return;
    const el = (performance.now() - bootAt) / 1000;
    loadedFrames = globe.tilesLoaded ? loadedFrames + 1 : 0;
    const est = loadedFrames > 20 && el > 1.5 ? 100 : Math.min(94, Math.round(94 * (1 - Math.exp(-el / 2.2))));
    if (est > +$('pct').textContent) { $('pct').textContent = String(est); $('pctBar').style.transform = `scaleX(${est / 100})`; }
    if (est === 100) setTimeout(setReady, 350);
  }
  setTimeout(setReady, 14000); // never keep anyone at the door

  // camera state (smoothed)
  const cam = { heading: headingAt(0), roll: 0, nose: 0 };
  const hpr = new C.HeadingPitchRoll();
  let prev = performance.now();
  readScroll(); shown = progress;

  scene.preUpdate.addEventListener(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    shown = reduce ? progress : lerp(shown, progress, 1 - Math.exp(-dt * 3.2));
    if (Math.abs(shown - progress) < 1e-5) shown = progress;
    const { u, ch, f } = routeU(shown);

    // aircraft for this stretch
    if (ch === 1) usePlane(CENTURY[Math.min(CENTURY.length - 1, Math.floor(f * CENTURY.length))]);
    else usePlane(CH_PLANE[ch]);

    // time of day follows the flight
    C.JulianDate.addSeconds(T0j, span * smooth(u), viewer.clock.currentTime);
    const dusk = smooth(clamp((u - 0.2) / 0.6, 0, 1));
    day.brightness = lerp(1.0, 0.16, dusk);
    day.saturation = lerp(1.1, 0.55, dusk);
    day.gamma = lerp(1.0, 1.25, dusk);
    day.hue = lerp(0, 0.03, dusk);
    night.alpha = 0.55 * smooth(clamp((u - 0.55) / 0.35, 0, 1));
    document.documentElement.style.setProperty('--sun', (Math.sin(Math.PI * clamp(u * 1.25 + 0.15, 0, 1))).toFixed(3));
    document.documentElement.style.setProperty('--night', dusk.toFixed(3));

    // pose along the route; bank into the turns
    const p = at(u), hd = headingAt(u), hdAhead = headingAt(u + 0.01);
    const turn = wrap(hdAhead - hd);
    const targetRoll = reduce ? 0 : clamp(turn * 5, -0.38, 0.38);
    cam.roll = lerp(cam.roll, targetRoll, 1 - Math.exp(-dt * 2));
    const pa = at(u + 0.002), climb = Math.atan2(pa[2] - p[2], 0.002 * SAMPLES[SAMPLES.length - 1].len);
    const bob = reduce ? 0 : Math.sin(now / 1400) * 0.6;
    const s = { lat: p[0] * D2R, lon: p[1] * D2R, h: p[2] + bob, heading: hd, pitch: climb * 0.7, roll: cam.roll };
    plane.update(s);

    // chase camera; in the cockpit chapter it slides in to the nose
    const noseT = ch === 2 ? smooth(clamp(Math.min(f / 0.25, (1 - f) / 0.2), 0, 1)) : 0;
    cam.nose = lerp(cam.nose, noseT, 1 - Math.exp(-dt * 4));
    plane.visible = cam.nose < 0.4;
    cam.heading = cam.heading + wrap(hd - cam.heading) * (1 - Math.exp(-dt * 2.4));
    const sp = (ac.span || 20);
    const back = lerp(sp * 1.9 + 16, -(ac.base?.spec?.len || sp * 0.8) * 0.45, cam.nose);
    const endT = ch === 4 ? smooth(clamp(f * 1.6, 0, 1)) : 0; // last chapter: the plane drops low in the frame, under the words
    const up = lerp(sp * 0.38 + 4, 1.2, cam.nose) + endT * sp * 0.32;
    const side = lerp(Math.sin(now / 5200) * sp * (reduce ? 0 : 0.25) * (1 - endT * 0.8), 0, cam.nose);
    const ch_ = Math.cos(cam.heading), sh_ = Math.sin(cam.heading);
    const dN = -ch_ * back - sh_ * side, dE = -sh_ * back + ch_ * side;
    const lat = p[0] + dN / 111320, lon = p[1] + dE / (111320 * Math.cos(p[0] * D2R));
    hpr.heading = cam.heading;
    hpr.pitch = lerp(lerp(-0.13, -0.03, endT), -0.05, cam.nose);
    hpr.roll = cam.roll * lerp(0.3, 0.55, cam.nose);
    scene.camera.setView({ destination: C.Cartesian3.fromDegrees(lon, lat, p[2] + bob + up), orientation: hpr });

    updateAudio(dt, ac.phys?.engine);
    chapterUi();
    gateProgress();
  });
}

applyLang();
readScroll();
chapterUi();
try {
  boot();
} catch (e) {
  // No WebGL (or the map library didn't load): the words and the screenshot still tell the story.
  console.warn('World could not start', e);
  setReady();
}
