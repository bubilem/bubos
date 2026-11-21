import { CmdError } from '../../../core/util.js';
import { SIGNALS, sigNumber } from '../../../core/process.js';

const list = () => Object.entries(SIGNALS).map(([n, s]) => `${String(n).padStart(2)}) SIG${s}`).join('\t') + '\n';

export default {
  async run(ctx) {
    const args = ctx.args.slice();
    if (args[0] === '-l' || args[0] === '-L') {
      if (args.length === 1) { await ctx.stdout.write(list()); return 0; }
      let st = 0;
      for (const a of args.slice(1)) {
        const n = sigNumber(a);
        if (n === null) { await ctx.stderr.write(`bash: kill: ${a}: invalid signal specification\n`); st = 1; }
        else await ctx.stdout.write(/^\d+$/.test(a) ? SIGNALS[n] + '\n' : n + '\n');
      }
      return st;
    }
    let sig = 15;
    const a0 = args[0] ?? '';
    if (a0 === '-s' || a0 === '-n') {
      const s = sigNumber(args[1] ?? '');
      if (args[1] === undefined) throw new CmdError(`${a0}: option requires an argument`, 2);
      if (s === null) { await ctx.stderr.write(`bash: kill: ${args[1]}: invalid signal specification\n`); return 1; }
      sig = s; args.splice(0, 2);
    } else if (/^-[A-Za-z0-9]+$/.test(a0)) {
      const s = sigNumber(a0.slice(1));
      if (s === null) { await ctx.stderr.write(`bash: kill: ${a0.slice(1)}: invalid signal specification\n`); return 1; }
      sig = s; args.shift();
    }
    if (!args.length) throw new CmdError('usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 2);

    const send = p => {
      if (p.pid === 1) return false;
      p.deliver(sig);
      if ((p.sys || p.daemon) && (sig === 9 || sig === 15 || sig === 1 || sig === 2 || sig === 3)) ctx.m.procs.end(p);
      return true;
    };
    let st = 0;
    for (const a of args) {
      if (a.startsWith('%')) {
        const job = ctx.sh.findJob(a);
        if (!job) { await ctx.stderr.write(`bash: kill: ${a}: no such job\n`); st = 1; continue; }
        for (const p of job.procs) send(p);
        continue;
      }
      const p = /^\d+$/.test(a) ? ctx.m.procs.get(+a) : null;
      if (!/^\d+$/.test(a)) { await ctx.stderr.write(`bash: kill: ${a}: arguments must be process or job IDs\n`); st = 1; }
      else if (!p) { await ctx.stderr.write(`bash: kill: (${a}) - No such process\n`); st = 1; }
      else if (ctx.user.uid !== 0 && p.user !== ctx.user.name) { await ctx.stderr.write(`bash: kill: (${a}) - Operation not permitted\n`); st = 1; }
      else if (!send(p)) { await ctx.stderr.write(`bash: kill: (${a}) - Operation not permitted\n`); st = 1; }
    }
    return st;
  },
};
