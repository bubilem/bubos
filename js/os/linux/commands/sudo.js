import { parseArgs } from '../../../core/args.js';
import { CmdError, sleep } from '../../../core/util.js';
import { checkPassword, getGroups, needsPassword, sessionUser } from '../../../core/users.js';

const TTL = 5 * 60 * 1000;

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'isk', val: 'u', stop: true });
    const { fs, m, user } = ctx;
    if (o.k) { m.sudoUntil.delete(user.name); return 0; }
    if (!rest.length && !o.i && !o.s) throw new CmdError('a command is required', 1, true);
    const target = sessionUser(fs, o.u ?? 'root');
    if (!target) throw new CmdError(`unknown user ${o.u}`);

    if (user.uid !== 0) {
      const allowed = getGroups(fs).some(g => (g.name === 'sudo' || g.name === 'wheel') && g.members.includes(user.name));
      if (!allowed) throw new CmdError(ctx.t('sudo.notallowed', { user: user.name }));
      if (needsPassword(fs, user.name) && !((m.sudoUntil.get(user.name) ?? 0) > Date.now())) {
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) {
          const pw = await ctx.tty.ask(ctx.t('sudo.prompt', { user: user.name }), { silent: true });
          ok = checkPassword(fs, user.name, pw ?? '');
          if (!ok) { await sleep(600, ctx.signal); if (i < 2) await ctx.stderr.write(ctx.t('sudo.badpw') + '\n'); }
        }
        if (!ok) throw new CmdError(ctx.t('sudo.fail'));
        m.sudoUntil.set(user.name, Date.now() + TTL);
      }
    }
    if (rest.join(' ') === 'make me a sandwich') { await ctx.stdout.write('Okay.\n'); return 0; }
    if (o.i || o.s) { await ctx.sh.pushUser(target, !!o.i); return 0; }
    const env = { ...ctx.env, USER: target.name, LOGNAME: target.name, HOME: target.home };
    return ctx.exec(rest, { user: target, env });
  },
};
