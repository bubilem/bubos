import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { FsError, resolvePath } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, {
      bool: 'rRfvd', long: { recursive: 'r', force: 'f', verbose: 'v', dir: 'd', 'no-preserve-root': 'N' },
    });
    const rec = o.r || o.R;
    if (!rest.length) { if (o.f) return 0; throw new CmdError('missing operand', 1, true); }
    const { fs, user } = ctx;
    const rmTree = async (p, shown) => {
      ctx.check();
      const n = fs.stat(p, user, false);
      if (n.type === 'dir') {
        if (!rec && !o.d) throw new FsError('EISDIR', shown);
        if (rec) for (const nm of fs.readdir(p, user)) await rmTree(resolvePath(p, nm), shown + '/' + nm);
        fs.rmdir(p, user);
      } else fs.unlink(p, user);
      if (o.v) await ctx.stdout.write(`removed '${shown}'\n`);
    };
    return ctx.each(rest, async a => {
      const p = ctx.path(a);
      if (p === '/' && rec && !o.N) throw new CmdError("it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe");
      if (a === '.' || a === '..' || a.endsWith('/.') || a.endsWith('/..')) throw new CmdError(`refusing to remove '.' or '..' directory: skipping '${a}'`);
      try { await rmTree(p, a); }
      catch (e) { if (o.f && e instanceof FsError && e.code === 'ENOENT') return; throw e; }
    }, 'cannot remove');
  },
};
