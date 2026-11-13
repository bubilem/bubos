import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { toLines, withInputs } from '../lib.js';

// "1,3-5,7-" → funkce, zda je pozice (od 1) vybraná
function ranges(spec) {
  const rs = spec.split(',').map(p => {
    const m = /^(\d*)-(\d*)$/.exec(p) || /^(\d+)()$/.exec(p);
    if (!m) throw new CmdError('invalid byte, character or field list');
    const a = m[1] ? +m[1] : 1;
    const b = m[2] ? +m[2] : (p.includes('-') ? Infinity : a);
    return [a, b];
  });
  return i => rs.some(([a, b]) => i >= a && i <= b);
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 's', val: 'dfc', long: { delimiter: 'd', fields: 'f', characters: 'c', 'only-delimited': 's' } });
    if (!o.f && !o.c) throw new CmdError('you must specify a list of bytes, characters, or fields', 1, true);
    const pick = ranges(o.f ?? o.c);
    const d = o.d ?? '\t';
    return withInputs(ctx, rest, async text => {
      for (const line of toLines(text)) {
        if (o.c) { await ctx.stdout.write([...line].filter((_, i) => pick(i + 1)).join('') + '\n'); continue; }
        if (!line.includes(d)) { if (!o.s) await ctx.stdout.write(line + '\n'); continue; }
        await ctx.stdout.write(line.split(d).filter((_, i) => pick(i + 1)).join(d) + '\n');
      }
    });
  },
};
