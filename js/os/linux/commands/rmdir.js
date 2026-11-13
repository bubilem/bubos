import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const { rest } = parseArgs(ctx.args, {});
    if (!rest.length) throw new CmdError('missing operand', 1, true);
    return ctx.each(rest, a => ctx.fs.rmdir(ctx.path(a), ctx.user), 'failed to remove');
  },
};
