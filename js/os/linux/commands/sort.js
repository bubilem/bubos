import { parseArgs } from '../../../core/args.js';
import { getLang } from '../../../core/i18n.js';
import { toLines, withInputs } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, {
      bool: 'rnuf', val: 'kt', long: { reverse: 'r', 'numeric-sort': 'n', unique: 'u', 'ignore-case': 'f', 'key': 'k', 'field-separator': 't' },
    });
    let lines = [];
    const st = await withInputs(ctx, rest, text => { lines.push(...toLines(text)); });
    // klíč: -k START[,END] (čísla polí od 1), pole oddělená mezerami nebo znakem -t
    let ks = 1, ke = Infinity;
    if (o.k) { const m = /^(\d+)(?:,(\d+))?/.exec(o.k); if (m) { ks = +m[1]; ke = m[2] ? +m[2] : Infinity; } }
    const sep = o.t ? o.t : null;
    const key = l => {
      if (!o.k) return l;
      const f = sep ? l.split(sep) : l.trim().split(/\s+/);
      return f.slice(ks - 1, ke === Infinity ? undefined : ke).join(sep ?? ' ');
    };
    const coll = new Intl.Collator(getLang(), { sensitivity: o.f ? 'base' : 'variant', numeric: false });
    const cmp = (a, b) => {
      const x = key(a), y = key(b);
      let r;
      if (o.n) r = (parseFloat(x) || 0) - (parseFloat(y) || 0);
      else r = coll.compare(x, y);
      return r || (o.k ? coll.compare(a, b) : 0);
    };
    lines.sort((a, b) => (o.r ? -cmp(a, b) : cmp(a, b)));
    if (o.u) lines = lines.filter((l, i) => i === 0 || cmp(l, lines[i - 1]) !== 0);
    if (lines.length) await ctx.stdout.write(lines.join('\n') + '\n');
    return st;
  },
};
