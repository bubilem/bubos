import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { resolvePath } from '../../../core/vfs.js';
import { findUser, getGroups } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'R', long: { recursive: 'R' } });
    if (rest.length < 2) throw new CmdError(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand', 1, true);
    const spec = rest.shift();
    const [uname, gname] = spec.split(':');
    let uid = null, gid = null;
    if (uname) {
      const u = findUser(ctx.fs, uname);
      if (!u) throw new CmdError(`invalid user: '${uname}'`);
      uid = u.uid;
    }
    if (gname) {
      const g = getGroups(ctx.fs).find(x => x.name === gname || String(x.gid) === gname);
      if (!g) throw new CmdError(`invalid group: '${gname}'`);
      gid = g.gid;
    }
    const { fs, user } = ctx;
    const apply = abs => {
      ctx.check();
      const n = fs.stat(abs, user, false);
      fs.chown(abs, uid, gid, user);
      if (o.R && n.type === 'dir') for (const nm of fs.readdir(abs, user)) apply(resolvePath(abs, nm));
    };
    return ctx.each(rest, a => apply(ctx.path(a)), 'changing ownership of');
  },
};
