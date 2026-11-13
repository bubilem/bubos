import { parseArgs } from '../../../core/args.js';
import { CmdError, sleep } from '../../../core/util.js';
import { checkPassword, needsPassword, sessionUser } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'l', long: { login: 'l' } });
    let login = !!o.l, target = 'root';
    for (const a of rest) { if (a === '-') login = true; else target = a; }
    const u = sessionUser(ctx.fs, target);
    if (!u) throw new CmdError(`user ${target} does not exist or the user entry does not contain all the required fields`);
    if (ctx.user.uid !== 0 && needsPassword(ctx.fs, u.name)) {
      const pw = await ctx.tty.ask(ctx.t('pw.prompt'), { silent: true });
      if (!checkPassword(ctx.fs, u.name, pw ?? '')) { await sleep(700, ctx.signal); throw new CmdError(ctx.t('auth.fail')); }
    } else if (ctx.user.uid !== 0 && !needsPassword(ctx.fs, u.name) && !checkPassword(ctx.fs, u.name, '')) {
      throw new CmdError(ctx.t('auth.fail'));
    }
    await ctx.sh.pushUser(u, login);
  },
};
