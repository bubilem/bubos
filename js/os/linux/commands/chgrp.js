import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { resolvePath } from '../../../core/vfs.js';
import { getGroups } from '../../../core/users.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'R', long: { recursive: 'R' } });
    if (rest.length < 2) throw new CmdError(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand', 1, true);
    const name = rest.shift();
    const g = getGroups(ctx.fs).find(x => x.name === name || String(x.gid) === name);
    if (!g) throw new CmdError(`invalid group: '${name}'`);
    const { fs, user } = ctx;
    // běžný uživatel smí změnit skupinu jen svého souboru a jen na skupinu, jejímž je členem
    const apply = abs => {
      ctx.check();
      const n = fs.stat(abs, user, false);
      if (user.uid !== 0 && !user.gids?.includes(g.gid)) throw new CmdError(`changing group of '${abs}': Operation not permitted`);
      if (user.uid !== 0 && n.uid !== user.uid) throw new CmdError(`changing group of '${abs}': Operation not permitted`);
      fs.chown(abs, null, g.gid, user.uid === 0 ? user : null);
      if (o.R && n.type === 'dir') for (const nm of fs.readdir(abs, user)) apply(resolvePath(abs, nm));
    };
    return ctx.each(rest, a => apply(ctx.path(a)), 'changing group of');
  },
};
