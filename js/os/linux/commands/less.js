export default {
  async run(ctx) {
    const files = ctx.args.filter(a => !a.startsWith('-'));
    let text = '';
    const st = await ctx.each(files.length ? files : [null], async a => {
      text += a === null ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user);
    });
    if (ctx.stdout.isTTY && ctx.tty?.pager) await ctx.tty.pager(text, { title: files[0] ?? '' });
    else await ctx.stdout.write(text);
    return st;
  },
};
