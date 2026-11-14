import { parseArgs } from '../../../core/args.js';
import { byteLen } from '../../../core/util.js';
import { humanSize } from '../lib.js';

// Výukový výpis: kořenový disk (velikost vymyšlená, využití roste podle skutečných souborů v systému) + tmpfs
const MOUNTS = [['/dev/vda1', 'ext4', '/', 20480000, 3500000], ['tmpfs', 'tmpfs', '/run', 409000, 980], ['tmpfs', 'tmpfs', '/dev/shm', 1022496, 0]];

function usedBytes(n) {
  if (n.type === 'dir') return 4096 + Object.values(n.children).reduce((s, c) => s + usedBytes(c), 0);
  return n.type === 'link' ? 0 : Math.ceil(byteLen(n.data ?? '') / 4096) * 4096;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'hTk', long: { 'human-readable': 'h', 'print-type': 'T' } });
    const real = Math.ceil(usedBytes(ctx.fs.root) / 1024);
    const rows = MOUNTS.map(([dev, type, mp, size, used]) => {
      if (mp === '/') used += real;
      return { dev, type, mp, size, used, avail: size - used, pct: Math.ceil(used / size * 100) + '%' };
    });
    let pick = rows, st = 0;
    if (rest.length) {
      pick = [];
      for (const a of rest) {
        try {
          const p = ctx.path(a);
          ctx.fs.stat(p, ctx.user);
          const m = rows.filter(r => p === r.mp || p.startsWith(r.mp + '/') || r.mp === '/').sort((x, y) => y.mp.length - x.mp.length)[0];
          if (!pick.includes(m)) pick.push(m);
        } catch (e) { await ctx.stderr.write(`df: ${a}: ${ctx.fsMsg(e)}\n`); st = 1; }
      }
      if (!pick.length) return st;
    }
    const f = k => (o.h ? humanSize(k * 1024) : String(k));
    const head = ['Filesystem', ...(o.T ? ['Type'] : []), o.h ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'];
    const body = pick.map(r => [r.dev, ...(o.T ? [r.type] : []), f(r.size), f(r.used), f(r.avail), r.pct, r.mp]);
    const w = head.map((h, i) => Math.max(h.length, ...body.map(b => b[i].length)));
    const fmt = r => r.map((c, i) => (i === 0 || i === r.length - 1 || (o.T && i === 1) ? c.padEnd(w[i]) : c.padStart(w[i]))).join(' ').trimEnd();
    await ctx.stdout.write([fmt(head), ...body.map(fmt)].join('\n') + '\n');
    return st;
  },
};
