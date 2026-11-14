import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

// read – vestavěný příkaz: přečte řádek ze vstupu a rozdělí ho do proměnných
export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'rs', val: 'p' });
    const names = rest.length ? rest : ['REPLY'];
    for (const n of names) if (!/^[A-Za-z_]\w*$/.test(n)) throw new CmdError(`\`${n}': not a valid identifier`);
    let line;
    if (o.s && ctx.stdin === ctx.sh.base.stdin) line = await ctx.tty.ask(o.p ?? '', { silent: true }); // nezobrazuje zadávaný text
    else {
      if (o.p) await ctx.stderr.write(o.p);
      line = await ctx.stdin.readLine();
    }
    const eof = line === null;
    line ??= '';
    if (!o.r) line = line.replace(/\\(.)/g, '$1');
    // oddělovač je mezera/tabulátor; poslední proměnná dostane zbytek řádku
    let text = line.replace(/^[ \t]+/, '');
    names.forEach((n, i) => {
      if (i === names.length - 1) { ctx.sh.setVar(n, text.replace(/[ \t]+$/, '')); return; }
      const m = /^(\S*)[ \t]*/.exec(text);
      ctx.sh.setVar(n, m[1]);
      text = text.slice(m[0].length);
    });
    return eof ? 1 : 0;
  },
};
