import { CmdError } from '../../../core/util.js';

// Jen EXIT se opravdu provádí; ostatní signály se pouze zapamatují
const NAMES = { 0: 'EXIT', 1: 'HUP', 2: 'INT', 3: 'QUIT', 15: 'TERM' };
const sigName = s => {
  if (/^\d+$/.test(s)) return NAMES[+s] ?? null;
  const n = s.toUpperCase().replace(/^SIG/, '');
  return Object.values(NAMES).includes(n) ? n : null;
};

// trap ['příkazy' | -] SIGNÁL...
export default {
  async run(ctx) {
    const sh = ctx.sh;
    let args = ctx.args;
    if (!args.length || args[0] === '-p') {
      for (const [sig, cmd] of Object.entries(sh.traps))
        await ctx.stdout.write(`trap -- '${cmd.replace(/'/g, "'\\''")}' ${sig}\n`);
      return 0;
    }
    if (args[0] === '--') args = args.slice(1);
    // jediný argument = zruš nastavení daného signálu
    const [action, sigs] = args.length === 1 ? ['-', args] : [args[0], args.slice(1)];
    let st = 0;
    for (const s of sigs) {
      const name = sigName(s);
      if (!name) {
        if (args.length === 1) throw new CmdError('usage: trap [action] signal...', 2);
        await ctx.stderr.write(`bash: trap: ${s}: invalid signal specification\n`);
        st = 1;
      } else if (action === '-') delete sh.traps[name];
      else sh.traps[name] = action;
    }
    return st;
  },
};
