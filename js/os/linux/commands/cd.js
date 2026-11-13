import { CmdError } from '../../../core/util.js';
import { FsError, can, X } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const sh = ctx.sh;
    if (ctx.args.length > 1) throw new CmdError('too many arguments');
    let target = ctx.args[0];
    if (target === undefined || target === '~') {
      target = sh.vars.HOME;
      if (!target) throw new CmdError('HOME not set');
    } else if (target === '-') {
      target = sh.vars.OLDPWD;
      if (!target) throw new CmdError('OLDPWD not set');
      await ctx.stdout.write(target + '\n');
    }
    const abs = ctx.path(target);
    try {
      const n = ctx.fs.stat(abs, ctx.user);
      if (n.type !== 'dir') throw new FsError('ENOTDIR');
      if (!can(n, ctx.user, X)) throw new FsError('EACCES');
    } catch (e) {
      if (e instanceof FsError) throw new CmdError(`${ctx.args[0] ?? target}: ${ctx.fsMsg(e)}`);
      throw e;
    }
    sh.vars.OLDPWD = sh.cwd;
    sh.cwd = abs;
    sh.vars.PWD = abs;
  },
};
