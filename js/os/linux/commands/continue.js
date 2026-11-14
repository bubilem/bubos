import { CmdError, LoopCtl } from '../../../core/util.js';

// continue [N] – přeskočí zbytek těla smyčky a pokračuje další iterací
export default {
  async run(ctx) {
    const n = ctx.args[0] === undefined ? 1 : +ctx.args[0];
    if (!Number.isInteger(n) || n < 1) throw new CmdError(`${ctx.args[0]}: loop count out of range`);
    throw new LoopCtl('continue', n);
  },
};
