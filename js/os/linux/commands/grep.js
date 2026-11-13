import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { posixToJs } from '../../../core/regex.js';
import { resolvePath } from '../../../core/vfs.js';
import { toLines } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, {
      bool: 'ivnclLEFGwxohHqsrRC', val: 'e',
      long: { 'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', 'files-with-matches': 'l', 'files-without-match': 'L',
        'extended-regexp': 'E', 'fixed-strings': 'F', 'word-regexp': 'w', 'line-regexp': 'x', 'only-matching': 'o', 'no-filename': 'h',
        'with-filename': 'H', quiet: 'q', silent: 'q', recursive: 'r', regexp: 'e', color: 'C', colour: 'C', 'no-messages': 's' },
    });
    const pattern = o.e ?? rest.shift();
    if (pattern === undefined) throw new CmdError('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);

    let re;
    try {
      const srcs = pattern.split('\n').map(p => posixToJs(p, { ere: o.E, fixed: o.F, icase: o.i }));
      re = new RegExp(srcs.length > 1 ? srcs.map(r => `(?:${r.source})`).join('|') : srcs[0].source, srcs[0].flags);
    } catch (e) { throw new CmdError(e.message, 2); }
    if (o.x) re = new RegExp('^(?:' + re.source + ')$', re.flags);
    else if (o.w) re = new RegExp('(?<![\\p{L}\\p{N}_])(?:' + re.source + ')(?![\\p{L}\\p{N}_])', re.flags);
    const reG = new RegExp(re.source, re.flags + 'g');
    const hl = !!ctx.stdout.isTTY && !o.o;
    const rec = o.r || o.R;

    const files = rest.length ? rest : rec ? ['.'] : [];
    const implicitDot = rec && !rest.length;
    const showName = o.H || (!o.h && (files.length > 1 || rec));
    let any = false, st = 0;

    const search = async (text, label) => {
      let count = 0;
      const lines = toLines(text);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (re.test(line) === !!o.v) continue;
        count++; any = true;
        if (o.q) return true;
        if (o.l || o.L || o.c) continue;
        const pre = (showName ? (hl ? `\x1b[35m${label}\x1b[36m:\x1b[0m` : label + ':') : '') + (o.n ? (hl ? `\x1b[32m${i + 1}\x1b[36m:\x1b[0m` : `${i + 1}:`) : '');
        if (o.o) { if (!o.v) for (const m of line.matchAll(reG)) if (m[0]) await ctx.stdout.write(pre + m[0] + '\n'); }
        else await ctx.stdout.write(pre + (hl && !o.v ? line.replace(reG, m => (m ? `\x1b[1;31m${m}\x1b[0m` : m)) : line) + '\n');
      }
      if (o.c) await ctx.stdout.write((showName ? label + ':' : '') + count + '\n');
      if (o.l && count) await ctx.stdout.write(label + '\n');
      if (o.L && !count) await ctx.stdout.write(label + '\n');
      return false;
    };

    const walk = async (abs, shown) => {
      ctx.check();
      const n = ctx.fs.stat(abs, ctx.user);
      if (n.type === 'dir') {
        for (const nm of ctx.fs.readdir(abs, ctx.user))
          await walk(resolvePath(abs, nm), implicitDot && shown === '.' ? nm : (shown.endsWith('/') ? shown : shown + '/') + nm);
        return false;
      }
      return search(ctx.fs.read(abs, ctx.user), shown);
    };

    if (!files.length) await search(await ctx.stdin.readAll(), '(standard input)');
    else {
      st = await ctx.each(files, async a => {
        if (o.q && any) return;
        if (a === '-') { await search(await ctx.stdin.readAll(), '(standard input)'); return; }
        const n = ctx.fs.stat(ctx.path(a), ctx.user);
        if (n.type === 'dir' && !rec) throw new CmdError(`${a}: Is a directory`);
        await walk(ctx.path(a), a);
      });
    }
    if (o.s) st = 0;
    return any ? (o.q ? 0 : st ? 2 : 0) : (st ? 2 : 1);
  },
};
