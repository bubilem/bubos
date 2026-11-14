import { CmdError } from '../../../core/util.js';
import { delGroup } from '../../../core/users.js';

export default {
  async run(ctx) {
    if (ctx.user.uid !== 0) throw new CmdError(ctx.t('perm.denied'), 1);
    if (ctx.args.length !== 1) throw new CmdError('Usage: groupdel GROUP', 2);
    const name = ctx.args[0];
    try { delGroup(ctx.fs, name); }
    catch (e) {
      if (e.message === 'group does not exist') throw new CmdError(`group '${name}' does not exist`, 6);
      if (e.message.startsWith('primary group of')) throw new CmdError(`cannot remove the primary group of user '${e.message.slice(17)}'`, 8);
      throw e;
    }
    return 0;
  },
};
