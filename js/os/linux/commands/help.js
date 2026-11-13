import { getLang } from '../../../core/i18n.js';

// Popis příkazu = text za " - " v řádku pod nadpisem NAME / JMÉNO v manuálové stránce
export function describe(page) {
  const m = /^\s+\S+(?:, \S+)* [-–] (.+)$/m.exec(page ?? '');
  return m ? m[1] : '';
}

export default {
  async run(ctx) {
    if (ctx.args[0]) return ctx.exec(['man', ctx.args[0]]);
    const pages = await ctx.os.loadMan(getLang());
    const t = ctx.t;
    await ctx.stdout.write(`\x1b[1m${t('help.title')}\x1b[0m\n${t('help.tips')}\n\n`);
    for (const c of ctx.os.commands) {
      if (['[', '.', 'logout'].includes(c)) continue;
      await ctx.stdout.write(`  \x1b[1;32m${c.padEnd(10)}\x1b[0m ${describe(pages[c])}\n`);
    }
    await ctx.stdout.write(`\n${t('help.more')}\n`);
  },
};
