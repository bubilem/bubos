import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'q', val: 'n', numeric: true, long: { lines: 'n', quiet: 'q' } });
    const n = o.num ?? (o.n !== undefined ? +o.n : 10);
    if (!Number.isInteger(n) || n < 0) throw new CmdError(`invalid number of lines: '${o.n}'`);
    const show = async (name, many) => {
      if (many) await ctx.stdout.write(`==> ${name === '-' ? 'standard input' : name} <==\n`);
    };
    if (!rest.length) {
      // čte po řádcích a po n-tém zavře vstup (aby `yes | head` skončilo)
      for (let i = 0; i < n; i++) {
        const l = await ctx.stdin.readLine();
        if (l === null) break;
        await ctx.stdout.write(l + '\n');
      }
      ctx.stdin.close();
      return 0;
    }
    let first = true;
    return ctx.each(rest, async a => {
      const text = a === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user);
      if (rest.length > 1 && !o.q) { await ctx.stdout.write((first ? '' : '\n') + `==> ${a} <==\n`); }
      first = false;
      const lines = text.split('\n');
      const endNl = text.endsWith('\n');
      const out = lines.slice(0, n).join('\n');
      await ctx.stdout.write(out + (lines.length > n || endNl ? (out || n ? '\n' : '') : ''));
    }, 'cannot open');
  },
};
