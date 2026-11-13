const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

export default {
  async run(ctx) {
    const flags = new Set(ctx.args.join('').replace(/-/g, ''));
    const all = flags.has('e') || flags.has('A') || (flags.has('a') && flags.has('x')) || flags.has('x') && flags.has('u');
    let procs = ctx.m.procs.list().filter(p => p.cmd);
    if (!all) procs = procs.filter(p => p.user === ctx.user.name && !p.sys);
    const out = [];
    if (flags.has('u')) {
      out.push('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
      for (const p of procs)
        out.push(`${p.user.padEnd(8)} ${String(p.pid).padStart(6)}  0.${p.pid % 10}  0.${p.pid % 7} ${String(10000 + (p.pid % 90) * 100).padStart(6)} ${String(1000 + (p.pid % 50) * 40).padStart(5)} ${p.sys ? '?' : 'pts/0'}${p.sys ? '    ' : ' '}   ${p.sys ? 'Ss' : 'R+'}   ${hhmm(p.start)}   0:00 ${p.cmd}`);
    } else if (flags.has('f')) {
      out.push('UID          PID    PPID  C STIME TTY          TIME CMD');
      for (const p of procs)
        out.push(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  0 ${hhmm(p.start)} ${(p.sys ? '?' : 'pts/0').padEnd(8)} 00:00:00 ${p.cmd}`);
    } else {
      out.push('    PID TTY          TIME CMD');
      for (const p of procs) out.push(`${String(p.pid).padStart(7)} ${(p.sys ? '?' : 'pts/0').padEnd(8)} 00:00:00 ${p.sys ? p.cmd : p.cmd.split(' ')[0]}`);
    }
    await ctx.stdout.write(out.join('\n') + '\n');
  },
};
