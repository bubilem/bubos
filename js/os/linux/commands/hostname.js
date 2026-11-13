export default {
  async run(ctx) { await ctx.stdout.write(ctx.m.hostname + '\n'); },
};
