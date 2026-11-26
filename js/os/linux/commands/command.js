import { CmdError } from '../../../core/util.js';
import { whichPath } from '../lib.js';

const KEYWORDS = ['if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function', '!', '{', '}', '[['];

// Co by se pod daným jménem spustilo: [popis pro -v, popis pro -V], nebo null
function describe(ctx, name) {
  const sh = ctx.sh;
  if (Object.hasOwn(sh.aliases, name)) return [`alias ${name}='${sh.aliases[name]}'`, `${name} is aliased to \`${sh.aliases[name]}'`];
  if (KEYWORDS.includes(name)) return [name, `${name} is a shell keyword`];
  if (Object.hasOwn(sh.funcs, name)) return [name, `${name} is a function`];
  if (ctx.os.builtins.includes(name)) return [name, `${name} is a shell builtin`];
  const p = whichPath(sh, name);
  return p ? [p, `${name} is ${p}`] : null;
}

// command [-v|-V] jméno [argumenty]
export default {
  async run(ctx) {
    const args = [...ctx.args];
    let mode = null;
    while (args[0]?.startsWith('-') && args[0].length > 1) {
      const a = args.shift();
      if (a === '--') break;
      for (const f of a.slice(1)) {
        if (f === 'v' || f === 'V') mode = f;
        else if (f !== 'p') throw new CmdError(`-${f}: invalid option`, 2);
      }
    }
    if (!args.length) return 0;
    if (!mode) return ctx.exec(args, { user: ctx.user, env: ctx.env, noFunc: true });
    let st = 0;
    for (const name of args) {
      const d = describe(ctx, name);
      if (d) await ctx.stdout.write(d[mode === 'v' ? 0 : 1] + '\n');
      else {
        if (mode === 'V') await ctx.stderr.write(`bash: command: ${name}: not found\n`);
        st = 1;
      }
    }
    return st;
  },
};
