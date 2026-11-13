export default {
  async run(ctx) {
    if (!ctx.args.length) {
      for (const [k, v] of Object.entries(ctx.env)) await ctx.stdout.write(`${k}=${v}\n`);
      return 0;
    }
    let st = 0;
    for (const a of ctx.args) { if (Object.hasOwn(ctx.env, a)) await ctx.stdout.write(ctx.env[a] + '\n'); else st = 1; }
    return st;
  },
};
