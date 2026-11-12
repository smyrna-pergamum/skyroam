// Menu UI: tabs, place picker + search, aircraft grid, hangar, settings and the first-run welcome.
import { t, setLang, getLang, applyI18n } from './i18n.js';
import { CONTINENTS, HISTORIC, NATURE, siteToPlace, cityToPlace } from './places.js';
import { AIRCRAFT, ALIASES, resolveAircraft, statsOf, DEFAULT_MODS, baseById } from './aircraft.js';
import { KEY_HELP } from './input.js';
import { readJSON, writeJSON, saveToken, looksLikeToken } from './storage.js';

const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const HANGAR_KEY = 'skyroam.hangar';
const WELCOME_KEY = 'skyroam.welcomed';

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const name = obj => (getLang() === 'tr' ? obj.tr : obj.en);

export function initMenu(ctx) {
  const { prefs, savePrefs, token } = ctx;
  prefs.pick = Object.assign({ cat: 'city', cont: 0, country: 0, city: 39, hist: 0, nat: 0, search: null }, prefs.pick || {});
  let customs = readJSON(HANGAR_KEY, []);
  // v4: the original fictional aircraft became real types; move saved choices across.
  if (prefs.aircraft?.startsWith('b:') && ALIASES[prefs.aircraft.slice(2)]) prefs.aircraft = `b:${ALIASES[prefs.aircraft.slice(2)]}`;
  customs.forEach(c => { if (ALIASES[c.base]) c.base = ALIASES[c.base]; });
  let searchResults = [];
  let editing = null; // hangar draft

  // ---------------------------------------------------------------- tabs
  function showTab(id) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    $$('.tab').forEach(s => { s.hidden = s.dataset.panel !== id; });
    prefs.tab = id; savePrefs();
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------------------------------------------------------------- places
  function fillSelect(sel, items, value) {
    sel.innerHTML = '';
    items.forEach((label, i) => sel.append(el('option', { value: String(i), textContent: label })));
    sel.value = String(Math.min(value, items.length - 1));
  }

  function renderPlacePickers() {
    const p = prefs.pick;
    const cont = CONTINENTS[p.cont] || CONTINENTS[0];
    fillSelect($('contSel'), CONTINENTS.map(name), p.cont);
    const countries = cont.countries;
    fillSelect($('countrySel'), countries.map(name), p.country);
    const country = countries[+$('countrySel').value];
    fillSelect($('citySel'), country.c.map(c => (getLang() === 'tr' ? c[0] : (c[3] || c[0]))), p.city);
    fillSelect($('histSel'), HISTORIC.map(r => (getLang() === 'tr' ? r[0] : r[1])), p.hist);
    fillSelect($('natSel'), NATURE.map(r => (getLang() === 'tr' ? r[0] : r[1])), p.nat);
    $$('input[name=placeCat]').forEach(r => { r.checked = r.value === p.cat; });
    $$('.picker').forEach(d => { d.hidden = d.dataset.pick !== p.cat; });
    renderSearchResults();
    if (p.coords) {
      $('coordLat').value = p.coords.lat;
      $('coordLon').value = p.coords.lon;
      $('coordHdg').value = p.coords.heading || '';
      $('coordAlt').value = p.coords.userAlt ?? '';
    }
  }

  function getPlace() {
    const p = prefs.pick;
    if (p.cat === 'historic') return siteToPlace(HISTORIC[p.hist] || HISTORIC[0], getLang(), 'historic');
    if (p.cat === 'nature') return siteToPlace(NATURE[p.nat] || NATURE[0], getLang(), 'nature');
    if (p.cat === 'search' && p.search) return p.search;
    if (p.cat === 'coords' && p.coords) return p.coords;
    const cont = CONTINENTS[p.cont] || CONTINENTS[0];
    const country = cont.countries[p.country] || cont.countries[0];
    return cityToPlace(country.c[p.city] || country.c[0], country, getLang());
  }

  function placeChanged() {
    savePrefs();
    $('chosenPlace').textContent = getPlace().name;
    ctx.onPlaceChange(getPlace());
  }

  $$('input[name=placeCat]').forEach(r => r.addEventListener('change', () => {
    prefs.pick.cat = r.value;
    $$('.picker').forEach(d => { d.hidden = d.dataset.pick !== r.value; });
    if (r.value === 'search') $('searchInput').focus();
    placeChanged();
  }));
  $('contSel').addEventListener('change', e => { Object.assign(prefs.pick, { cont: +e.target.value, country: 0, city: 0 }); renderPlacePickers(); placeChanged(); });
  $('countrySel').addEventListener('change', e => { Object.assign(prefs.pick, { country: +e.target.value, city: 0 }); renderPlacePickers(); placeChanged(); });
  $('citySel').addEventListener('change', e => { prefs.pick.city = +e.target.value; placeChanged(); });
  $('histSel').addEventListener('change', e => { prefs.pick.hist = +e.target.value; placeChanged(); });
  $('natSel').addEventListener('change', e => { prefs.pick.nat = +e.target.value; placeChanged(); });

  // ---- search (Open-Meteo geocoding: free, no key, CORS-enabled)
  function renderSearchResults(message) {
    const box = $('searchResults');
    box.innerHTML = '';
    if (message) { box.append(el('p', { className: 'hint', textContent: message })); return; }
    for (const r of searchResults) {
      const sub = [r.admin1, r.country].filter(Boolean).join(', ');
      const b = el('button', { type: 'button' }, r.name, ' ', el('small', { textContent: sub }));
      const selected = prefs.pick.search && prefs.pick.search.lat === r.latitude && prefs.pick.search.lon === r.longitude;
      b.setAttribute('aria-pressed', String(!!selected));
      b.addEventListener('click', () => {
        prefs.pick.search = {
          kind: 'search', name: sub ? `${r.name}, ${r.country || r.admin1}` : r.name,
          lat: r.latitude, lon: r.longitude, heading: 0, alt: (r.elevation || 0) + 450, back: 3000,
        };
        renderSearchResults();
        placeChanged();
      });
      box.append(b);
    }
  }

  async function doSearch() {
    const q = $('searchInput').value.trim();
    if (q.length < 2) return;
    renderSearchResults('…');
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${getLang()}&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      searchResults = data.results || [];
      renderSearchResults(searchResults.length ? undefined : t('searchNone'));
    } catch {
      searchResults = [];
      renderSearchResults(t('searchFail'));
    }
  }
  $('searchBtn').addEventListener('click', doSearch);
  $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  $('geoBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { ctx.toast(t('geoFail'), 3500); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      prefs.pick.search = {
        kind: 'search', name: t('geoHere'),
        lat: pos.coords.latitude, lon: pos.coords.longitude, heading: 0,
        alt: (pos.coords.altitude || 0) + 450, back: 1500,
      };
      searchResults = [];
      renderSearchResults();
      placeChanged();
    }, () => ctx.toast(t('geoFail'), 3500), { timeout: 10000, maximumAge: 600000 });
  });

  // ---- coordinates: decimal, DMS (41°00'29"N), or a pasted "lat, lon" pair
  function parseAngle(str) {
    const s = String(str).trim().toUpperCase().replace(/(\d),(\d)/g, '$1.$2');
    if (!s) return NaN;
    const nums = s.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length > 3) return NaN;
    const [d, m = 0, sec = 0] = nums.map(Number);
    if (m >= 60 || sec >= 60) return NaN;
    const v = d + m / 60 + sec / 3600;
    return /^-|[SWG]/.test(s) ? -v : v; // G = Güney (south) for Turkish users
  }

  function splitPair(str) {
    const s = str.trim();
    let parts = s.split(/\s*[;,]\s*(?=[-+\d])/);           // "41.0, 29.0" (keeps decimal commas like 41,0)
    if (parts.length !== 2) parts = s.split(/\s+(?=[-+]?\d)/); // "41°00'29"N 28°58'42"E"
    return parts.length === 2 ? parts : null;
  }

  $('coordLat').addEventListener('paste', e => {
    const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const pair = splitPair(txt);
    if (pair) { e.preventDefault(); $('coordLat').value = pair[0]; $('coordLon').value = pair[1]; }
  });

  function applyCoords() {
    let latS = $('coordLat').value, lonS = $('coordLon').value;
    if (!lonS.trim()) { const pair = splitPair(latS); if (pair) [latS, lonS] = pair; }
    const lat = parseAngle(latS), lon = parseAngle(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
      ctx.toast(t('coordBad'), 3500);
      return;
    }
    const hdgRaw = $('coordHdg').value.trim();
    const altRaw = $('coordAlt').value.trim();
    const heading = hdgRaw === '' ? 0 : ((Number(hdgRaw) % 360) + 360) % 360;
    const userAlt = altRaw === '' ? null : clampNum(Number(altRaw), 0, 15000);
    prefs.pick.coords = {
      kind: 'coords', name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat: +lat.toFixed(6), lon: +lon.toFixed(6), heading: Number.isFinite(heading) ? heading : 0,
      alt: userAlt ?? 450, userAlt, back: 0,
    };
    $('coordLat').value = prefs.pick.coords.lat;
    $('coordLon').value = prefs.pick.coords.lon;
    placeChanged();
    ctx.toast(t('coordSet'), 1500);
  }
  const clampNum = (v, a, b) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : null);
  $('coordGo').addEventListener('click', applyCoords);
  ['coordLat', 'coordLon', 'coordHdg', 'coordAlt'].forEach(id => $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyCoords(); }
  }));

  // ---------------------------------------------------------------- aircraft

  function resolveKey(key) {
    if (key && key.startsWith('c:')) {
      const c = customs.find(x => x.id === key.slice(2));
      if (c) return { ...resolveAircraft(baseById(c.base), c.mods, c.colors), custom: c };
    }
    const id = key && key.startsWith('b:') ? key.slice(2) : 'cessna-172';
    return resolveAircraft(baseById(id));
  }
  const getAircraft = () => resolveKey(prefs.aircraft);
  const aircraftName = ac => (ac.custom ? ac.custom.name : name(ac.base));

  function statBars(ph) {
    const s = statsOf(ph);
    const row = (label, v01, txt) => el('div', { className: 'stat' },
      el('span', { textContent: label }),
      el('span', { className: 'b' }, el('i', { style: `width:${Math.round(v01 * 100)}%` })),
      el('em', { textContent: txt }));
    return el('div', { className: 'stats' },
      row(t('statTop'), s.speed01, s.topKmh ? `${s.topKmh}` : t('noEngine')),
      row(t('statStall'), s.lift01, `${s.stallKmh}`),
      row(t('statAgility'), s.agility, `${Math.round(s.agility * 10)}/10`));
  }

  function card(key, ac, title, type) {
    const b = el('button', { type: 'button', className: 'ac-card' });
    b.setAttribute('aria-pressed', String(prefs.aircraft === key));
    const sw = c => el('span', { className: 'sw', style: `background:${c}` });
    b.append(
      el('span', { className: 'nm' }, sw(ac.colors.p), sw(ac.colors.s), title),
      el('span', { className: 'ty', textContent: type }),
      statBars(ac.phys),
    );
    b.addEventListener('click', () => {
      prefs.aircraft = key; savePrefs();
      closeHangar(false);
      renderAircraft();
      aircraftChanged();
    });
    return b;
  }

  function renderAircraft() {
    const grid = $('acGrid');
    grid.innerHTML = '';
    const cat = prefs.acCat || 'all';
    $$('input[name=acCat]').forEach(r => { r.checked = r.value === cat; });
    if (cat === 'mine') {
      $('acCount').textContent = '';
      if (!customs.length) grid.append(el('p', { className: 'empty', textContent: t('myEmpty') }));
      for (const c of customs) {
        const ac = resolveAircraft(baseById(c.base), c.mods, c.colors);
        grid.append(card(`c:${c.id}`, ac, c.name, `${t('myPlane')} · ${name(baseById(c.base))}`));
      }
      return;
    }
    const q = ($('acSearch').value || '').trim().toLocaleLowerCase();
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const base of AIRCRAFT) {
      if (cat !== 'all' && base.cat !== cat) continue;
      if (q) {
        const f = base.spec || {};
        const hay = `${base.en} ${f.maker || ''} ${f.country || ''} ${f.year || ''} ${base.typeTr} ${base.typeEn}`.toLocaleLowerCase();
        if (!q.split(/\s+/).every(w => hay.includes(w))) continue;
      }
      frag.append(card(`b:${base.id}`, resolveAircraft(base), name(base), getLang() === 'tr' ? base.typeTr : base.typeEn));
      n++;
    }
    grid.append(frag);
    $('acCount').textContent = t('acCount', { n });
  }
  $('acSearch').addEventListener('input', () => renderAircraft());
  $$('input[name=acCat]').forEach(r => r.addEventListener('change', () => { prefs.acCat = r.value; savePrefs(); renderAircraft(); }));

  function aircraftChanged() {
    const ac = getAircraft();
    $('chosenPlane').textContent = aircraftName(ac);
    ctx.onAircraftChange(ac);
  }

  // ---------------------------------------------------------------- hangar
  function openHangar() {
    const ac = getAircraft();
    editing = ac.custom
      ? { id: ac.custom.id, base: ac.custom.base, name: ac.custom.name, mods: { ...ac.custom.mods }, colors: { ...ac.custom.colors } }
      : { id: null, base: ac.base.id, name: `${name(ac.base)} Mk2`, mods: { ...DEFAULT_MODS }, colors: { ...ac.base.colors } };
    $('hangar').hidden = false;
    $('hgBase').textContent = name(baseById(editing.base));
    $('hgName').value = editing.name;
    $('hgPower').value = editing.mods.power;
    $('hgWing').value = editing.mods.wing;
    $('hgAgility').value = editing.mods.agility;
    $('hgColP').value = editing.colors.p;
    $('hgColS').value = editing.colors.s;
    $('hgColA').value = editing.colors.a;
    $('hgDelete').hidden = !editing.id;
    $('hgSave').hidden = !editing.id;
    updateHangarPreview();
    $('hangar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function readHangar() {
    editing.name = $('hgName').value.trim() || editing.name;
    editing.mods = { power: +$('hgPower').value, wing: +$('hgWing').value, agility: +$('hgAgility').value };
    editing.colors = { p: $('hgColP').value, s: $('hgColS').value, a: $('hgColA').value };
  }

  function updateHangarPreview() {
    readHangar();
    $('hgPowerOut').textContent = `${Math.round(editing.mods.power * 100)}%`;
    $('hgWingOut').textContent = `${Math.round(editing.mods.wing * 100)}%`;
    $('hgAgilityOut').textContent = `${Math.round(editing.mods.agility * 100)}%`;
    const ac = resolveAircraft(baseById(editing.base), editing.mods, editing.colors);
    const box = $('hgStats');
    box.innerHTML = '';
    box.append(statBars(ac.phys));
    ctx.onAircraftChange(ac); // live preview on the plane behind the menu
  }
  ['hgPower', 'hgWing', 'hgAgility', 'hgColP', 'hgColS', 'hgColA'].forEach(id => $(id).addEventListener('input', updateHangarPreview));

  function saveHangar(asNew) {
    readHangar();
    const rec = { id: editing.id && !asNew ? editing.id : Date.now().toString(36), base: editing.base, name: editing.name, mods: editing.mods, colors: editing.colors };
    customs = customs.filter(c => c.id !== rec.id).concat(rec);
    writeJSON(HANGAR_KEY, customs);
    prefs.aircraft = `c:${rec.id}`;
    prefs.acCat = 'mine';
    savePrefs();
    closeHangar(false);
    renderAircraft();
    aircraftChanged();
    ctx.toast(t('hangarSaved'));
  }

  function closeHangar(revert = true) {
    $('hangar').hidden = true;
    editing = null;
    if (revert) aircraftChanged();
  }

  $('hangarOpen').addEventListener('click', openHangar);
  $('hgSave').addEventListener('click', () => saveHangar(false));
  $('hgSaveNew').addEventListener('click', () => saveHangar(true));
  $('hgClose').addEventListener('click', () => closeHangar(true));
  $('hgDelete').addEventListener('click', () => {
    if (!editing?.id) return;
    customs = customs.filter(c => c.id !== editing.id);
    writeJSON(HANGAR_KEY, customs);
    prefs.aircraft = `b:${editing.base}`;
    savePrefs();
    closeHangar(false);
    renderAircraft();
    aircraftChanged();
    ctx.toast(t('hangarDeleted'));
  });

  // ---------------------------------------------------------------- settings
  $('tokenInput').addEventListener('focus', e => { if (e.target.value.startsWith('•')) e.target.value = ''; });
  $('saveTokenBtn').addEventListener('click', () => {
    const v = $('tokenInput').value.trim();
    if (v.startsWith('•')) { location.reload(); return; }
    if (v && !looksLikeToken(v)) { ctx.toast(t('tokenBad'), 3500); return; }
    saveToken(v, $('optRemember').checked);
    location.reload();
  });
  $('forgetBtn').addEventListener('click', () => { saveToken('', false); location.reload(); });
  $('optGoogle').addEventListener('change', e => { prefs.google3d = e.target.checked; savePrefs(); });
  $('optInvert').addEventListener('change', e => { prefs.invert = e.target.checked; savePrefs(); ctx.onOptions(); });
  $('optAssist').addEventListener('change', e => { prefs.assist = e.target.checked; savePrefs(); });
  $('optCalm').addEventListener('change', e => { prefs.calm = e.target.checked; savePrefs(); });
  $('optWarn').addEventListener('change', e => { prefs.warnings = e.target.checked; savePrefs(); });
  $$('input[name=mode]').forEach(r => r.addEventListener('change', () => { prefs.mode = r.value; savePrefs(); updateModeHint(); }));
  $('showWelcome').addEventListener('click', () => { $('welcome').hidden = false; });

  function updateModeHint() {
    $('modeHint').textContent = t(prefs.mode === 'rings' ? 'modeRingsHint' : 'modeFreeHint');
  }

  function renderKeys() {
    const tb = $('keysTable');
    tb.innerHTML = '';
    for (const [label, keys] of KEY_HELP) {
      const b = el('td');
      for (const k of keys) b.append(el('kbd', { textContent: k }));
      tb.append(el('tr', {}, el('td', { textContent: t(label) }), b));
    }
    tb.append(el('tr', {}, el('td', { colSpan: 2, textContent: t('kPad') })));
  }

  function updateMapStatus() {
    const map = { loading: ['statusLoading', ''], lite: ['statusLite', 'lite'], ion: ['statusIon', 'ion'], google: ['statusGoogle', 'ion'] };
    const [k, cls] = map[ctx.getMapMode()];
    $('mapStatus').textContent = t(k);
    $('mapStatus').className = `pill ${cls}`;
  }

  // ---------------------------------------------------------------- welcome (first run)
  $('welcomeSkip').addEventListener('click', () => {
    writeJSON(WELCOME_KEY, true);
    $('welcome').hidden = true;
  });
  $('welcomeSave').addEventListener('click', () => {
    const v = $('welcomeToken').value.trim();
    if (!looksLikeToken(v)) { ctx.toast(t('tokenBad'), 3500); return; }
    saveToken(v, $('welcomeRemember').checked);
    writeJSON(WELCOME_KEY, true);
    location.reload();
  });

  // ---------------------------------------------------------------- language + render
  $$('.langBtn').forEach(b => b.addEventListener('click', () => {
    setLang(getLang() === 'tr' ? 'en' : 'tr');
    prefs.lang = getLang(); savePrefs();
    render();
    placeChanged();
    aircraftChanged();
  }));

  $('startBtn').addEventListener('click', () => ctx.onStart());
  $('resumeBtn').addEventListener('click', () => ctx.onResume());

  function render() {
    applyI18n();
    $$('.langBtn').forEach(b => { b.textContent = getLang() === 'tr' ? 'EN' : 'TR'; });
    renderPlacePickers();
    renderAircraft();
    $$('input[name=mode]').forEach(r => { r.checked = r.value === (prefs.mode === 'rings' ? 'rings' : 'free'); });
    updateModeHint();
    $('optInvert').checked = !!prefs.invert;
    $('optAssist').checked = prefs.assist !== false;
    $('optCalm').checked = !!prefs.calm;
    $('optWarn').checked = prefs.warnings !== false;
    $('optGoogle').checked = !!prefs.google3d;
    $('tokenInput').value = token ? '••••••••' : '';
    $('chosenPlace').textContent = getPlace().name;
    $('chosenPlane').textContent = aircraftName(getAircraft());
    renderKeys();
    updateMapStatus();
    if (editing) openHangar();
  }

  render();
  showTab(prefs.tab || 'fly');
  if (!token && !readJSON(WELCOME_KEY, false)) $('welcome').hidden = false;

  return { render, getPlace, getAircraft, aircraftName, updateMapStatus, closeHangar };
}
