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

// printf-formát: %s %d %i %u %o %x %X %f %e %g %c %%, šířka, přesnost, příznaky - + 0 mezera #; vrací { text, used }
export function sprintf(fmt, args, conv = {}) {
  const num = conv.num ?? (v => parseFloat(v) || 0), str = conv.str ?? (v => (v === undefined ? '' : String(v)));
  let ai = 0;
  const text = fmt.replace(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?(?:hh|h|ll|l|L)?([a-zA-Z%])/g, (m, fl, w, p, c) => {
    if (c === '%') return '%';
    if (w === '*') w = String(Math.trunc(num(args[ai++])));
    if (p === '*') p = String(Math.trunc(num(args[ai++])));
    let width = w ? +w : 0;
    if (width < 0) { fl += '-'; width = -width; }
    const prec = p === undefined ? null : +p || 0, left = fl.includes('-'), raw = args[ai++];
    let body, numeric = true, sign = '';
    const signOf = n => (n < 0 || Object.is(n, -0) ? '-' : fl.includes('+') ? '+' : fl.includes(' ') ? ' ' : '');
    switch (c) {
      case 'd': case 'i': case 'u': {
        const n = Math.trunc(num(raw)); sign = signOf(n); body = String(Math.abs(n));
        if (prec !== null) body = body.padStart(prec, '0');
        break;
      }
      case 'o': case 'x': case 'X': {
        const n = Math.trunc(num(raw)) >>> 0;
        body = n.toString(c === 'o' ? 8 : 16); if (c === 'X') body = body.toUpperCase();
        if (prec !== null) body = body.padStart(prec, '0');
        if (fl.includes('#') && n) body = (c === 'o' ? '0' : c === 'x' ? '0x' : '0X') + body;
        break;
      }
      case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
        const n = num(raw); sign = signOf(n); const a = Math.abs(n), P = prec ?? 6;
        if (!Number.isFinite(a)) body = Number.isNaN(a) ? 'nan' : 'inf';
        else if (c === 'f' || c === 'F') body = a.toFixed(P);
        else if (c === 'e' || c === 'E') body = a.toExponential(P).replace(/e([+-])(\d)$/, 'e$10$2');
        else {
          const Q = P || 1, ex = a === 0 ? 0 : Math.floor(Math.log10(a));
          body = ex < -4 || ex >= Q ? a.toExponential(Q - 1).replace(/e([+-])(\d)$/, 'e$10$2') : a.toFixed(Math.max(0, Q - 1 - ex));
          if (!fl.includes('#')) body = body.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
        }
        if (/[EG]/.test(c)) body = body.toUpperCase();
        break;
      }
      case 'c': numeric = false; body = typeof raw === 'number' ? String.fromCodePoint(raw) : str(raw).slice(0, 1); break;
      case 's': numeric = false; body = str(raw); if (prec !== null) body = body.slice(0, prec); break;
      default: return m;
    }
    let out = sign + body;
    if (out.length < width) {
      if (left) out = out.padEnd(width);
      else if (fl.includes('0') && numeric && !(prec !== null && 'diuoxX'.includes(c))) out = sign + body.padStart(width - sign.length, '0');
      else out = out.padStart(width);
    }
    return out;
  });
  return { text, used: ai };
}
