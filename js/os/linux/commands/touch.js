import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'c' });
    if (!rest.length) throw new CmdError('missing file operand', 1, true);
    return ctx.each(rest, a => {
      const p = ctx.path(a);
      if (o.c && !ctx.fs.exists(p, ctx.user)) return;
      ctx.fs.touch(p, ctx.user);
    }, 'cannot touch');
  },
};
