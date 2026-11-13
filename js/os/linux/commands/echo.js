const ESC = { n: '\n', t: '\t', '\\': '\\', e: '\x1b', a: '\x07', r: '\r', 0: '\0' };

export default {
  async run(ctx) {
    let a = ctx.args, nl = true, esc = false;
    while (a[0] && /^-[neE]+$/.test(a[0])) {
      for (const c of a[0].slice(1)) { if (c === 'n') nl = false; else esc = c === 'e'; }
      a = a.slice(1);
    }
    let s = a.join(' ');
    if (esc) s = s.replace(/\\(n|t|\\|e|a|r|0|x[0-9a-fA-F]{1,2})/g, (m, c) => ESC[c] ?? String.fromCharCode(parseInt(c.slice(1), 16)));
    await ctx.stdout.write(s + (nl ? '\n' : ''));
  },
};
