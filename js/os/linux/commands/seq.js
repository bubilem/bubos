import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { val: 's', numeric: false });
    const nums = rest.map(Number);
    if (!rest.length || rest.length > 3 || nums.some(Number.isNaN)) throw new CmdError(rest.length ? `invalid floating point argument: '${rest.find((_, i) => Number.isNaN(nums[i]))}'` : 'missing operand', 1, true);
    const [a, step, b] = rest.length === 1 ? [1, 1, nums[0]] : rest.length === 2 ? [nums[0], 1, nums[1]] : nums;
    if (step === 0) throw new CmdError('invalid Zero increment value: ‘0’');
    const dec = Math.max(...rest.map(r => (r.split('.')[1] ?? '').length));
    const sep = o.s ?? '\n';
    const out = [];
    for (let x = a, i = 0; step > 0 ? x <= b + 1e-9 : x >= b - 1e-9; x = a + step * ++i) {
      ctx.check();
      out.push(x.toFixed(dec));
      if (out.length > 100000) break;
    }
    if (out.length) await ctx.stdout.write(out.join(sep) + '\n');
  },
};
