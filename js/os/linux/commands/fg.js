// fg: úloha se vrátí na popředí. Čekání obstará shell (adopt), tento příkaz jen vypíše příkaz a probudí procesy.
export default {
  async run(ctx) {
    const sh = ctx.sh;
    const job = sh.findJob(ctx.args[0]);
    if (!job) { await ctx.stderr.write(`bash: fg: ${ctx.args[0] ?? 'current'}: no such job\n`); return 1; }
    await ctx.stdout.write(sh.jobCmd(job) + '\n');
    sh.adopt(job);
    return 0;
  },
};
