import { parseArgs } from '../../../core/args.js';
import { toLines, withInputs } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'cduiI', long: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' } });
    const input = rest.slice(0, 1);
    const lines = [];
    const st = await withInputs(ctx, input, text => { lines.push(...toLines(text)); });
    const norm = l => (o.i ? l.toLowerCase() : l);
    const groups = [];
    for (const l of lines) {
      const g = groups.at(-1);
      if (g && norm(g.line) === norm(l)) g.n++; else groups.push({ line: l, n: 1 });
    }
    for (const g of groups) {
      if (o.d && g.n < 2) continue;
      if (o.u && g.n > 1) continue;
      await ctx.stdout.write((o.c ? String(g.n).padStart(7) + ' ' : '') + g.line + '\n');
    }
    return st;
  },
};
