import { CmdError } from '../../../core/util.js';

// factor ČÍSLO… – rozloží číslo na prvočinitele (42: 2 3 7)
function factors(n) {
  const out = [];
  for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) while (n % p === 0) { out.push(p); n /= p; }
  if (n > 1 || !out.length) out.push(n);
  return out;
}

export default {
  async run(ctx) {
    const items = ctx.args.length ? ctx.args : (await ctx.stdin.readAll()).split(/\s+/).filter(Boolean);
    let st = 0;
    for (const a of items) {
      ctx.check();
      if (!/^\d+$/.test(a) || !Number.isSafeInteger(+a)) {
        if (/^\d+$/.test(a)) throw new CmdError(`'${a}' is too large for this simulator`);
        await ctx.stderr.write(`${ctx.prog}: ‘${a}’ is not a valid positive integer\n`); st = 1; continue;
      }
      const n = +a;
      await ctx.stdout.write(`${n}: ${n < 2 ? n : factors(n).join(' ')}\n`);
    }
    return st;
  },
};
