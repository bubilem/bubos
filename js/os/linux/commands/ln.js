import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { basename, resolvePath } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'sf', long: { symbolic: 's', force: 'f' } });
    if (!o.s) throw new CmdError('hard links are not supported in BubOS, use: ln -s TARGET LINK_NAME');
    if (!rest.length) throw new CmdError('missing file operand', 1, true);
    const target = rest[0];
    let link = rest[1] ?? basename(target);
    const { fs, user } = ctx;
    let p = ctx.path(link);
    try { if (fs.stat(p, user).type === 'dir') p = resolvePath(p, basename(target)); } catch { /* nový odkaz */ }
    if (o.f && fs.exists(p, user)) fs.unlink(p, user);
    return ctx.each([link], () => fs.symlink(target, p, user), 'failed to create symbolic link');
  },
};
