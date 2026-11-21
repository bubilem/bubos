export default {
  async run(ctx) {
    const line = (ctx.args.length ? ctx.args.join(' ') : 'y') + '\n';
    for (;;) { await ctx.proc.pause(); await ctx.stdout.write(line); }
  },
};
