import { CmdError } from '../../../core/util.js';

// local jmeno[=hodnota]… – proměnná platná jen uvnitř funkce
export default {
  async run(ctx) {
    const frame = ctx.sh.frames.at(-1);
    if (!frame) throw new CmdError('can only be used in a function');
    let st = 0;
    for (const a of ctx.args) {
      const m = /^([A-Za-z_]\w*)(?:=(.*))?$/s.exec(a);
      if (!m) { await ctx.stderr.write(`${ctx.prog}: \`${a}': not a valid identifier\n`); st = 1; continue; }
      if (!frame.locals.has(m[1])) frame.locals.set(m[1], ctx.sh.vars[m[1]]);
      ctx.sh.setVar(m[1], m[2] ?? '');
    }
    return st;
  },
};
