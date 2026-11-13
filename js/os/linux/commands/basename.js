import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    if (!ctx.args.length) throw new CmdError('missing operand', 1, true);
    let p = ctx.args[0].replace(/\/+$/, '') || '/';
    let b = p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1);
    const suf = ctx.args[1];
    if (suf && b.endsWith(suf) && b !== suf) b = b.slice(0, -suf.length);
    await ctx.stdout.write(b + '\n');
  },
};
