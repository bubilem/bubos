import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { resolvePath } from '../../../core/vfs.js';

// Vrátí novou hodnotu mode podle zadání (osmičkově nebo symbolicky: u+x, go-w, a=rx, +x, u=g)
export function applyMode(spec, mode, isDir, umask = 0o022) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxXst]*|[ugo])$/.exec(clause);
    if (!m) throw new CmdError(`invalid mode: '${spec}'`);
    const [, who0, op, perms] = m;
    let who = who0 || 'a';
    const noWho = !who0;
    if (who.includes('a')) who = 'ugo';
    let bits = 0;
    if (/^[ugo]$/.test(perms)) {
      const src = (mode >> { u: 6, g: 3, o: 0 }[perms]) & 7;
      for (const w of who) bits |= src << { u: 6, g: 3, o: 0 }[w];
    } else {
      let p = 0;
      if (perms.includes('r')) p |= 4;
      if (perms.includes('w')) p |= 2;
      if (perms.includes('x') || (perms.includes('X') && (isDir || (mode & 0o111)))) p |= 1;
      for (const w of who) {
        let pw = p;
        if (noWho) pw &= ~(({ u: 0, g: 0, o: 0 })[w] | 0);
        bits |= pw << { u: 6, g: 3, o: 0 }[w];
      }
      if (perms.includes('s')) { if (who.includes('u')) bits |= 0o4000; if (who.includes('g')) bits |= 0o2000; }
      if (perms.includes('t')) bits |= 0o1000;
    }
    let mask = 0;
    for (const w of who) mask |= 7 << { u: 6, g: 3, o: 0 }[w];
    if (op === '+') mode |= bits;
    else if (op === '-') mode &= ~bits;
    else mode = (mode & ~mask) | bits;
  }
  return mode;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'Rv', long: { recursive: 'R', verbose: 'v' } });
    if (rest.length < 2) throw new CmdError(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand', 1, true);
    const spec = rest.shift();
    applyMode(spec, 0o644, false);
    const { fs, user } = ctx;
    const apply = (abs) => {
      ctx.check();
      const n = fs.stat(abs, user, false);
      if (n.type !== 'link') fs.chmod(abs, applyMode(spec, n.mode, n.type === 'dir'), user);
      if (o.R && n.type === 'dir') for (const nm of fs.readdir(abs, user)) apply(resolvePath(abs, nm));
    };
    return ctx.each(rest, a => apply(ctx.path(a)), 'cannot access');
  },
};
