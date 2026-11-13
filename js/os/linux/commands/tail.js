import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { toLines } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'q', val: 'n', numeric: true, long: { lines: 'n', quiet: 'q' } });
    const n = o.num ?? (o.n !== undefined ? +o.n : 10);
    if (!Number.isInteger(n) || n < 0) throw new CmdError(`invalid number of lines: '${o.n}'`);
    const out = async text => {
      const lines = toLines(text);
      const part = n === 0 ? [] : lines.slice(-n);
      if (part.length) await ctx.stdout.write(part.join('\n') + '\n');
    };
    if (!rest.length) { await out(await ctx.stdin.readAll()); return 0; }
    let first = true;
    return ctx.each(rest, async a => {
      const text = a === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user);
      if (rest.length > 1 && !o.q) await ctx.stdout.write((first ? '' : '\n') + `==> ${a} <==\n`);
      first = false;
      await out(text);
    }, 'cannot open');
  },
};
