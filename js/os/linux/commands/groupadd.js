import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { addGroup } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { val: 'g', long: { gid: 'g' } });
    if (ctx.user.uid !== 0) throw new CmdError(ctx.t('perm.denied'), 1);
    if (rest.length !== 1) throw new CmdError('Usage: groupadd [options] GROUP', 2);
    const name = rest[0];
    if (o.g !== undefined && !/^\d+$/.test(o.g)) throw new CmdError(`invalid group ID '${o.g}'`, 3);
    try { addGroup(ctx.fs, name, o.g === undefined ? undefined : +o.g); }
    catch (e) {
      const msg = { 'group exists': `group '${name}' already exists`, 'invalid group name': `'${name}' is not a valid group name`, 'gid exists': `GID '${o.g}' already exists` }[e.message];
      throw new CmdError(msg ?? e.message, e.message === 'invalid group name' ? 3 : 9);
    }
    return 0;
  },
};
