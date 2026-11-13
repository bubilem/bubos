import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const args = ctx.args.slice();
    if (args[0] === '-l') { await ctx.stdout.write(' 1) SIGHUP\t 2) SIGINT\t 9) SIGKILL\t15) SIGTERM\n'); return 0; }
    if (args[0] && /^-(\d+|[A-Za-z]+)$/.test(args[0])) args.shift();
    if (!args.length) throw new CmdError('usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 2);
    let st = 0;
    for (const a of args) {
      const p = /^\d+$/.test(a) ? ctx.m.procs.get(+a) : null;
      if (!/^\d+$/.test(a)) { await ctx.stderr.write(`bash: kill: ${a}: arguments must be process or job IDs\n`); st = 1; }
      else if (!p) { await ctx.stderr.write(`bash: kill: (${a}) - No such process\n`); st = 1; }
      else if (ctx.user.uid !== 0 && p.user !== ctx.user.name) { await ctx.stderr.write(`bash: kill: (${a}) - Operation not permitted\n`); st = 1; }
      else if (p.pid === 1) { await ctx.stderr.write(`bash: kill: (${a}) - Operation not permitted\n`); st = 1; }
      else { p.ac.abort(); if (p.sys) ctx.m.procs.end(p); }
    }
    return st;
  },
};
