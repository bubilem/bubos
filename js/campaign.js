// Stránka kampaně: dlaždice úkolů, filtry, detail úkolu, postup (hvězdy), záloha postupu.
import { loadDict, setLang, t, getLang } from './core/i18n.js';
import * as storage from './core/storage.js';
import { pick, totalStars } from './core/mission.js';
import linux from './os/linux/profile.js';

const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
// hvězdy: získané jantarové, chybějící tlumené
const stars = (n, title = '') => el('span', { className: 'stars', title }, el('span', { className: 'on', textContent: '★'.repeat(n) }), '☆'.repeat(3 - n));
const DAY = 864e5;

const S = { lang: 'cs', theme: 'dark', index: null, defs: {}, progress: null, saved: {}, f: { chapter: '', level: '', status: '' } };

const statusOf = id => ((S.progress.missions[id]?.stars ?? 0) > 0 ? 'done' : S.saved[id] ? 'doing' : 'new');

function applyLang() {
  setLang(S.lang);
  document.documentElement.lang = S.lang;
  document.documentElement.dataset.theme = S.theme;
  document.title = t('camp.title');
  for (const e of document.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of document.querySelectorAll('[data-i18n-title]')) e.title = t(e.dataset.i18nTitle);
  $('#btn-lang').textContent = S.lang === 'cs' ? 'CS' : 'EN';
  $('#btn-theme').textContent = S.theme === 'dark' ? '☾' : '☀';
}

function fillSelect(sel, key, options) {
  sel.replaceChildren(...[['', t('camp.all')], ...options].map(([v, label]) => el('option', { value: v, textContent: label, selected: v === S.f[key] })));
}

function renderFilters() {
  fillSelect($('#f-chapter'), 'chapter', S.index.chapters.map(c => [c.id, pick(c.title, S.lang)]));
  fillSelect($('#f-level'), 'level', [1, 2, 3].map(l => [String(l), t('camp.level.' + l)]));
  fillSelect($('#f-status'), 'status', ['new', 'doing', 'done'].map(s => [s, t('camp.status.' + s)]));
}

function renderSummary() {
  const all = S.index.chapters.flatMap(c => c.missions).filter(id => S.defs[id]);
  const done = all.filter(id => statusOf(id) === 'done').length;
  $('#summary').replaceChildren(
    el('b', { textContent: `★ ${totalStars(S.progress)}/${all.length * 3}` }),
    el('span', { textContent: t('camp.summary', { done, total: all.length }) }));
  // připomínka zálohy: postup je jen v tomto prohlížeči
  const b = $('#backup');
  const has = Object.keys(S.progress.missions).length > 0;
  const age = (Date.now() - S.progress.exportedAt) / DAY;
  b.hidden = !has || (S.progress.exportedAt && age < 14);
  if (!b.hidden) b.textContent = S.progress.exportedAt ? t('camp.backup.old', { n: Math.floor(age) }) : t('camp.backup.never');
}

function tile(def) {
  const id = def.id, st = statusOf(id), r = S.progress.missions[id];
  const b = el('button', { className: `tile ${st}`, type: 'button' },
    el('span', { className: 'name', textContent: pick(def.title, S.lang) }),
    stars(r?.stars ?? 0, t('camp.status.' + st)),
    el('span', { className: 'meta' }, el('span', { className: 'st', textContent: t('camp.status.' + st) }),
      el('span', { className: 'lvl', textContent: '●'.repeat(def.level) + '○'.repeat(3 - def.level), title: t('camp.level.' + def.level) })));
  b.addEventListener('click', () => openDetail(def));
  return b;
}

function renderChapters() {
  const { chapter, level, status } = S.f;
  const sections = [];
  for (const c of S.index.chapters) {
    if (chapter && c.id !== chapter) continue;
    const defs = c.missions.map(id => S.defs[id]).filter(d => d && (!level || String(d.level) === level) && (!status || statusOf(d.id) === status));
    if (!defs.length) continue;
    const got = c.missions.reduce((s, id) => s + (S.progress.missions[id]?.stars ?? 0), 0);
    sections.push(el('section', { className: 'chapter' },
      el('h2', {}, el('span', { className: 'ct', textContent: pick(c.title, S.lang) }), el('span', { textContent: `★ ${got}/${c.missions.length * 3}` })),
      el('div', { className: 'grid' }, ...defs.map(tile))));
  }
  $('#chapters').replaceChildren(...(sections.length ? sections : [el('p', { className: 'empty', textContent: t('camp.empty') })]));
}

