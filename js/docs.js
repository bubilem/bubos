// Stránka dokumentace: referenční příručka příkazů se čte přímo z man/<jazyk>.txt,
// takže nový příkaz s manuálovou stránkou se tu objeví sám.
import * as storage from './core/storage.js';

const $ = s => document.querySelector(s);

// Kategorie příkazů (příkaz mimo seznam spadne do "Ostatní")
const CATS = [
  ['Soubory a adresáře', ['ls', 'cd', 'pwd', 'touch', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln', 'tree', 'find', 'basename', 'dirname', 'stat', 'du', 'df']],
  ['Čtení a zpracování textu', ['cat', 'head', 'tail', 'less', 'nano', 'grep', 'cut', 'sort', 'uniq', 'wc', 'tr', 'tee', 'echo', 'printf', 'seq', 'yes', 'sed', 'awk', 'diff', 'xargs']],
  ['Uživatelé a práva', ['whoami', 'id', 'groups', 'su', 'sudo', 'useradd', 'usermod', 'userdel', 'groupadd', 'groupdel', 'passwd', 'chmod', 'chown', 'chgrp', 'umask']],
  ['Shell, proměnné a skripty', ['export', 'unset', 'env', 'printenv', 'alias', 'unalias', 'history', 'source', 'type', 'which', 'test', '[[', 'true', 'false', 'sleep', 'read', 'let', 'break', 'return', 'shift', 'local', ':', 'exit']],
  ['Systém a nápověda', ['help', 'man', 'clear', 'date', 'uname', 'hostname', 'cal', 'lang', 'mission', 'ps', 'kill']],
];
// Jméno příkazu → soubor modulu (shodné s FILE v js/os/linux/profile.js)
const FILE = { '.': 'source', '[': 'test', '[[': 'test', ':': 'colon', logout: 'exit' };

const state = { lang: 'cs', theme: 'dark', pages: [] };

async function loadMan(lang) {
  try {
    const r = await fetch(`man/${lang}.txt`);
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

// "#### jméno [další jména]" → [{names, body}]
function parseMan(text) {
  const parts = text.split(/^#### (.+)$/m), out = [];
  for (let i = 1; i < parts.length; i += 2)
    out.push({ names: parts[i].trim().split(/\s+/), body: parts[i + 1].replace(/^\n+|\s+$/g, '') });
  return out;
}

// první řádek pod nadpisem JMÉNO/NAME: "ls - popis"
function summary(body) {
  const lines = body.split('\n');
  const m = /^\s+\S.*? - (.+)$/.exec(lines[1] ?? '');
  return m ? m[1] : '';
}

async function loadPages() {
  const en = parseMan(await loadMan('en'));
  const map = new Map(en.map(p => [p.names[0], p]));
  if (state.lang === 'cs') for (const p of parseMan(await loadMan('cs'))) map.set(p.names[0], p);
  return [...map.values()];
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function renderCommands() {
  const box = $('#cmds'), toc = $('#toc-cmds'), files = $('#cmd-files');
  box.replaceChildren(); toc.replaceChildren(); files.replaceChildren();
  const byName = new Map(state.pages.map(p => [p.names[0], p]));
  const groups = CATS.map(([title, list]) => [title, list.map(n => byName.get(n)).filter(Boolean)]);
  const used = new Set(groups.flatMap(([, ps]) => ps.map(p => p.names[0])));
  const rest = state.pages.filter(p => !used.has(p.names[0]));
  if (rest.length) groups.push(['Ostatní', rest]);

  for (const [title, pages] of groups) {
    const sec = el('div', { className: 'cat' }, el('h3', { textContent: title }));
    toc.append(el('li', { className: 'grp', textContent: title }));
    for (const p of pages) {
      const id = 'cmd-' + p.names[0].replace(/[^\w-]/g, m => 'x' + m.charCodeAt(0).toString(16));
      const pre = el('pre');
      for (const line of p.body.split('\n')) {
        if (/^\S/.test(line)) pre.append(el('span', { className: 'h', textContent: line + '\n' }));
        else pre.append(line + '\n');
      }
      const d = el('details', { className: 'cmd', id },
        el('summary', {}, el('b', { textContent: p.names.join(', ') }), el('span', { textContent: summary(p.body) })), pre);
      d.dataset.q = (p.names.join(' ') + ' ' + p.body).toLowerCase();
      sec.append(d);
      toc.append(el('li', {}, el('a', { href: '#' + id, textContent: p.names[0] })));
      // tabulka souborů: jeden soubor = jeden příkaz
      for (const n of p.names) files.append(el('a', { href: '#' + id },
        el('code', { textContent: (FILE[n] ?? n) + '.js' }), ' ', el('span', { textContent: n === (FILE[n] ?? n) ? '' : `(${n})` })));
    }
    box.append(sec);
  }
  $('#count').textContent = `Celkem ${state.pages.length} manuálových stránek.`;
  openFromHash();
  applySearch();
}

function openFromHash() {
  const d = location.hash && document.getElementById(location.hash.slice(1));
  if (d?.tagName === 'DETAILS') { d.open = true; d.scrollIntoView(); }
}

function applySearch() {
  const q = $('#search').value.trim().toLowerCase();
  for (const d of document.querySelectorAll('.cmd')) d.hidden = !!q && !d.dataset.q.includes(q);
  for (const c of document.querySelectorAll('.cat')) c.hidden = ![...c.querySelectorAll('.cmd')].some(d => !d.hidden);
  if (q) { const first = document.querySelector('.cmd:not([hidden])'); if (first) first.open = true; }
}

function applySettings() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.lang = state.lang;
  $('#btn-lang').textContent = state.lang === 'cs' ? 'CS' : 'EN';
  $('#btn-theme').textContent = state.theme === 'dark' ? '☾' : '☀';
}

async function refresh() {
  applySettings();
  state.pages = await loadPages();
  renderCommands();
}

$('#search').addEventListener('input', () => {
  applySearch();
  if ($('#search').value.trim()) $('#prikazy').scrollIntoView();
});
$('#btn-lang').addEventListener('click', () => { state.lang = state.lang === 'cs' ? 'en' : 'cs'; refresh(); });
$('#btn-theme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applySettings(); });
addEventListener('hashchange', openFromHash);

// zvýraznění aktuální kapitoly v obsahu
const links = [...document.querySelectorAll('#toc > ol > li > a')];
const spy = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) for (const a of links) a.classList.toggle('on', a.hash === '#' + e.target.id);
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('main > section').forEach(s => spy.observe(s));

// jazyk a vzhled převezmeme z uloženého systému (nastavení v IndexedDB)
(async () => {
  try {
    const st = await storage.load();
    if (st?.settings) { state.lang = st.settings.lang === 'en' ? 'en' : 'cs'; state.theme = st.settings.theme === 'light' ? 'light' : 'dark'; }
  } catch { /* výchozí nastavení */ }
  refresh();
})();

// „Zpět do terminálu“ vrací tam, odkud žák přišel (pískoviště nebo rozpracovaný úkol); bez předchozí stránky vede na index.html
document.querySelector('a[href="index.html"]')?.addEventListener('click', e => {
  if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) { e.preventDefault(); history.back(); }
});
