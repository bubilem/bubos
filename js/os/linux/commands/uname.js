import { parseArgs } from '../../../core/args.js';

export default {
  async run(ctx) {
    const { o } = parseArgs(ctx.args, { bool: 'asnrvmo' });
    const v = { s: 'Linux', n: ctx.m.hostname, r: '6.8.0-bubos', v: '#1 SMP BubOS', m: 'x86_64', o: 'GNU/Linux' };
    const keys = o.a ? ['s', 'n', 'r', 'v', 'm', 'o'] : ['s', 'n', 'r', 'v', 'm', 'o'].filter(k => o[k]);
    await ctx.stdout.write((keys.length ? keys : ['s']).map(k => v[k]).join(' ') + '\n');
  },
};
