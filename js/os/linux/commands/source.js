import { CmdError } from '../../../core/util.js';
import { FsError } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    if (!ctx.args[0]) throw new CmdError('filename argument required', 2);
    try {
      return await ctx.sh.source(ctx.args[0], { stdin: ctx.stdin, stdout: ctx.stdout, stderr: ctx.stderr });
    } catch (e) {
      if (e instanceof FsError) throw new CmdError(`${ctx.args[0]}: ${ctx.fsMsg(e)}`);
      throw e;
    }
  },
};
