import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';

const sym = perm => ['u', 'g', 'o'].map((w, i) => { const b = (perm >> (6 - 3 * i)) & 7; return `${w}=${b & 4 ? 'r' : ''}${b & 2 ? 'w' : ''}${b & 1 ? 'x' : ''}`; }).join(',');

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'S' });
    const fs = ctx.fs;
    if (!rest.length) {
      await ctx.stdout.write((o.S ? sym(~fs.umask & 0o777) : fs.umask.toString(8).padStart(4, '0')) + '\n');
      return 0;
    }
    const a = rest[0];
    if (/^[0-7]{1,4}$/.test(a)) { fs.umask = parseInt(a, 8) & 0o777; return 0; }
    // symbolický zápis popisuje práva, která zůstanou (např. u=rwx,g=rx,o=)
    let perm = ~fs.umask & 0o777;
    for (const part of a.split(',')) {
      const m = /^([ugoa]*)([=+-])([rwx]*)$/.exec(part);
      if (!m) throw new CmdError(`${a}: invalid symbolic mode operator`);
      const who = m[1] || 'a', bits = (m[3].includes('r') ? 4 : 0) | (m[3].includes('w') ? 2 : 0) | (m[3].includes('x') ? 1 : 0);
      for (const [w, sh] of [['u', 6], ['g', 3], ['o', 0]]) {
        if (!who.includes(w) && !who.includes('a')) continue;
        if (m[2] === '=') perm = (perm & ~(7 << sh)) | (bits << sh);
        else if (m[2] === '+') perm |= bits << sh;
        else perm &= ~(bits << sh);
      }
    }
    fs.umask = ~perm & 0o777;
    return 0;
  },
};
