import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { FsError, dirname, split } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'pv', val: 'm', long: { parents: 'p', verbose: 'v', mode: 'm' } });
    if (!rest.length) throw new CmdError('missing operand', 1, true);
    let mode;
    if (o.m !== undefined) {
      if (!/^[0-7]{1,4}$/.test(o.m)) throw new CmdError(`invalid mode '${o.m}'`);
      mode = parseInt(o.m, 8);
    }
    return ctx.each(rest, async a => {
      const p = ctx.path(a);
      if (o.p) {
        let cur = '';
        for (const part of split(p)) {
          cur += '/' + part;
          if (ctx.fs.exists(cur, ctx.user)) { if (ctx.fs.stat(cur, ctx.user).type !== 'dir') throw new FsError('ENOTDIR', a); continue; }
          ctx.fs.mkdir(cur, ctx.user, mode);
          if (o.v) await ctx.stdout.write(`mkdir: created directory '${cur === p ? a : cur}'\n`);
        }
        return;
      }
      ctx.fs.mkdir(p, ctx.user, mode);
      if (o.v) await ctx.stdout.write(`mkdir: created directory '${a}'\n`);
    }, 'cannot create directory');
  },
};
