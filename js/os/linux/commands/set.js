import { CmdError } from '../../../core/util.js';

const quote = v => (/^[\w@%+=:,./-]*$/.test(v) ? v : `'${v.replace(/'/g, "'\\''")}'`);

// set [-e|+e] [-o errexit] [--] [argumenty]
export default {
  async run(ctx) {
    const sh = ctx.sh, args = ctx.args;
    if (!args.length) {
      for (const k of Object.keys(sh.vars).sort()) await ctx.stdout.write(`${k}=${quote(String(sh.vars[k]))}\n`);
      return 0;
    }
    let i = 0;
    for (; i < args.length; i++) {
      const a = args[i];
      if (a === '--') { sh.args = args.slice(i + 1); return 0; }
      if (!/^[-+]./.test(a)) break;
      const on = a[0] === '-';
      for (const f of a.slice(1)) {
        if (f === 'e') sh.opts.e = on;
        else if (f === 'o') {
          const name = args[++i];
          if (name === undefined) await ctx.stdout.write(`errexit        \t${sh.opts.e ? 'on' : 'off'}\n`);
          else if (name === 'errexit') sh.opts.e = on;
          else throw new CmdError(`${name}: invalid option name`, 2);
        } else throw new CmdError(`${a[0]}${f}: invalid option`, 2);
      }
    }
    if (i < args.length) sh.args = args.slice(i);
    return 0;
  },
};
