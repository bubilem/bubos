// find [cesta...] [výrazy]: -name -iname -type -maxdepth -mindepth -empty -newer(ne) ! -print -delete -exec ... {} \;
import { CmdError } from '../../../core/util.js';
import { resolvePath } from '../../../core/vfs.js';

const globRe = (pat, icase) => new RegExp('^' + pat.replace(/[.+^${}()|\\/]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', icase ? 'is' : 's');

export default {
  async run(ctx) {
    const args = ctx.args.slice();
    const starts = [];
    while (args.length && !args[0].startsWith('-') && args[0] !== '!' && args[0] !== '(') starts.push(args.shift());
    if (!starts.length) starts.push('.');

    let maxDepth = Infinity, minDepth = 0, del = false, printed = false;
    const tests = [], actions = [];
    let neg = false;
    const need = f => { if (!args.length) throw new CmdError(`missing argument to '${f}'`); return args.shift(); };
    while (args.length) {
      const f = args.shift();
      let t;
      if (f === '!' || f === '-not') { neg = !neg; continue; }
      else if (f === '-name' || f === '-iname') { const re = globRe(need(f), f === '-iname'); t = (nm) => re.test(nm); }
      else if (f === '-type') {
        const ty = need(f);
        const map = { f: 'file', d: 'dir', l: 'link' };
        if (!map[ty]) throw new CmdError(`Unknown argument to -type: ${ty}`);
        t = (nm, n) => n.type === map[ty];
      }
      else if (f === '-empty') t = (nm, n) => (n.type === 'dir' ? !Object.keys(n.children).length : n.type === 'file' && !n.data);
      else if (f === '-maxdepth') { maxDepth = +need(f); continue; }
      else if (f === '-mindepth') { minDepth = +need(f); continue; }
      else if (f === '-print') { actions.push({ k: 'print' }); printed = true; continue; }
      else if (f === '-delete') { del = true; continue; }
      else if (f === '-exec') {
        const cmd = [];
        while (args.length && args[0] !== ';' && args[0] !== '+') cmd.push(args.shift());
        if (!args.length) throw new CmdError('missing argument to `-exec\'');
        args.shift();
        actions.push({ k: 'exec', cmd });
        printed = true;
        continue;
      }
      else throw new CmdError(`unknown predicate \`${f}'`);
      const ng = neg; neg = false;
      tests.push((nm, n) => t(nm, n) !== ng);
    }
    if (!printed && !del) actions.push({ k: 'print' });

    let st = 0;
    const visit = async (abs, shown, depth) => {
      ctx.check();
      let n;
      try { n = ctx.fs.stat(abs, ctx.user, false); }
      catch (e) { await ctx.stderr.write(`find: '${shown}': ${ctx.fsMsg(e)}\n`); st = 1; return; }
      const base = shown === '/' ? '/' : shown.slice(shown.lastIndexOf('/') + 1);
      const ok = depth >= minDepth && tests.every(t => t(base, n));
      if (n.type === 'dir' && depth < maxDepth) {
        let names = [];
        try { names = ctx.fs.readdir(abs, ctx.user); }
        catch (e) { await ctx.stderr.write(`find: '${shown}': ${ctx.fsMsg(e)}\n`); st = 1; }
        for (const nm of names) await visit(resolvePath(abs, nm), (shown.endsWith('/') ? shown : shown + '/') + nm, depth + 1);
      }
      if (!ok) return;
      for (const a of actions) {
        if (a.k === 'print') await ctx.stdout.write(shown + '\n');
        else await ctx.exec(a.cmd.map(w => w.replaceAll('{}', shown)));
      }
      if (del) {
        try { if (n.type === 'dir') ctx.fs.rmdir(abs, ctx.user); else ctx.fs.unlink(abs, ctx.user); }
        catch (e) { await ctx.stderr.write(`find: cannot delete '${shown}': ${ctx.fsMsg(e)}\n`); st = 1; }
      }
    };
    for (const s of starts) await visit(ctx.path(s), s, 0);
    return st;
  },
};
