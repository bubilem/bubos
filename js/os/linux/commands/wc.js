import { parseArgs } from '../../../core/args.js';
import { byteLen } from '../../../core/util.js';
import { withInputs } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'lwcm', long: { lines: 'l', words: 'w', bytes: 'c', chars: 'm' } });
    const all = !o.l && !o.w && !o.c && !o.m;
    const cols = [all || o.l ? 'l' : '', all || o.w ? 'w' : '', o.m ? 'm' : '', all || o.c ? 'c' : ''].filter(Boolean);
    const rows = [];
    const st = await withInputs(ctx, rest, (text, name) => {
      const c = {
        l: (text.match(/\n/g) || []).length,
        w: (text.match(/\S+/g) || []).length,
        m: [...text].length,
        c: byteLen(text),
      };
      rows.push({ c, name: rest.length ? name : '' });
    });
    if (rest.length > 1) {
      const t = { l: 0, w: 0, m: 0, c: 0 };
      for (const r of rows) for (const k of cols) t[k] += r.c[k];
      rows.push({ c: t, name: 'total' });
    }
    const width = cols.length === 1 && rows.length <= 1 ? 1
      : rest.length ? String(Math.max(...rows.flatMap(r => cols.map(k => r.c[k])))).length : 7;
    for (const r of rows)
      await ctx.stdout.write(cols.map(k => String(r.c[k]).padStart(width)).join(' ') + (r.name ? ' ' + r.name : '') + '\n');
    return st;
  },
};
