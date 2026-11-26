import { Logout, ScriptExit } from '../../../core/util.js';

export default {
  async run(ctx) {
    const sh = ctx.sh;
    const code = ctx.args[0] !== undefined ? (+ctx.args[0] & 255) : sh.status;
    if (sh.parent) throw new ScriptExit(code);
    await sh.finish(code, { stdin: ctx.stdin, stdout: ctx.stdout, stderr: ctx.stderr }); // trap EXIT
    if (sh.stack.length) { sh.popUser(); return 0; }
    await ctx.stdout.write('logout\n');
    throw new Logout();
  },
};
