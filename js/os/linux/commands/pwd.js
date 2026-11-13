export default {
  async run(ctx) { await ctx.stdout.write(ctx.sh.cwd + '\n'); },
};
