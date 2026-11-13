export default {
  async run(ctx) {
    for (const [k, v] of Object.entries(ctx.env)) await ctx.stdout.write(`${k}=${v}\n`);
  },
};
