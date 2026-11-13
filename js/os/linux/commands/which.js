import { whichPath } from '../lib.js';

export default {
  async run(ctx) {
    let st = 0;
    for (const a of ctx.args) {
      const p = whichPath(ctx.sh, a);
      if (p) await ctx.stdout.write(p + '\n'); else st = 1;
    }
    return st;
  },
};
