import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

const CLASS = {
  '[:lower:]': 'abcdefghijklmnopqrstuvwxyz', '[:upper:]': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '[:digit:]': '0123456789',
  '[:space:]': ' \t\n\r\f\v', '[:blank:]': ' \t', '[:alpha:]': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '[:alnum:]': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '[:punct:]': '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};
function expand(set) {
  let s = set.replace(/\[:\w+:\]/g, m => { if (!CLASS[m]) throw new CmdError(`invalid character class '${m}'`); return CLASS[m]; });
  s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  const out = [];
  const a = [...s];
  for (let i = 0; i < a.length; i++) {
    if (a[i + 1] === '-' && a[i + 2] !== undefined) {
      for (let c = a[i].codePointAt(0); c <= a[i + 2].codePointAt(0); c++) out.push(String.fromCodePoint(c));
      i += 2;
    } else out.push(a[i]);
  }
  return out;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'dsc', long: { delete: 'd', 'squeeze-repeats': 's', complement: 'c' } });
    if (!rest.length) throw new CmdError('missing operand', 1, true);
    let from = expand(rest[0]);
    const to = rest[1] !== undefined ? expand(rest[1]) : [];
    if (!o.d && !o.s && !to.length) throw new CmdError(`missing operand after '${rest[0]}'`, 1, true);
    const text = await ctx.stdin.readAll();
    const inSet = c => (o.c ? !from.includes(c) : from.includes(c));
    let out = '';
    let prev = null;
    for (const c of text) {
      let r = c;
      if (o.d && inSet(c)) continue;
      if (!o.d && to.length && inSet(c)) {
        const idx = o.c ? to.length - 1 : from.indexOf(c);
        r = to[Math.min(idx, to.length - 1)];
      }
      if (o.s && r === prev && (to.length ? to.includes(r) : inSet(r))) continue;
      out += r; prev = r;
    }
    await ctx.stdout.write(out);
    return 0;
  },
};
