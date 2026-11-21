import { Interrupt } from '../../../core/util.js';

// wait [%n | pid ...]: počká na úlohy na pozadí (bez argumentů na všechny)
export default {
  async run(ctx) {
    const sh = ctx.sh;
    const targets = ctx.args.length ? ctx.args : null;
    const jobs = targets ? [] : [...sh.jobs];
    if (targets) {
      for (const a of targets) {
        const j = sh.findJob(a);
        if (!j) { await ctx.stderr.write(`bash: wait: ${a.startsWith('%') ? a + ': no such job' : `pid ${a} is not a child of this shell`}\n`); return 127; }
        jobs.push(j);
      }
    }
    let st = 0;
    for (const j of jobs) {
      j.notify = false;
      const done = j.promise.then(s => ({ s }));
      const abort = new Promise(r => ctx.signal.addEventListener('abort', () => r(null), { once: true }));
      const res = await Promise.race([done, abort]);
      if (!res) { j.notify = true; throw new Interrupt(); }
      st = res.s;
    }
    return targets ? st : 0;
  },
};
