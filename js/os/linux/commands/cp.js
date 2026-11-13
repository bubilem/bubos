import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { FsError, basename, resolvePath } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'rRvn', long: { recursive: 'r', verbose: 'v', 'no-clobber': 'n' } });
    const rec = o.r || o.R;
    if (rest.length < 2) throw new CmdError(rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand', 1, true);
    const { fs, user } = ctx;
    const destArg = rest.pop();
    const dest = ctx.path(destArg);
    let destIsDir = false;
    try { destIsDir = fs.stat(dest, user).type === 'dir'; } catch { /* neexistuje */ }
    if (rest.length > 1 && !destIsDir) throw new CmdError(`target '${destArg}' is not a directory`);

    const copy = async (src, dst, shown) => {
      ctx.check();
      const n = fs.stat(src, user, false);
      if (n.type === 'dir') {
        if (!rec) throw new CmdError(`-r not specified; omitting directory '${shown}'`);
        if (dst === src || dst.startsWith(src + '/')) throw new CmdError(`cannot copy a directory, '${shown}', into itself`);
        if (!fs.exists(dst, user)) { fs.mkdir(dst, user, n.mode & 0o777); }
        for (const nm of fs.readdir(src, user)) await copy(resolvePath(src, nm), resolvePath(dst, nm), shown + '/' + nm);
      } else if (n.type === 'link') {
        if (!fs.exists(dst, user)) fs.symlink(n.target, dst, user);
      } else {
        if (o.n && fs.exists(dst, user)) return;
        const existed = fs.exists(dst, user);
        fs.write(dst, fs.read(src, user), user);
        if (!existed) fs.chmod(dst, n.mode & 0o777 & ~fs.umask, user);
      }
      if (o.v) await ctx.stdout.write(`'${shown}' -> '${dst}'\n`);
    };
    return ctx.each(rest, async a => {
      const src = ctx.path(a);
      fs.stat(src, user, false);
      const dst = destIsDir ? resolvePath(dest, basename(src) || 'root') : dest;
      if (dst === src) throw new CmdError(`'${a}' and '${destArg}' are the same file`);
      await copy(src, dst, a);
    }, 'cannot stat');
  },
};
