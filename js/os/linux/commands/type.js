import { whichPath } from '../lib.js';

export default {
  async run(ctx) {
    const sh = ctx.sh;
    let st = 0;
    for (const a of ctx.args) {
      if (Object.hasOwn(sh.aliases, a)) await ctx.stdout.write(`${a} is aliased to \`${sh.aliases[a]}'\n`);
      else if (ctx.os.shellOnly.includes(a)) await ctx.stdout.write(`${a} is a shell builtin\n`);
      else {
        const p = whichPath(sh, a);
        if (p) await ctx.stdout.write(`${a} is ${p}\n`);
        else { await ctx.stderr.write(`bash: type: ${a}: not found\n`); st = 1; }
      }
    }
    return st;
  },
};
