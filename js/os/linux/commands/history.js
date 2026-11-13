export default {
  async run(ctx) {
    const sh = ctx.sh;
    if (ctx.args[0] === '-c') { sh.clearHistory(); return 0; }
    const n = ctx.args[0] !== undefined ? +ctx.args[0] : sh.history.length;
    if (!Number.isInteger(n) || n < 0) { await ctx.stderr.write(`bash: history: ${ctx.args[0]}: numeric argument required\n`); return 1; }
    const start = Math.max(0, sh.history.length - n);
    for (let i = start; i < sh.history.length; i++) await ctx.stdout.write(`${String(i + 1).padStart(5)}  ${sh.history[i]}\n`);
  },
};
