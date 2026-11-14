import { CmdError, FuncReturn } from '../../../core/util.js';

// return [N] – ukončí funkci (nebo sourcovaný skript) s návratovým kódem N
export default {
  async run(ctx) {
    let code = ctx.sh.status;
    if (ctx.args[0] !== undefined) {
      code = +ctx.args[0];
      if (!Number.isInteger(code)) throw new CmdError(`${ctx.args[0]}: numeric argument required`, 2);
    }
    throw new FuncReturn(code & 255);
  },
};
