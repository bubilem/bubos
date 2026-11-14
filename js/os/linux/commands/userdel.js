import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { delUser, findUser } from '../../../core/users.js';

// Smaže adresář i s obsahem (bez kontroly práv – běží jen pro root)
function removeTree(fs, p) {
  const n = fs.lstat(p, null);
  if (n.type === 'dir') { for (const c of fs.readdir(p, null)) removeTree(fs, p + '/' + c); fs.rmdir(p, null); }
  else fs.unlink(p, null);
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'rf', long: { remove: 'r', force: 'f' } });
    if (ctx.user.uid !== 0) throw new CmdError(ctx.t('perm.denied'), 1);
    if (rest.length !== 1) throw new CmdError('Usage: userdel [options] LOGIN', 2);
    const name = rest[0], u = findUser(ctx.fs, name);
    if (!u) throw new CmdError(`user '${name}' does not exist`, 6);
    if (u.uid === 0 || u.name === ctx.user.name) throw new CmdError(`user ${name} is currently used by process ${ctx.sh.proc.pid}`, 8);
    delUser(ctx.fs, name);
    if (o.r) { try { removeTree(ctx.fs, u.home); } catch { /* domovský adresář nebyl */ } }
    return 0;
  },
};
