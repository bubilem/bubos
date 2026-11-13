import { parseArgs } from '../../../core/args.js';
import { modeString, resolvePath } from '../../../core/vfs.js';
import { columns, stripAnsi, byteLen } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';
import { idMaps, lsDate, humanSize, paint } from '../lib.js';

const DUMMY = { type: 'file', mode: 0, uid: 0, gid: 0, mtime: 0, data: '' };

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, {
      bool: 'aAlhRdrtSF1C',
      long: { all: 'a', 'almost-all': 'A', 'human-readable': 'h', recursive: 'R', directory: 'd', reverse: 'r', color: 'C', colour: 'C' },
    });
    const { fs, user, stdout, stderr } = ctx;
    const tty = !!stdout.isTTY, color = tty;
    const maps = o.l ? idMaps(fs) : null;
    const width = ctx.tty?.cols ?? 80;
    const needStat = o.l || o.F || color || o.t || o.S || o.R;
    let st = 0, first = true;

    const sizeOf = n => (n.type === 'dir' ? 4096 : n.type === 'link' ? n.target.length : byteLen(n.data ?? ''));
    const label = e => {
      let s = color ? paint(e.name, e.n) : e.name;
      if (o.F) s += e.n.type === 'dir' ? '/' : e.n.type === 'link' ? '@' : (e.n.mode & 0o111) ? '*' : '';
      return s;
    };
    const cmp = (a, b) => {
      let r = 0;
      if (o.S) r = sizeOf(b.n) - sizeOf(a.n);
      else if (o.t) r = b.n.mtime - a.n.mtime;
      if (!r) r = a.name.localeCompare(b.name, getLang(), { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1);
      return o.r ? -r : r;
    };
    const emit = async ents => {
      if (o.l) {
        const rows = ents.map(e => {
          const n = e.n;
          const nl = n.type === 'dir' ? 2 + Object.values(n.children).filter(c => c.type === 'dir').length : 1;
          const size = sizeOf(n);
          return [modeString(n), String(nl), maps.uname(n.uid), maps.gname(n.gid), String(o.h ? humanSize(size) : size), lsDate(n.mtime),
            label(e) + (n.type === 'link' ? ' -> ' + n.target : '')];
        });
        const w = [0, 1, 2, 3, 4].map(i => Math.max(...rows.map(r => r[i].length)));
        for (const r of rows)
          await stdout.write(`${r[0]} ${r[1].padStart(w[1])} ${r[2].padEnd(w[2])} ${r[3].padEnd(w[3])} ${r[4].padStart(w[4])} ${r[5]} ${r[6]}\n`);
      } else if (tty && !o['1']) {
        const out = columns(ents.map(e => { const s = label(e); return { text: s, len: stripAnsi(s).length }; }), width);
        if (out) await stdout.write(out + '\n');
      } else for (const e of ents) await stdout.write(label(e) + '\n');
    };

    const listDir = async (abs, shown, header) => {
      ctx.check();
      let names = fs.readdir(abs, user);
      if (o.a) names = ['.', '..', ...names];
      else if (!o.A) names = names.filter(n => n[0] !== '.');
      let ents = names.map(name => {
        let n = DUMMY;
        if (needStat) { try { n = fs.stat(resolvePath(abs, name), user, false); } catch { /* bez práva x */ } }
        return { name, n };
      });
      ents.sort(cmp);
      if (!first) await stdout.write('\n');
      first = false;
      if (header) await stdout.write(shown + ':\n');
      if (o.l) await stdout.write(`total ${ents.reduce((a, e) => a + Math.max(4, Math.ceil(sizeOf(e.n) / 4096) * 4), 0)}\n`);
      await emit(ents);
      if (o.R) {
        for (const e of ents) {
          if (e.n.type === 'dir' && e.name !== '.' && e.name !== '..')
            await listDir(resolvePath(abs, e.name), (shown === '/' ? '' : shown) + '/' + e.name, true);
        }
      }
    };

    const ops = rest.length ? rest : ['.'];
    const files = [], dirs = [];
    for (const op of ops) {
      try {
        const abs = ctx.path(op);
        const n = fs.stat(abs, user, !(o.l || o.d));
        if (n.type === 'dir' && !o.d) dirs.push({ op, abs }); else files.push({ name: op, n });
      } catch (e) {
        await stderr.write(`ls: cannot access '${op}': ${ctx.fsMsg(e)}\n`);
        st = 2;
      }
    }
    if (files.length) { files.sort(cmp); first = false; await emit(files); }
    const header = ops.length > 1 || o.R;
    for (const d of dirs) {
      try { await listDir(d.abs, d.op, header); }
      catch (e) {
        if (!e.code) throw e;
        await stderr.write(`ls: cannot open directory '${d.op}': ${ctx.fsMsg(e)}\n`);
        st = 2;
      }
    }
    return st;
  },
};
