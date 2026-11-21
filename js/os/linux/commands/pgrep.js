import { CmdError } from '../../../core/util.js';
import { sigNumber } from '../../../core/process.js';

// pgrep / pkill / killall v jednom modulu (liší se jen tím, co s nalezenými procesy dělají)
export default {
  async run(ctx) {
    const which = ctx.argv[0].split('/').pop();
    const kill = which !== 'pgrep';
    const args = ctx.args.slice();
    let full = false, exact = which === 'killall', list = false, owner = null, sig = 15, pattern;
    while (args.length) {
      const a = args.shift();
      if (a === '--') { pattern = args.shift(); break; }
      if (!a.startsWith('-') || a === '-') { pattern = a; break; }
      if (kill && /^-([A-Za-z]+|\d+)$/.test(a) && sigNumber(a.slice(1)) !== null) { sig = sigNumber(a.slice(1)); continue; }
      for (let i = 1; i < a.length; i++) {
        const c = a[i];
        if (c === 'f') full = true;
        else if (c === 'x') exact = true;
        else if (c === 'l' && !kill) list = true;
        else if (c === 'u') { owner = a.slice(i + 1) || args.shift(); break; }
        else if (c === 's' && kill) { const s = sigNumber(a.slice(i + 1) || args.shift() || ''); if (s === null) throw new CmdError('invalid signal', 2); sig = s; break; }
        else throw new CmdError(`invalid option -- '${c}'`, 2);
      }
    }
    if (pattern === undefined) throw new CmdError(`no matching criteria specified\nTry \`${which} --help' for more information.`, 2);
    let re;
    try { re = new RegExp(exact ? `^(?:${pattern})$` : pattern); } catch { throw new CmdError(`invalid regular expression '${pattern}'`, 2); }
    const hits = ctx.m.procs.list().filter(p => {
      if (!p.cmd || p.pid === ctx.proc.pid || p.cmd === '-bash' || p.pid <= 2) return false;
      if (owner && p.user !== owner) return false;
      const name = p.cmd.split(' ')[0].split('/').pop();
      return re.test(full ? p.cmd : name);
    });
    if (!hits.length) {
      if (which === 'killall') throw new CmdError(`${pattern}: no process found`, 1);
      return 1;
    }
    if (!kill) {
      for (const p of hits) await ctx.stdout.write(list ? `${p.pid} ${p.cmd.split(' ')[0].split('/').pop()}\n` : `${p.pid}\n`);
      return 0;
    }
    let st = 0;
    for (const p of hits) {
      if (ctx.user.uid !== 0 && p.user !== ctx.user.name) { await ctx.stderr.write(`${which}: killing pid ${p.pid} failed: Operation not permitted\n`); st = 1; continue; }
      p.deliver(sig);
      if ((p.sys || p.daemon) && [1, 2, 3, 9, 15].includes(sig)) ctx.m.procs.end(p);
    }
    return st;
  },
};