function render() { renderFilters(); renderSummary(); renderChapters(); }

// --- detail úkolu ---
function openDetail(def) {
  const id = def.id, st = statusOf(id), r = S.progress.missions[id];
  const dlg = $('#detail');
  const list = items => el('ul', {}, ...items.map(g => el('li', { textContent: pick(g.text, S.lang) })));
  const url = `index.html?mission=${encodeURIComponent(id)}`;
  const bar = el('div', { className: 'bar' },
    el('a', { className: 'go', href: url, textContent: S.saved[id] && st !== 'done' ? t('camp.resume') : st === 'done' ? t('camp.again') : t('camp.start') }));
  if (S.saved[id]) {
    const fresh = el('button', { type: 'button', textContent: t('camp.restart') });
    fresh.addEventListener('click', async () => { await storage.wipe('mission:' + id); location.href = url; });
    bar.append(fresh);
  }
  const close = el('button', { type: 'button', textContent: t('camp.close') });
  close.addEventListener('click', () => dlg.close());
  bar.append(close);
  dlg.replaceChildren(el('div', { className: 'inner' },
    el('h2', { textContent: pick(def.title, S.lang) }),
    stars(r?.stars ?? 0, t('camp.status.' + st)),
    el('p', { textContent: pick(def.brief, S.lang) }),
    el('h3', { textContent: t('camp.goals') }), list(def.goals),
    el('h3', { textContent: t('camp.bonus') }), list(def.bonus),
    ...(def.needs?.length ? [el('h3', { textContent: t('camp.needs') }), el('div', { className: 'chips' }, ...def.needs.map(n => el('code', { textContent: n })))] : []),
    el('p', { className: 'note', textContent: t('camp.hintcount', { n: def.hints.length }) + ' · ' + t('camp.known') }),
    bar));
  dlg.showModal();
}
$('#detail').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // klik na pozadí zavře

// --- ovládání ---
function say(text) {
  const m = $('#msg');
  m.textContent = text; m.hidden = false;
  setTimeout(() => { m.hidden = true; }, 6000);
}
for (const [sel, key] of [['#f-chapter', 'chapter'], ['#f-level', 'level'], ['#f-status', 'status']])
  $(sel).addEventListener('change', e => { S.f[key] = e.target.value; renderChapters(); });
$('#btn-lang').addEventListener('click', () => {
  S.lang = S.lang === 'cs' ? 'en' : 'cs';
  storage.patchSettings({ lang: S.lang });
  applyLang(); render();
});
$('#btn-theme').addEventListener('click', () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  storage.patchSettings({ theme: S.theme });
  applyLang();
});
$('#btn-export').addEventListener('click', async () => { await storage.exportProgress(); S.progress = await storage.loadProgress(); renderSummary(); });
$('#btn-import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (!(await storage.mergeProgressFrom(await storage.readJson(f)))) throw new Error('not a progress file');
    S.progress = await storage.loadProgress();
    render();
    say(t('camp.import.ok'));
  } catch { say(t('camp.import.bad')); }
});

// --- start ---
async function main() {
  await Promise.all([loadDict('en'), loadDict('cs')]);
  const prefs = await storage.loadSettings();
  S.lang = prefs.lang ?? (navigator.language?.startsWith('cs') ? 'cs' : 'en');
  S.theme = prefs.theme ?? 'dark';
  applyLang();
  try { S.index = await linux.loadMissionIndex(); }
  catch { $('#chapters').textContent = t('camp.loadfail'); return; }
  const ids = S.index.chapters.flatMap(c => c.missions);
  await Promise.all(ids.map(async id => { try { S.defs[id] = await linux.loadMission(id); } catch (e) { console.warn('Úkol se nenačetl:', id, e); } }));
  S.progress = await storage.loadProgress();
  await Promise.all(ids.map(async id => {
    const s = await storage.load('mission:' + id);
    if (s?.mission && s.mission.rev === (S.defs[id]?.rev ?? 1)) S.saved[id] = true;
  }));
  render();
}
main();
