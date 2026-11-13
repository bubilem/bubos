export default {
  async run(ctx) {
    const line = (ctx.args.length ? ctx.args.join(' ') : 'y') + '\n';
    for (;;) { ctx.check(); await ctx.stdout.write(line); }
  },
};
