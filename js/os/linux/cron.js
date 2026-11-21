// Cron: čtení crontabů, shoda s časem a spouštění úloh. Crontaby jsou v /var/spool/cron/crontabs/<uživatel>.
// Úlohy běží jen když je spuštěná služba cron; výstup se zahodí (skutečný cron ho posílá poštou) – do logu jde řádek CRON.
import { sessionUser } from '../../core/users.js';
import { StringWriter, Stdin } from '../../core/streams.js';
import { isActive, procOf, logLine } from './services.js';

export const CRON_DIR = '/var/spool/cron/crontabs';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };

// Jedno pole → množina hodnot nebo null (chyba). names = pole jmen (jan.., sun..) s počátkem v lo
function field(f, lo, hi, names) {
  const out = new Set();
  const num = s => {
    if (/^\d+$/.test(s)) return +s;
    const i = names ? names.indexOf(s.toLowerCase().slice(0, 3)) : -1;
    return i >= 0 && s.length >= 3 ? i + lo : NaN;
  };
  for (const part of f.split(',')) {
    const m = /^(\*|[^/]+?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] === undefined ? 1 : +m[2];
    if (!step) return null;
    let a, b;
    if (m[1] === '*') { a = lo; b = hi; }
    else if (m[1].includes('-')) { const [x, y, ...r] = m[1].split('-'); if (r.length) return null; a = num(x); b = num(y); }
    else { a = num(m[1]); b = m[2] === undefined ? a : hi; }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < lo || b > hi || a > b) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

// Vrací { entries: [{ spec, cmd, line }], errors: [{ line, msg }] }
export function parseCrontab(text) {
  const entries = [], errors = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim(), n = i + 1;
    if (!line || line.startsWith('#') || /^[A-Za-z_]\w*\s*=/.test(line)) return;
    const toks = line.split(/\s+/);
    let spec = toks;
    const macro = toks[0].startsWith('@');
    if (macro) {
      const exp = MACROS[spec[0]];
      if (!exp) { if (spec[0] !== '@reboot') errors.push({ line: n, msg: 'bad command' }); return; }
      spec = [...exp.split(' '), ...spec.slice(1)];
    }
    if (spec.length < 6) { errors.push({ line: n, msg: spec.length < 5 ? 'bad minute' : 'bad command' }); return; }
    const f = [field(spec[0], 0, 59), field(spec[1], 0, 23), field(spec[2], 1, 31), field(spec[3], 1, 12, MONTHS), field(spec[4], 0, 7, DAYS)];
    const bad = ['bad minute', 'bad hour', 'bad day-of-month', 'bad month', 'bad day-of-week'][f.findIndex(x => !x)];
    if (bad) { errors.push({ line: n, msg: bad }); return; }
    if (f[4].has(7)) f[4].add(0);
    const cmd = toks.slice(macro ? 1 : 5).join(' ');
    entries.push({ f, star: [spec[2] === '*', spec[4] === '*'], cmd, line: n });
  });
  return { entries, errors };
}

export function matches(e, d) {
  const [mi, h, dom, mon, dow] = e.f;
  if (!mi.has(d.getMinutes()) || !h.has(d.getHours()) || !mon.has(d.getMonth() + 1)) return false;
  const a = dom.has(d.getDate()), b = dow.has(d.getDay());
  // jako ve skutečném cronu: jsou-li omezeny obě pole (den v měsíci i den v týdnu), stačí shoda jednoho z nich
  return e.star[0] || e.star[1] ? a && b : a || b;
}

// Spustí úlohy, které mají být v dané minutě; vrací počet spuštěných
export async function cronTick(m, date = new Date()) {
  if (!isActive(m, 'cron')) return 0;
  let files = [];
  try { files = m.fs.readdir(CRON_DIR, null); } catch { return 0; }
  const { Shell } = await import('../../core/shell/shell.js');
  const cronProc = procOf(m, 'cron');
  let count = 0;
  for (const name of files) {
    const user = sessionUser(m.fs, name);
    if (!user) continue;
    let text = '';
    try { text = m.fs.read(`${CRON_DIR}/${name}`, null); } catch { continue; }
    for (const e of parseCrontab(text).entries) {
      if (!matches(e, date)) continue;
      count++;
      const tty = { isTTY: false, write() {}, async readLine() { return null; }, async ask() { return ''; }, clear() {} };
      const sh = new Shell(m, user, { tty });
      sh.proc.cmd = '/usr/sbin/CRON -f';
      sh.proc.ppid = cronProc?.pid ?? 1;
      logLine(m, `(${name}) CMD (${e.cmd})`, `CRON[${sh.proc.pid}]`);
      const sink = new StringWriter();
      try { await sh.runLine(e.cmd, { stdin: Stdin.fromString(''), stdout: sink, stderr: sink }); }
      catch { /* chyba úlohy cron nezajímá */ }
      finally { sh.end(); }
    }
  }
  return count;
}

// Hodiny cronu: jednou za minutu (kontrola každých 5 s); běží jen v prohlížeči a po zavření stroje se zastaví
export function startCron(m) {
  if (typeof setInterval !== 'function') return;
  let last = Math.floor(Date.now() / 60000);
  const id = setInterval(() => {
    if (m.closed) { clearInterval(id); return; }
    const cur = Math.floor(Date.now() / 60000);
    if (cur === last) return;
    last = cur;
    cronTick(m, new Date(cur * 60000)).catch(() => {});
  }, 5000);
  id.unref?.();
  m.cronTimer = id;
}
