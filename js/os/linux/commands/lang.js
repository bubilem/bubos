import { CmdError } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';

export default {
  async run(ctx) {
    const l = ctx.args[0];
    if (!l) { await ctx.stdout.write(`${getLang()}  (${ctx.t('lang.usage')})\n`); return 0; }
    if (!['cs', 'en'].includes(l)) throw new CmdError(ctx.t('lang.usage'));
    ctx.m.setSetting('lang', l);
    await ctx.stdout.write(ctx.t('lang.changed') + '\n');
  },
};
