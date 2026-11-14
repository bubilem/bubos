import { parseArgs } from '../../../core/args.js';
import { byteLen } from '../../../core/util.js';
import { humanSize } from '../lib.js';

// Místo na disku: soubory po 4 KiB blocích, adresář sám 4 KiB, symbolický odkaz nic
const own = n => (n.type === 'dir' ? 4096 : n.type === 'link' ? 0 : Math.ceil(byteLen(n.data ?? '') / 4096) * 4096);

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'ahsc', val: 'd', long: { 'all': 'a', 'human-readable': 'h', summarize: 's', total: 'c', 'max-depth': 'd' } });
    const maxDepth = o.s ? 0 : o.d !== undefined ? +o.d : Infinity;
    const show = b => (o.h ? humanSize(b) : String(Math.ceil(b / 1024)));
    const lines = [];
    // vrací součet; do lines přidává adresáře (a s -a i soubory) po dokončení obsahu
    const walk = (abs, shown, depth) => {
      ctx.check();
      const n = ctx.fs.stat(abs, ctx.user, false);
      let total = own(n);
      if (n.type === 'dir') {
        for (const nm of ctx.fs.readdir(abs, ctx.user)) total += walk((abs === '/' ? '' : abs) + '/' + nm, shown + '/' + nm, depth + 1);
        if (depth <= maxDepth) lines.push(`${show(total)}\t${shown}`);
      } else if (o.a && depth <= maxDepth) lines.push(`${show(total)}\t${shown}`);
      else if (depth === 0) lines.push(`${show(total)}\t${shown}`);
      return total;
    };
    let grand = 0;
    const st = await ctx.each(rest.length ? rest : ['.'], a => { grand += walk(ctx.path(a), a, 0); }, 'cannot access');
    if (o.c) lines.push(`${show(grand)}\ttotal`);
    if (lines.length) await ctx.stdout.write(lines.join('\n') + '\n');
    return st;
  },
};
