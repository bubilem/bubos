// bg: pozastavená úloha pokračuje na pozadí
export default {
  async run(ctx) {
    const sh = ctx.sh;
    const specs = ctx.args.length ? ctx.args : [undefined];
    let st = 0;
    for (const s of specs) {
      const job = sh.findJob(s);
      if (!job) { await ctx.stderr.write(`bash: bg: ${s ?? 'current'}: no such job\n`); st = 1; continue; }
      if (sh.jobState(job) === 'Running') { await ctx.stderr.write(`bash: bg: job ${job.n} already in background\n`); continue; }
      sh.resumeBg(job);
      await ctx.stdout.write(`[${job.n}]${sh.jobs.at(-1) === job ? '+' : ' '} ${sh.jobCmd(job)} &\n`);
    }
    return st;
  },
};
