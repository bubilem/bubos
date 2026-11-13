import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { addUser } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'm', val: 'sGdc', long: { 'create-home': 'm', shell: 's', groups: 'G', home: 'd', comment: 'c' } });
    if (ctx.user.uid !== 0) throw new CmdError(ctx.t('perm.denied'));
    if (rest.length !== 1) throw new CmdError('Usage: useradd [options] LOGIN', 2);
    const name = rest[0];
    try {
      addUser(ctx.fs, { name, shell: o.s, createHome: !!o.m, groups: o.G ? o.G.split(',') : [], gecos: o.c ?? '', home: o.d });
    } catch (e) {
      const msg = { 'user exists': `user '${name}' already exists`, 'invalid user name': `invalid user name '${name}'`,
        'group exists': `group ${name} exists - if you want to add this user to that group, use -g.`, 'group does not exist': `group '${o.G}' does not exist` }[e.message];
      throw new CmdError(msg ?? e.message, e.message === 'user exists' ? 9 : 1);
    }
  },
};
