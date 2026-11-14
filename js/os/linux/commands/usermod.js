import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { modUser } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'aLU', val: 'Gsdlc', long: { append: 'a', groups: 'G', shell: 's', home: 'd', login: 'l', comment: 'c', lock: 'L', unlock: 'U' } });
    if (ctx.user.uid !== 0) throw new CmdError(ctx.t('perm.denied'), 1);
    if (rest.length !== 1) throw new CmdError('Usage: usermod [options] LOGIN', 2);
    const name = rest[0];
    if (o.a && !o.G) throw new CmdError('-a flag is meaningful only with -G', 2);
    const patch = {};
    if (o.G !== undefined) { patch.groups = o.G.split(',').filter(Boolean); patch.append = !!o.a; }
    if (o.s !== undefined) patch.shell = o.s;
    if (o.d !== undefined) patch.home = o.d;
    if (o.l !== undefined) patch.name = o.l;
    if (o.c !== undefined) patch.gecos = o.c;
    if (o.L) patch.lock = true;
    if (o.U) patch.lock = false;
    if (!Object.keys(patch).length) return 0;
    try { modUser(ctx.fs, name, patch); }
    catch (e) {
      const m = e.message;
      if (m === 'user does not exist') throw new CmdError(`user '${name}' does not exist`, 6);
      if (m === 'user exists') throw new CmdError(`user '${o.l}' already exists`, 9);
      if (m === 'invalid user name') throw new CmdError(`invalid user name '${o.l}'`, 3);
      if (m.startsWith('group does not exist: ')) throw new CmdError(`group '${m.slice(22)}' does not exist`, 6);
      throw e;
    }
    return 0;
  },
};
