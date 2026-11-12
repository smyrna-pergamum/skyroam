// SkyRoam website: town search that launches the game, the aircraft scrubber, sound samples, TR/EN.
// The aircraft list comes from the game's own data file, so the site and the game never disagree.
import { FLEET } from '../js/fleet.js';

const $ = id => document.getElementById(id);
const LANG_KEY = 'skyroam.site.lang';

// ---------------------------------------------------------------- language
const TR = {
  skip: 'İçeriğe geç', navAircraft: 'Uçaklar', navCockpit: 'Kokpit', navPhone: 'Telefon', navMap: 'Harita', navPlay: 'Oyna',
  heroHead: 'Kendi sokağından havalan.',
  heroLead: 'Gerçek harita üzerinde ücretsiz bir uçuş oyunu, doğrudan tarayıcında.',
  townLabel: 'Havalanacağın kasaba ya da şehir', townPh: 'Bir yer yaz, örneğin Bergama', takeoff: 'Havalan',
  heroCaption: 'Yukarıda: İstanbul Boğazı, bir Airbus A320neo ile. Oyundan gerçek bir ekran görüntüsü.',
  fleetHead: 'Yüz uçak, 1903’ten bugüne.',
  fleetLead: 'Her biri gerçek boyutu ve hızıyla kuruldu, her biri kendisi gibi uçar.',
  span: 'Kanat açıklığı', top: 'Azami hız', flyIt: 'Bununla uç', scrubLabel: 'Yıla göre uçaklar',
  catAll: 'Tümü', catHistoric: 'Tarihi', catCommercial: 'Yolcu', catCivil: 'Hafif ve iş jeti', catMilitary: 'Askeri',
  cockpitHead: 'Öne otur.',
  cockpitLead: 'Kokpit için C’ye bas: yolcu uçaklarında cam ekranlar, Cessna’da yuvarlak göstergeler ve seninle dönen bir harita.',
  cockpitCaption: 'Dubai üzerinde Boeing 777-300ER.',
  listenHead: 'Sesi aç.',
  listenLead: 'Gerçek motor kayıtları; bir şeyi yanlış yaptığında kokpit de seni uyarır.',
  sProp: 'Pervane', sPropWhat: 'Seyirde pistonlu motor', sJet: 'Jet', sJetWhat: 'Turbofanlar devirleniyor',
  sGear: 'İniş takımı', sGearWhat: '180 metrenin altında kendiliğinden', sPull: 'Pull up', sPullWhat: 'Yer çok hızlı yaklaşınca',
  phoneHead: 'İki başparmakla uç.',
  phoneLead: 'Telefonda sol başparmak yönlendirir, sağdaki gaz, dümen, iniş takımı ve kamerayı yönetir. Masada klavye ya da oyun kolu kullan.',
  phoneCaption: 'Bergama üzerinde Cessna 172, telefonda.',
  mapHead: 'Senin haritan, senin anahtarın.',
  liteName: 'Lite', liteText: 'Hemen açılır. Tüm gezegenin uydu fotoğrafları, düz zemin üzerinde.',
  fullName: '3D', fullText: 'Dağlar, vadiler ve binalar için kendi ücretsiz Cesium ion anahtarını ekle. Anahtar tarayıcında kalır.',
  privName: 'Başka bir şey yok', privText: 'Hesap yok, reklam yok, analiz yok. Kod GitHub’da açık.',
  lastHead: 'Nereden havalanacaksın?', lastBtn: 'Bir yer seç',
  footPlay: 'Oyna', footCode: 'Kaynak kod',
  credits: 'Harita: CesiumJS, Esri uydu görüntüleri ve OpenStreetMap. Yer arama: Open-Meteo. Sesler: Pixabay. Ekran görüntüleri oyundan.',
  // script-only strings
  searching: 'Aranıyor…', none: 'Bu adla bir yer bulamadım. Başka bir yazımla dene.', failed: 'Arama şu an çalışmıyor. Oyunu açıp menüden seçebilirsin.',
  pick: 'Hangisi?', empty: 'Önce bir yer adı yaz.', prev: 'Önceki uçak', next: 'Sonraki uçak',
};
const EN = {};
document.querySelectorAll('[data-i18n]').forEach(el => { EN[el.dataset.i18n] = el.textContent; });
document.querySelectorAll('[data-i18n-ph]').forEach(el => { EN[el.dataset.i18nPh] = el.placeholder; });
Object.assign(EN, {
  searching: 'Searching…', none: 'No place by that name. Try another spelling.', failed: 'Search is not answering right now. Open the game and pick a place from the menu.',
  pick: 'Which one?', empty: 'Type a place name first.', prev: 'Previous aircraft', next: 'Next aircraft',
});

let lang = (() => {
  try { const s = localStorage.getItem(LANG_KEY); if (s === 'tr' || s === 'en') return s; } catch { /* storage off */ }
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
})();
const t = k => (lang === 'tr' ? TR : EN)[k] ?? EN[k] ?? k;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  const b = $('langBtn');
  b.textContent = lang === 'tr' ? 'EN' : 'TR';
  b.setAttribute('aria-label', lang === 'tr' ? 'English' : 'Türkçe');
  $('acPrev').setAttribute('aria-label', t('prev'));
  $('acNext').setAttribute('aria-label', t('next'));
  showAircraft();
}
$('langBtn').addEventListener('click', () => {
  lang = lang === 'tr' ? 'en' : 'tr';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage off */ }
  applyLang();
});

