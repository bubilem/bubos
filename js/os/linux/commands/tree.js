import { parseArgs } from '../../../core/args.js';
import { resolvePath } from '../../../core/vfs.js';
import { getLang } from '../../../core/i18n.js';
import { paint } from '../lib.js';

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'ad', val: 'L' });
    const maxDepth = o.L ? +o.L : Infinity;
    const color = !!ctx.stdout.isTTY;
    let dirs = 0, files = 0;
    const name = (nm, n) => (color ? paint(nm, n) : nm);
    const walk = async (abs, prefix, depth) => {
      ctx.check();
      let names;
      try { names = ctx.fs.readdir(abs, ctx.user); } catch (e) { await ctx.stdout.write(`${prefix}[${ctx.fsMsg(e)}]\n`); return; }
      if (!o.a) names = names.filter(n => n[0] !== '.');
      names.sort((a, b) => a.localeCompare(b, getLang(), { sensitivity: 'base' }) || (a < b ? -1 : 1));
      const ents = names.map(nm => ({ nm, n: ctx.fs.stat(resolvePath(abs, nm), ctx.user, false) })).filter(e => !o.d || e.n.type === 'dir');
      for (let i = 0; i < ents.length; i++) {
        const { nm, n } = ents[i];
        const last = i === ents.length - 1;
        await ctx.stdout.write(`${prefix}${last ? '└── ' : '├── '}${name(nm, n)}${n.type === 'link' ? ' -> ' + n.target : ''}\n`);
        if (n.type === 'dir') {
          dirs++;
          if (depth < maxDepth) await walk(resolvePath(abs, nm), prefix + (last ? '    ' : '│   '), depth + 1);
        } else files++;
      }
    };
    return ctx.each(rest.length ? rest : ['.'], async a => {
      const abs = ctx.path(a);
      const n = ctx.fs.stat(abs, ctx.user);
      await ctx.stdout.write((color ? paint(a, n) : a) + '\n');
      if (n.type === 'dir') await walk(abs, '', 1);
    }).then(async st => {
      await ctx.stdout.write(`\n${dirs} ${dirs === 1 ? 'directory' : 'directories'}${o.d ? '' : `, ${files} ${files === 1 ? 'file' : 'files'}`}\n`);
      return st;
    });
  },
};
