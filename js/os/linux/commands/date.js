import { getLang } from '../../../core/i18n.js';
import { fmtDate } from '../lib.js';

export default {
  async run(ctx) {
    const f = ctx.args.find(a => a.startsWith('+'));
    const fmt = f ? f.slice(1) : getLang() === 'cs' ? '%a %e. %b %Y, %H:%M:%S' : '%a %b %e %H:%M:%S %Y';
    await ctx.stdout.write(fmtDate(new Date(), fmt) + '\n');
  },
};
