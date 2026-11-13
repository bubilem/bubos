import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { basename, resolvePath } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'vnf', long: { verbose: 'v', 'no-clobber': 'n', force: 'f' } });
    if (rest.length < 2) throw new CmdError(rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand', 1, true);
    const { fs, user } = ctx;
    const destArg = rest.pop();
    const dest = ctx.path(destArg);
    let destIsDir = false;
    try { destIsDir = fs.stat(dest, user).type === 'dir'; } catch { /* neexistuje */ }
    if (rest.length > 1 && !destIsDir) throw new CmdError(`target '${destArg}' is not a directory`);
    return ctx.each(rest, async a => {
      const src = ctx.path(a);
      const dst = destIsDir ? resolvePath(dest, basename(src)) : dest;
      fs.stat(src, user, false);
      if (o.n && fs.exists(dst, user)) return;
      fs.rename(src, dst, user);
      if (o.v) await ctx.stdout.write(`renamed '${a}' -> '${dst}'\n`);
    }, 'cannot stat');
  },
};
