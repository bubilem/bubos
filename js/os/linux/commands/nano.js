import { CmdError } from '../../../core/util.js';
import { FsError, can, W } from '../../../core/vfs.js';

export default {
  async run(ctx) {
    if (!ctx.tty?.edit) throw new CmdError('no terminal available');
    const file = ctx.args.find(a => !a.startsWith('-'));
    const abs = file ? ctx.path(file) : null;
    let text = '', isNew = !file, readOnly = false;
    if (abs) {
      try {
        const n = ctx.fs.stat(abs, ctx.user);
        text = ctx.fs.read(abs, ctx.user);
        readOnly = !can(n, ctx.user, W);
      } catch (e) {
        if (!(e instanceof FsError)) throw e;
        if (e.code !== 'ENOENT') throw new CmdError(`${file}: ${ctx.fsMsg(e)}`);
        isNew = true;
      }
    }
    await ctx.tty.edit({
      name: file ?? '', text, isNew, readOnly,
      save: async txt => {
        if (!abs) throw new Error(ctx.t('nano.noname'));
        try { ctx.fs.write(abs, txt, ctx.user); }
        catch (e) { if (e instanceof FsError) throw new Error(ctx.fsMsg(e)); throw e; }
        return txt === '' ? 0 : txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
      },
    });
  },
};
