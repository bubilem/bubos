export default {
  async run(ctx) {
    const sh = ctx.sh, flags = ctx.args.join('');
    const spec = ctx.args.filter(a => !a.startsWith('-'));
    const jobs = spec.length ? spec.map(s => sh.findJob(s)) : sh.jobs;
    let st = 0;
    for (const [i, j] of jobs.entries()) {
      if (!j) { await ctx.stderr.write(`bash: jobs: ${spec[i]}: no such job\n`); st = 1; continue; }
      if (flags.includes('p')) await ctx.stdout.write(`${j.top[0].pid}\n`);
      else {
        let line = sh.jobLine(j);
        if (flags.includes('l')) line = line.replace(/^(\[\d+\][+ -])  /, `$1 ${j.top[0].pid} `);
        await ctx.stdout.write(line + '\n');
      }
    }
    return st;
  },
};
