import { CmdError, sleep } from '../../../core/util.js';

export default {
  async run(ctx) {
    if (!ctx.args.length) throw new CmdError('missing operand', 1, true);
    let ms = 0;
    for (const a of ctx.args) {
      const m = /^(\d+(?:\.\d+)?|\.\d+)([smhd]?)$/.exec(a);
      if (!m) throw new CmdError(`invalid time interval '${a}'`, 1, true);
      ms += parseFloat(m[1]) * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]] * 1000;
    }
    await sleep(ms, ctx.signal);
  },
};
