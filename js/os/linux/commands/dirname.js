import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    if (!ctx.args.length) throw new CmdError('missing operand', 1, true);
    for (const a of ctx.args) {
      const p = a.replace(/\/+$/, '');
      const i = p.lastIndexOf('/');
      await ctx.stdout.write((i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)) + '\n');
    }
  },
};
