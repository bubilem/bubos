import { CmdError } from '../../../core/util.js';
import { arith } from '../../../core/shell/expand.js';

// let VÝRAZ… – aritmetika s proměnnými; vrací 0, je-li poslední výsledek nenulový
export default {
  async run(ctx) {
    if (!ctx.args.length) throw new CmdError('expression expected');
    let v = 0;
    for (const e of ctx.args) v = arith(e, ctx.sh);
    return v ? 0 : 1;
  },
};
