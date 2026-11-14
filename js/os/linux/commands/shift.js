import { CmdError } from '../../../core/util.js';

// shift [N] – posune poziční parametry ($2 se stane $1 …)
export default {
  async run(ctx) {
    const n = ctx.args[0] === undefined ? 1 : +ctx.args[0];
    if (!Number.isInteger(n) || n < 0) throw new CmdError(`${ctx.args[0]}: shift count out of range`);
    if (n > ctx.sh.args.length) return 1;
    ctx.sh.args.splice(0, n);
    return 0;
  },
};
