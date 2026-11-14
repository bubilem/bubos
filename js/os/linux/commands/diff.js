import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { fmtDate, toLines } from '../lib.js';

const MAX = 4000;

// Posloupnost operací: { t: ' '|'-'|'+', a: index v 1. souboru, b: index ve 2. souboru, s: text }
function ops(A, B) {
  const n = A.length, m = B.length;
  if (n > MAX || m > MAX) throw new CmdError('files are too large to compare');
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { out.push({ t: ' ', a: i, b: j, s: A[i] }); i++; j++; }
    else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) { out.push({ t: '-', a: i, b: j, s: A[i] }); i++; }
    else { out.push({ t: '+', a: i, b: j, s: B[j] }); j++; }
  }
  return out;
}
const range = (from, to) => (from === to ? String(from) : `${from},${to}`);

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'uqiBw', val: 'U', long: { unified: 'u', brief: 'q', 'ignore-case': 'i' }, numeric: true });
    if (rest.length !== 2) throw new CmdError(rest.length ? `missing operand after '${rest.at(-1)}'` : 'missing operand', 2, true);
    const [fa, fb] = rest;
    const read = async f => {
      try { return f === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(f), ctx.user); }
      catch (e) { if (e.code) throw new CmdError(`${f}: ${ctx.fsMsg(e)}`, 2); throw e; }
    };
    const ta = await read(fa), tb = await read(fb);
    const norm = s => (o.i ? s.toLowerCase() : s);
    const A = toLines(ta), B = toLines(tb);
    const all = ops(A.map(norm), B.map(norm)).map(x => ({ ...x, s: x.t === '+' ? B[x.b] : A[x.a] }));
    if (all.every(x => x.t === ' ')) return 0;
    if (o.q) { await ctx.stdout.write(`Files ${fa} and ${fb} differ\n`); return 1; }
    const w = [];
    if (o.u || o.U !== undefined || o.num !== undefined) {
      const C = o.U !== undefined ? +o.U : o.num ?? 3;
      const stamp = f => { try { return fmtDate(new Date(ctx.fs.stat(ctx.path(f), ctx.user).mtime), '%F %T.000000000 +0000'); } catch { return ''; } };
      w.push(`--- ${fa}\t${stamp(fa)}`, `+++ ${fb}\t${stamp(fb)}`);
      const idx = all.flatMap((x, k) => (x.t === ' ' ? [] : [k]));
      let g = 0;
      while (g < idx.length) {
        let end = g;
        while (end + 1 < idx.length && idx[end + 1] - idx[end] <= 2 * C + 1) end++;
        const from = Math.max(0, idx[g] - C), to = Math.min(all.length - 1, idx[end] + C), seg = all.slice(from, to + 1);
        const na = seg.filter(x => x.t !== '+').length, nb = seg.filter(x => x.t !== '-').length;
        const sa = seg.find(x => x.t !== '+')?.a ?? seg[0].a, sb = seg.find(x => x.t !== '-')?.b ?? seg[0].b;
        const hd = (s, c) => (c === 1 ? String(s + 1) : `${c === 0 ? s : s + 1},${c}`);
        w.push(`@@ -${hd(sa, na)} +${hd(sb, nb)} @@`);
        for (const x of seg) w.push(x.t + x.s);
        g = end + 1;
      }
    } else {
      let k = 0;
      while (k < all.length) {
        if (all[k].t === ' ') { k++; continue; }
        let e = k;
        while (e < all.length && all[e].t !== ' ') e++;
        const del = all.slice(k, e).filter(x => x.t === '-'), add = all.slice(k, e).filter(x => x.t === '+');
        const aBefore = all[k].a, bBefore = all[k].b;
        if (del.length && add.length) w.push(`${range(del[0].a + 1, del.at(-1).a + 1)}c${range(add[0].b + 1, add.at(-1).b + 1)}`);
        else if (del.length) w.push(`${range(del[0].a + 1, del.at(-1).a + 1)}d${bBefore}`);
        else w.push(`${aBefore}a${range(add[0].b + 1, add.at(-1).b + 1)}`);
        for (const x of del) w.push('< ' + x.s);
        if (del.length && add.length) w.push('---');
        for (const x of add) w.push('> ' + x.s);
        k = e;
      }
    }
    await ctx.stdout.write(w.join('\n') + '\n');
    return 1;
  },
};
