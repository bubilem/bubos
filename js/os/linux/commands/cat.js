import { parseArgs } from '../../../core/args.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'nA', long: { number: 'n' } });
    let ln = 0;
    const out = async s => {
      if (o.n) {
        const lines = s.split('\n'), endNl = s.endsWith('\n');
        if (endNl) lines.pop();
        s = lines.map(l => `${String(++ln).padStart(6)}\t${l}`).join('\n') + (endNl ? '\n' : '');
      }
      await ctx.stdout.write(s);
    };
    const fromStdin = async () => { for (let s; (s = await ctx.stdin.read()) !== null;) await out(s); };
    if (!rest.length) { await fromStdin(); return 0; }
    return ctx.each(rest, async a => {
      if (a === '-') await fromStdin();
      else await out(ctx.fs.read(ctx.path(a), ctx.user));
    });
  },
};
