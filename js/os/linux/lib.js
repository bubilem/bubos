// Společné pomocné funkce pro příkazy
import { getUsers, getGroups } from '../../core/users.js';
import { getLang } from '../../core/i18n.js';
import { resolvePath, can, X } from '../../core/vfs.js';

export function idMaps(fs) {
  const u = new Map(getUsers(fs).map(x => [x.uid, x.name]));
  const g = new Map(getGroups(fs).map(x => [x.gid, x.name]));
  return { uname: id => u.get(id) ?? String(id), gname: id => g.get(id) ?? String(id) };
}

export const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  cs: ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'],
};
export const DAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  cs: ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'],
};

export function lsDate(ms) {
  const d = new Date(ms), m = MONTHS[getLang()] ?? MONTHS.en;
  const day = String(d.getDate()).padStart(2, ' ');
  if (Math.abs(Date.now() - ms) < 182 * 864e5)
    return `${m[d.getMonth()]} ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${m[d.getMonth()]} ${day}  ${d.getFullYear()}`;
}

export function humanSize(n) {
  if (n < 1024) return String(n);
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < 3);
  return (n < 10 ? n.toFixed(1) : Math.ceil(n)) + 'KMGT'[i];
}

// Barva názvu podle typu souboru (jako ls --color)
export function paint(name, n) {
  const c = n.type === 'dir' ? '1;34' : n.type === 'link' ? '1;36' : n.dev ? '1;33' : (n.mode & 0o111) ? '1;32' : null;
  return c ? `\x1b[${c}m${name}\x1b[0m` : name;
}

// První spustitelný soubor daného jména v PATH (nebo null)
export function whichPath(sh, name) {
  if (name.includes('/')) return sh.fs.exists(resolvePath(sh.cwd, name), sh.user) ? name : null;
  for (const d of (sh.vars.PATH || '').split(':').filter(Boolean)) {
    const p = resolvePath(sh.cwd, d + '/' + name);
    try {
      const n = sh.fs.stat(p, sh.user);
      if (n.type === 'file' && can(n, sh.user, X)) return p;
    } catch { /* dál */ }
  }
  return null;
}

// Zpracuje vstupy textového filtru: soubory, nebo stdin (bez operandů / "-")
export async function withInputs(ctx, files, fn) {
  if (!files.length) { await fn(await ctx.stdin.readAll(), '-'); return 0; }
  return ctx.each(files, async a => fn(a === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user), a));
}

// Text na řádky (bez posledního prázdného po koncovém \n)
export function toLines(text) {
  const l = text.split('\n');
  if (l.at(-1) === '') l.pop();
  return l;
}

export function fmtDate(d, fmt) {
  const lang = getLang(), p = (n, w = 2) => String(n).padStart(w, '0');
  const map = {
    Y: d.getFullYear(), m: p(d.getMonth() + 1), d: p(d.getDate()), e: String(d.getDate()).padStart(2, ' '),
    H: p(d.getHours()), M: p(d.getMinutes()), S: p(d.getSeconds()), y: p(d.getFullYear() % 100),
    a: (DAYS[lang] ?? DAYS.en)[d.getDay()], b: (MONTHS[lang] ?? MONTHS.en)[d.getMonth()],
    j: p(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5), 3),
    F: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    T: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    s: Math.floor(d.getTime() / 1000), n: '\n', '%': '%',
    A: d.toLocaleDateString(lang, { weekday: 'long' }), B: d.toLocaleDateString(lang, { month: 'long' }),
  };
  return fmt.replace(/%(.)/g, (m, c) => (c in map ? map[c] : m));
}
