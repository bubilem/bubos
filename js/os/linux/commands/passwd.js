import { CmdError, sleep } from '../../../core/util.js';
import { checkPassword, findUser, needsPassword, setPassword } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { fs, user, tty, t } = ctx;
    const target = ctx.args[0] ?? user.name;
    if (!findUser(fs, target)) throw new CmdError(`user '${target}' does not exist`);
    if (target !== user.name && user.uid !== 0) throw new CmdError(t('passwd.deny', { user: target }));
    await ctx.stdout.write(`passwd: ${t('passwd.changing', { user: target })}\n`);
    if (user.uid !== 0 && needsPassword(fs, target)) {
      const cur = await tty.ask(t('passwd.cur'), { silent: true });
      if (!checkPassword(fs, target, cur ?? '')) { await sleep(700, ctx.signal); throw new CmdError(t('auth.fail')); }
    }
    const p1 = await tty.ask(t('passwd.new'), { silent: true });
    const p2 = await tty.ask(t('passwd.retype'), { silent: true });
    if (p1 !== p2) throw new CmdError(t('passwd.mismatch'));
    if (!p1) throw new CmdError(t('passwd.empty'));
    setPassword(fs, target, p1);
    await ctx.stdout.write(`passwd: ${t('passwd.ok')}\n`);
  },
};
