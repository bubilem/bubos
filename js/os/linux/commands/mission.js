// mission – stav a nápověda právě běžícího úkolu z kampaně (ovládání z terminálu; totéž dělá panel vedle terminálu)
import { CmdError } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';
import { pick } from '../../../core/mission.js';

export default {
  async run(ctx) {
    const run = ctx.m.mission, sub = ctx.args[0] ?? 'status', lang = getLang(), w = s => ctx.stdout.write(s + '\n');
    if (!['status', 'hint', 'restart', 'quit'].includes(sub)) throw new CmdError(ctx.t('mission.usage'), 2);
    if (!run) throw new CmdError(ctx.t('mission.none'));
    const b = ctx.stdout.isTTY ? s => `\x1b[1m${s}\x1b[0m` : s => s;
    if (sub === 'hint') {
      const h = run.hint(lang);
      await w(ctx.t('mission.hint', { n: h.n, total: h.total, text: h.text }));
    } else if (sub === 'restart') {
      await w(ctx.t('mission.restarting'));
      run.hooks.restart?.();
    } else if (sub === 'quit') {
      await w(ctx.t('mission.quitting'));
      run.hooks.quit?.();
    } else {
      const m = run.mission, mark = ok => (ok ? '[x]' : '[ ]');
      await w(b(pick(m.title, lang)));
      await w(pick(m.brief, lang));
      await w('\n' + b(ctx.t('mission.goals')));
      m.goals.forEach((g, i) => w(`  ${mark(run.goals[i])} ${pick(g.text, lang)}`));
      await w('\n' + b(ctx.t('mission.bonus')));
      m.bonus.forEach((g, i) => w(`  ${mark(run.bonusDone[i])} ${pick(g.text, lang)}`));
      await w('\n' + ctx.t('mission.hints', { n: run.hints, total: m.hints.length }));
      if (run.done) await w(ctx.t('mission.done', { stars: run.stars }));
    }
    return 0;
  },
};
