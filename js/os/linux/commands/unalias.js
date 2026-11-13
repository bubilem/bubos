export default {
  async run(ctx) {
    const al = ctx.sh.aliases;
    if (ctx.args[0] === '-a') { for (const k of Object.keys(al)) delete al[k]; return 0; }
    let st = 0;
    for (const a of ctx.args) {
      if (Object.hasOwn(al, a)) delete al[a];
      else { await ctx.stderr.write(`bash: unalias: ${a}: not found\n`); st = 1; }
    }
    return st;
  },
};
