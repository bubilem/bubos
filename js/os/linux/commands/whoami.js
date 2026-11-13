export default {
  async run(ctx) { await ctx.stdout.write(ctx.user.name + '\n'); },
};