// ---------------------------------------------------------------- take off from a town
// Same place search the game's menu uses (Open-Meteo geocoding, no key, no account).
const form = $('takeoff'), input = $('town'), msg = $('takeoffMsg'), list = $('townList'), go = $('takeoffBtn');
let selectedAc = null;

function playUrl(r) {
  const q = new URLSearchParams({
    fly: '1', lang,
    lat: r.latitude.toFixed(5), lon: r.longitude.toFixed(5),
    name: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : r.country].filter(Boolean).join(', '),
    alt: String(Math.round((r.elevation || 0) + 450)),
  });
  if (selectedAc) q.set('ac', selectedAc);
  return `play.html?${q}`;
}

function say(text, error = false) { msg.textContent = text; msg.classList.toggle('is-error', error); }

form.addEventListener('submit', async e => {
  e.preventDefault();
  const name = input.value.trim();
  list.hidden = true; list.replaceChildren();
  if (!name) { say(t('empty'), true); input.focus(); return; }
  say(t('searching'));
  go.setAttribute('aria-busy', 'true'); go.disabled = true;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${lang}&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const res = (await r.json()).results || [];
    if (!res.length) { say(t('none'), true); return; }
    if (res.length === 1) { location.href = playUrl(res[0]); return; }
    say(t('pick'));
    for (const p of res) {
      const a = document.createElement('a');
      a.href = playUrl(p);
      a.append(p.name);
      const sub = [p.admin1, p.country].filter(Boolean).join(', ');
      if (sub) { const s = document.createElement('small'); s.textContent = sub; a.append(s); }
      const li = document.createElement('li'); li.append(a); list.append(li);
    }
    list.hidden = false;
    list.querySelector('a')?.focus();
  } catch {
    say(t('failed'), true);
  } finally {
    go.removeAttribute('aria-busy'); go.disabled = false;
  }
});
$('backToTown').addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); input.focus({ preventScroll: true }); });

// ---------------------------------------------------------------- aircraft scrubber
const ALL = [...FLEET].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
const MAX_SPAN = Math.max(...ALL.map(f => f.span));
let cat = 'all', shown = ALL, idx = 0;
const range = $('acRange');

function showAircraft() {
  const f = shown[idx];
  if (!f) return;
  $('acYear').textContent = f.year;
  $('acName').textContent = f.name;
  $('acMeta').textContent = `${f.maker}, ${f.country}. ${f.role?.[lang] || f.role?.en || ''}`;
  const n = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { maximumFractionDigits: 1 });
  $('acSpan').textContent = `${n.format(f.span)} m`;
  $('acTop').textContent = `${n.format(f.vmax)} km/h`;
  $('acBar').style.transform = `scaleX(${(f.span / MAX_SPAN).toFixed(3)})`;
  const fly = $('acFly');
  fly.href = `play.html?ac=${encodeURIComponent(f.id)}&lang=${lang}`;
  range.setAttribute('aria-valuetext', `${f.year}, ${f.name}`);
}
// once you browse the aircraft, the town search takes off in the one you stopped on
function setIdx(i) { idx = Math.max(0, Math.min(shown.length - 1, i)); range.value = idx; showAircraft(); selectedAc = shown[idx]?.id || null; }

range.addEventListener('input', () => setIdx(+range.value));
$('acPrev').addEventListener('click', () => setIdx(idx - 1));
$('acNext').addEventListener('click', () => setIdx(idx + 1));
document.querySelectorAll('#acCats button').forEach(b => b.addEventListener('click', () => {
  cat = b.dataset.cat;
  document.querySelectorAll('#acCats button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  shown = cat === 'all' ? ALL : ALL.filter(f => f.cat === cat);
  range.max = shown.length - 1;
  setIdx(0);
}));
$('fleetScrub').hidden = false;
$('acCats').hidden = false;
range.max = ALL.length - 1;

// ---------------------------------------------------------------- sounds
let playing = null; // { btn, audio }
function stopSound() {
  if (!playing) return;
  playing.audio?.pause();
  if (playing.speech) try { speechSynthesis.cancel(); } catch { /* ignore */ }
  playing.btn.setAttribute('aria-pressed', 'false');
  playing = null;
}
document.querySelectorAll('.sound').forEach(btn => {
  if (btn.dataset.say && !('speechSynthesis' in window)) btn.disabled = true;
  btn.addEventListener('click', () => {
    const same = playing?.btn === btn;
    stopSound();
    if (same) return;
    btn.setAttribute('aria-pressed', 'true');
    if (btn.dataset.say) {
      const u = new SpeechSynthesisUtterance(btn.dataset.say);
      u.lang = 'en-US'; u.rate = 1.1; u.pitch = 0.75;
      u.onend = () => { if (playing?.btn === btn) stopSound(); };
      playing = { btn, speech: true };
      speechSynthesis.speak(u);
      return;
    }
    const audio = new Audio(btn.dataset.src);
    audio.currentTime = +btn.dataset.from || 0;
    audio.volume = 0.8;
    playing = { btn, audio };
    const stopAt = (+btn.dataset.from || 0) + 7; // a short taste, not the whole file
    audio.addEventListener('timeupdate', () => { if (audio.currentTime > stopAt && playing?.audio === audio) stopSound(); });
    audio.addEventListener('ended', () => { if (playing?.audio === audio) stopSound(); });
    audio.play().catch(() => stopSound());
  });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSound(); });

applyLang();
