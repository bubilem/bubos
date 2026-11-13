import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const sh = ctx.sh;
    const args = ctx.args.filter(a => a !== '-p');
    if (!args.length) {
      for (const k of [...sh.exported].sort()) if (k in sh.vars) await ctx.stdout.write(`declare -x ${k}="${sh.vars[k]}"\n`);
      return 0;
    }
    let st = 0;
    for (const a of args) {
      const eq = a.indexOf('=');
      const name = eq < 0 ? a : a.slice(0, eq);
      if (!/^[A-Za-z_]\w*$/.test(name)) { await ctx.stderr.write(`bash: export: \`${a}': not a valid identifier\n`); st = 1; continue; }
      if (eq >= 0) sh.setVar(name, a.slice(eq + 1));
      sh.exported.add(name);
    }
    return st;
  },
};
