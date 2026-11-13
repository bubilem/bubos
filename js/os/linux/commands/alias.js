export default {
  async run(ctx) {
    const al = ctx.sh.aliases;
    if (!ctx.args.length) {
      for (const k of Object.keys(al).sort()) await ctx.stdout.write(`alias ${k}='${al[k]}'\n`);
      return 0;
    }
    let st = 0;
    for (const a of ctx.args) {
      const eq = a.indexOf('=');
      if (eq > 0) al[a.slice(0, eq)] = a.slice(eq + 1);
      else if (Object.hasOwn(al, a)) await ctx.stdout.write(`alias ${a}='${al[a]}'\n`);
      else { await ctx.stderr.write(`bash: alias: ${a}: not found\n`); st = 1; }
    }
    return st;
  },
};
