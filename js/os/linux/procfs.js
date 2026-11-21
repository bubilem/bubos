// Dynamický /proc: adresáře /proc/<pid> se podle tabulky procesů přepisují přímo ve stromu (bez signálu o změně,
// aby se zbytečně neukládalo) a obsah souborů vzniká až při čtení (uzel s polem "gen" → VFS.gen).
import { findUser } from '../../core/users.js';

const FIXED = ['uptime', 'loadavg', 'meminfo'];

// Zdánlivé zatížení procesu v % (stabilní podle PID, mírně kolísá s časem)
export function cpuOf(p, now = Date.now()) {
  if (p.stopped) return 0;
  if (/^(yes|sl)\b/.test(p.cmd)) return 85 + 10 * Math.abs(Math.sin(p.pid + now / 2000));
  if (p.sys && p.pid > 2) return p.pid % 5 === 0 ? 0.3 * Math.abs(Math.sin(p.pid + now / 5000)) : 0;
  if (p.cmd === 'top') return 0.3 + 0.4 * Math.abs(Math.sin(now / 1500));
  return 0;
}
export const memOf = p => ({ virt: 8000 + (p.pid % 97) * 120, res: 1200 + (p.pid % 41) * 60, shr: 900 + (p.pid % 13) * 40 }); // kB
export const stateOf = p => (p.stopped ? 'T' : p.cmd === 'top' || /^(yes|sl)\b/.test(p.cmd) ? 'R' : 'S');
const STATE_NAME = { R: 'running', S: 'sleeping', T: 'stopped' };

export const uptimeSec = m => 3600 + (Date.now() - m.bootAt) / 1000;
export function load(m) {
  const busy = m.procs.list().reduce((s, p) => s + cpuOf(p) / 100, 0);
  return [busy, busy * 0.9, busy * 0.8].map(x => x.toFixed(2));
}
export function memInfo(m) {
  const total = 2048000, used = 380000 + m.procs.list().reduce((s, p) => s + memOf(p).res, 0);
  return { total, free: Math.max(0, total - used - 400000), used, cache: 400000 };
}

function gen(m, key) {
  const [what, pid] = key.split(':');
  switch (what) {
    case 'uptime': return `${uptimeSec(m).toFixed(2)} ${(uptimeSec(m) * 0.97).toFixed(2)}\n`;
    case 'loadavg': { const l = load(m); const ps = m.procs.list(); return `${l.join(' ')} ${ps.filter(p => stateOf(p) === 'R').length}/${ps.length} ${m.procs.next - 1}\n`; }
    case 'meminfo': {
      const i = memInfo(m);
      return `MemTotal:     ${String(i.total).padStart(8)} kB\nMemFree:      ${String(i.free).padStart(8)} kB\nMemAvailable: ${String(i.free + i.cache).padStart(8)} kB\nBuffers:      ${String(40000).padStart(8)} kB\nCached:       ${String(i.cache).padStart(8)} kB\nSwapTotal:    ${String(0).padStart(8)} kB\nSwapFree:     ${String(0).padStart(8)} kB\n`;
    }
    default: break;
  }
  const p = m.procs.get(+pid);
  if (!p) return '';
  const name = p.cmd.split(' ')[0].split('/').pop() || p.cmd;
  const uid = findUser(m.fs, p.user)?.uid ?? 0;
  switch (what) {
    case 'cmdline': return p.cmd.split(' ').join('\0') + '\0';
    case 'comm': return name.slice(0, 15) + '\n';
    case 'status': {
      const s = stateOf(p), r = memOf(p);
      return `Name:\t${name.slice(0, 15)}\nState:\t${s} (${STATE_NAME[s]})\nPid:\t${p.pid}\nPPid:\t${p.ppid}\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nVmSize:\t${r.virt} kB\nVmRSS:\t${r.res} kB\nThreads:\t1\n`;
    }
    case 'stat': return `${p.pid} (${name.slice(0, 15)}) ${stateOf(p)} ${p.ppid} ${p.pid} 0 0 -1\n`;
    default: return '';
  }
}

const file = (key, mode = 0o444) => ({ type: 'file', mode, uid: 0, gid: 0, mtime: Date.now(), data: '', gen: key });
const dir = children => ({ type: 'dir', mode: 0o555, uid: 0, gid: 0, mtime: Date.now(), children });

// Připojí /proc ke stroji: volá se z boot() profilu
export function mountProc(m) {
  m.bootAt ??= Date.now();
  m.fs.gen = key => gen(m, key);
  const sync = () => {
    let proc;
    try { proc = m.fs.stat('/proc', null); } catch { return; }
    if (proc.type !== 'dir') return;
    for (const f of FIXED) {
      const n = proc.children[f];
      if (n && n.type === 'file') n.gen = f; else proc.children[f] = file(f);
    }
    const live = new Set(m.procs.list().map(p => String(p.pid)));
    for (const k of Object.keys(proc.children)) if (/^\d+$/.test(k) && !live.has(k)) delete proc.children[k];
    for (const k of live) {
      if (proc.children[k]) continue;
      proc.children[k] = dir({ cmdline: file('cmdline:' + k), comm: file('comm:' + k), status: file('status:' + k), stat: file('stat:' + k) });
    }
  };
  m.procs.onChange = sync;
  sync();
}
