import { CmdError, sleep } from '../../../core/util.js';
import { cpuOf, memOf, stateOf, uptimeSec, load, memInfo } from '../procfs.js';

const p2 = n => String(n).padStart(2, '0');
const mib = kb => (kb / 1024).toFixed(1).padStart(8);

// Jeden snímek jako text; rows = nejvýše tolik procesů (null = všechny)
export function frame(m, { user = null, rows = null } = {}) {
  const now = new Date();
  const ps = m.procs.list().filter(p => p.cmd && (!user || p.user === user));
  const all = m.procs.list();
  const cpu = all.reduce((s, p) => s + cpuOf(p), 0);
  const running = all.filter(p => stateOf(p) === 'R').length, stopped = all.filter(p => p.stopped).length;
  const up = Math.floor(uptimeSec(m) / 60), mem = memInfo(m);
  const us = Math.min(100, cpu * 0.9), sy = Math.min(100 - us, cpu * 0.1 + 0.2), id = Math.max(0, 100 - us - sy);
  const out = [
    `top - ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())} up ${Math.floor(up / 60)}:${p2(up % 60)},  1 user,  load average: ${load(m).join(', ')}`,
    `Tasks: ${String(all.length).padStart(3)} total, ${String(running).padStart(3)} running, ${String(all.length - running - stopped).padStart(3)} sleeping, ${String(stopped).padStart(3)} stopped,   0 zombie`,
    `%Cpu(s): ${us.toFixed(1).padStart(5)} us, ${sy.toFixed(1).padStart(4)} sy,  0.0 ni, ${id.toFixed(1).padStart(5)} id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st`,
    `MiB Mem : ${mib(mem.total)} total, ${mib(mem.free)} free, ${mib(mem.used)} used, ${mib(mem.cache)} buff/cache`,
    `MiB Swap: ${mib(0)} total, ${mib(0)} free, ${mib(0)} used. ${mib(mem.free + mem.cache)} avail Mem`,
    '',
    '\x1b[7m    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\x1b[0m',
  ];
  const list = ps.map(p => ({ p, c: cpuOf(p) })).sort((a, b) => b.c - a.c || a.p.pid - b.p.pid);
  for (const { p, c } of rows ? list.slice(0, rows) : list) {
    const r = memOf(p);
    out.push(`${String(p.pid).padStart(7)} ${p.user.slice(0, 8).padEnd(8)} ${'20'.padStart(3)} ${'0'.padStart(3)} ${String(r.virt).padStart(7)} ${String(r.res).padStart(6)} ${String(r.shr).padStart(6)} ${stateOf(p)} ${c.toFixed(1).padStart(5)} ${(r.res / 20480).toFixed(1).padStart(5)} ${'0:00.' + p2(p.pid % 100)} ${p.cmd}`);
  }
  return out.join('\n') + '\n';
}

export default {
  async run(ctx) {
    let batch = false, n = null, delay = 3, user = null;
    const a = ctx.args.slice();
    while (a.length) {
      const x = a.shift();
      if (x === '--help') break;
      if (!/^-[a-zA-Z]/.test(x)) throw new CmdError(`unknown argument '${x}'`, 1);
      for (let i = 1; i < x.length; i++) {
        const c = x[i];
        if (c === 'b') batch = true;
        else if ('ndu'.includes(c)) {
          const v = x.slice(i + 1) || a.shift();
          if (v === undefined) throw new CmdError(`-${c} requires an argument`, 1);
          if (c === 'n') { n = +v; if (!Number.isInteger(n) || n < 1) throw new CmdError(`bad iterations argument '${v}'`, 1); }
          else if (c === 'd') { delay = +v; if (!(delay >= 0)) throw new CmdError(`bad delay interval '${v}'`, 1); }
          else user = v;
          break;
        } else throw new CmdError(`unknown option '${c}'`, 1);
      }
    }
    if (!batch && ctx.stdout.isTTY && ctx.tty?.live) {
      await ctx.tty.live(() => frame(ctx.m, { user, rows: 25 }), { title: 'top', interval: Math.max(500, delay * 1000), signal: ctx.signal });
      return 0;
    }
    for (let i = 0; i < (n ?? 1); i++) {
      if (i) { await ctx.stdout.write('\n'); await sleep(delay * 1000, ctx.signal, ctx.proc); }
      ctx.check();
      await ctx.stdout.write(frame(ctx.m, { user }).replace(/\x1b\[\d+m/g, ''));
    }
    return 0;
  },
};
