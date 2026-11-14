import { parseArgs } from '../../../core/args.js';
import { CmdError, byteLen } from '../../../core/util.js';
import { modeString } from '../../../core/vfs.js';
import { idMaps, fmtDate } from '../lib.js';

const kind = n => (n.type === 'dir' ? 'directory' : n.type === 'link' ? 'symbolic link' : n.dev ? 'character special file'
  : (n.data ?? '') === '' ? 'regular empty file' : 'regular file');

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'L', val: 'c', long: { dereference: 'L', format: 'c' } });
    if (!rest.length) throw new CmdError('missing operand', 1, true);
    const maps = idMaps(ctx.fs);
    return ctx.each(rest, async a => {
      const n = ctx.fs.stat(ctx.path(a), ctx.user, !!o.L);
      const size = n.type === 'dir' ? 4096 : n.type === 'link' ? n.target.length : byteLen(n.data ?? '');
      const perm = n.mode & 0o7777, oct = perm.toString(8).padStart(4, '0'), when = fmtDate(new Date(n.mtime), '%F %T');
      const blocks = Math.ceil(size / 4096) * 8;
      if (o.c) {
        const map = {
          n: a, N: n.type === 'link' ? `'${a}' -> '${n.target}'` : `'${a}'`, s: size, a: perm.toString(8), A: modeString(n), U: maps.uname(n.uid),
          G: maps.gname(n.gid), u: n.uid, g: n.gid, F: kind(n), y: when, Y: Math.floor(n.mtime / 1000), h: 1, b: blocks, '%': '%',
        };
        await ctx.stdout.write(o.c.replace(/%(.)/g, (m, c) => (c in map ? map[c] : m)) + '\n');
        return;
      }
      const file = n.type === 'link' ? `'${a}' -> '${n.target}'` : a;
      await ctx.stdout.write(
        `  File: ${file}\n  Size: ${String(size).padEnd(10)}\tBlocks: ${String(blocks).padEnd(10)} IO Block: 4096   ${kind(n)}\n` +
        `Access: (${oct}/${modeString(n)})  Uid: (${String(n.uid).padStart(5)}/${maps.uname(n.uid).padStart(8)})   Gid: (${String(n.gid).padStart(5)}/${maps.gname(n.gid).padStart(8)})\n` +
        `Modify: ${when}\n`);
    }, 'cannot stat');
  },
};
