import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

// Rozdělí vstup na argumenty: bílé znaky, s podporou '...', "..." a zpětného lomítka
function split(text) {
  const out = [];
  let cur = '', has = false, q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === q) q = null; else cur += c; }
    else if (c === '"' || c === "'") { q = c; has = true; }
    else if (c === '\\' && i + 1 < text.length) { cur += text[++i]; has = true; }
    else if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } }
    else cur += c;
  }
  if (q) throw new CmdError('unmatched ' + (q === '"' ? 'double' : 'single') + ' quote; by default quotes are special to xargs unless you use the -0 option', 1);
  if (has || cur) out.push(cur);
  return out;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: '0rt', val: 'nIdL', stop: true, long: { 'null': '0', 'no-run-if-empty': 'r', verbose: 't', 'max-args': 'n', delimiter: 'd' } });
    const base = rest.length ? rest : ['echo'];
    const text = await ctx.stdin.readAll();
    let items;
    if (o['0']) items = text.split('\0').filter((x, i, a) => x !== '' || i < a.length - 1);
    else if (o.d !== undefined) items = text.replace(/\n$/, '').split(o.d.replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
    else if (o.I !== undefined) items = text.split('\n').filter(l => l.trim() !== '').map(l => l.trim());
    else items = split(text);
    if (!items.length && o.r) return 0;
    const n = o.n !== undefined ? +o.n : null;
    if (n !== null && !(n > 0)) throw new CmdError(`invalid number for -n option`, 1);
    const batches = [];
    if (o.I !== undefined) for (const it of items) batches.push(base.map(a => a.split(o.I).join(it)));
    else if (!items.length) batches.push([...base]);
    else if (n) for (let i = 0; i < items.length; i += n) batches.push([...base, ...items.slice(i, i + n)]);
    else batches.push([...base, ...items]);
    let st = 0;
    for (const argv of batches) {
      ctx.check();
      if (o.t) await ctx.stderr.write(argv.join(' ') + '\n');
      const r = await ctx.exec(argv);
      if (r === 255) return 124;
      if (r !== 0) st = 123;
    }
    return st;
  },
};
