import { CmdError } from '../../../core/util.js';
import { findUser } from '../../../core/users.js';
import { CRON_DIR, parseCrontab } from '../cron.js';

// crontab [-u UŽIVATEL] -l | -e | -r | SOUBOR   (úlohy plánovače cron; viz man crontab)
export default {
  async run(ctx) {
    const { fs, user } = ctx;
    const args = ctx.args.slice();
    let target = user;
    const ui = args.indexOf('-u');
    if (ui >= 0) {
      const name = args[ui + 1];
      if (user.uid !== 0) throw new CmdError(`must be privileged to use -u`, 1);
      const u = name && findUser(fs, name);
      if (!u) throw new CmdError(`user \`${name ?? ''}' unknown`, 1);
      target = u;
      args.splice(ui, 2);
    }
    const file = `${CRON_DIR}/${target.name}`;
    const opt = args.find(a => /^-[lre]$/.test(a));
    const src = args.find(a => !a.startsWith('-') || a === '-');
    const read = () => { try { return fs.read(file, null); } catch { return null; } };
    const noTab = () => new CmdError(`no crontab for ${target.name}`, 1);
    const install = text => {
      const { errors } = parseCrontab(text);
      if (errors.length) return errors;
      fs.mkdirp(CRON_DIR, { mode: 0o730, uid: 0, gid: 0 });
      fs.put(file, text.endsWith('\n') || !text ? text : text + '\n', { mode: 0o600, uid: target.uid, gid: target.gid ?? target.uid });
      return null;
    };

    if (opt === '-l') {
      const text = read();
      if (text === null) throw noTab();
      await ctx.stdout.write(text);
      return 0;
    }
    if (opt === '-r') {
      if (read() === null) throw noTab();
      fs.unlink(file, null);
      return 0;
    }
    if (opt === '-e') {
      if (!ctx.tty?.edit) throw new CmdError('no terminal available');
      const old = read();
      const text = old ?? ctx.t('crontab.template');
      let saved = null;
      await ctx.tty.edit({
        name: 'crontab', text, isNew: old === null, readOnly: false,
        save: async txt => {
          const errs = install(txt);
          if (errs) throw new Error(errs.map(e => `line ${e.line}: ${e.msg}`).join('; '));
          saved = txt;
          return txt === '' ? 0 : txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
        },
      });
      if (saved !== null) await ctx.stderr.write('crontab: installing new crontab\n');
      return 0;
    }
    if (src) {
      let text;
      try { text = src === '-' ? await ctx.stdin.readAll() : fs.read(ctx.path(src), user); }
      catch (e) { throw new CmdError(`${src}: ${e.code ? ctx.fsMsg(e) : e.message}`, 1); }
      const errs = install(text);
      if (errs) {
        await ctx.stderr.write('crontab: installing new crontab\n');
        for (const e of errs) await ctx.stderr.write(`"${src}":${e.line}: ${e.msg}\n`);
        await ctx.stderr.write("crontab: errors in crontab file, can't install.\n");
        return 1;
      }
      return 0;
    }
    throw new CmdError('usage: crontab [-u user] file\n       crontab [-u user] { -e | -l | -r }', 1);
  },
};
