import { parseArgs } from '../../../core/args.js';
import { FileWriter } from '../../../core/streams.js';
import { FsError } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'a', long: { append: 'a' } });
    const files = [];
    let st = 0;
    for (const a of rest) {
      try { const w = new FileWriter(ctx.fs, ctx.path(a), ctx.user, !!o.a); w.open(); files.push(w); }
      catch (e) {
        if (!(e instanceof FsError)) throw e;
        await ctx.stderr.write(`tee: ${a}: ${ctx.fsMsg(e)}\n`); st = 1;
      }
    }
    for (let s; (s = await ctx.stdin.read()) !== null;) {
      ctx.check();
      await ctx.stdout.write(s);
      for (const w of files) await w.write(s);
    }
    return st;
  },
};
