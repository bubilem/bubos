import { CmdError } from '../../../core/util.js';
import { can, R, W, X } from '../../../core/vfs.js';
import { segToRegex } from '../../../core/shell/expand.js';
import { posixToJs } from '../../../core/regex.js';

function evaluate(a, ctx) {
  const o = a.indexOf('-o');
  if (o > 0) return evaluate(a.slice(0, o), ctx) || evaluate(a.slice(o + 1), ctx);
  const n = a.indexOf('-a');
  if (n > 0) return evaluate(a.slice(0, n), ctx) && evaluate(a.slice(n + 1), ctx);
  if (a[0] === '!') return !evaluate(a.slice(1), ctx);
  if (a.length === 0) return false;
  if (a.length === 1) return a[0] !== '';
  const node = p => { try { return ctx.fs.stat(ctx.path(p), ctx.user); } catch { return null; } };
  if (a.length === 2) {
    const [op, x] = a;
    switch (op) {
      case '-z': return x === '';
      case '-n': return x !== '';
      case '-e': return !!node(x);
      case '-f': return node(x)?.type === 'file';
      case '-d': return node(x)?.type === 'dir';
      case '-L': case '-h': try { return ctx.fs.stat(ctx.path(x), ctx.user, false).type === 'link'; } catch { return false; }
      case '-s': { const nd = node(x); return !!nd && (nd.type === 'dir' || nd.data?.length > 0); }
      case '-r': { const nd = node(x); return !!nd && can(nd, ctx.user, R); }
      case '-w': { const nd = node(x); return !!nd && can(nd, ctx.user, W); }
      case '-x': { const nd = node(x); return !!nd && can(nd, ctx.user, X); }
      default: throw new CmdError(`${op}: unary operator expected`, 2);
    }
  }
  if (a.length === 3) {
    const [x, op, y] = a;
    const nx = +x, ny = +y;
    const num = () => { if (!Number.isFinite(nx) || !Number.isFinite(ny) || x === '' || y === '') throw new CmdError('integer expression expected', 2); };
    switch (op) {
      case '=': case '==': return ctx.argv[0] === '[[' ? segToRegex(y).test(x) : x === y; // v [[ ]] je vpravo vzor
      case '!=': return ctx.argv[0] === '[[' ? !segToRegex(y).test(x) : x !== y;
      case '=~': if (ctx.argv[0] !== '[[') break; try { return posixToJs(y, { ere: true }).test(x); } catch (e) { throw new CmdError(e.message, 2); }
      case '-eq': num(); return nx === ny;
      case '-ne': num(); return nx !== ny;
      case '-lt': num(); return nx < ny;
      case '-le': num(); return nx <= ny;
      case '-gt': num(); return nx > ny;
      case '-ge': num(); return nx >= ny;
      default: break;
    }
    throw new CmdError(`${op}: binary operator expected`, 2);
  }
  throw new CmdError('too many arguments', 2);
}

export default {
  async run(ctx) {
    let args = ctx.args;
    if (ctx.argv[0] === '[') {
      if (args.at(-1) !== ']') throw new CmdError("missing `]'", 2);
      args = args.slice(0, -1);
    }
    if (ctx.argv[0] === '[[') {
      if (args.at(-1) !== ']]') throw new CmdError("missing `]]'", 2);
      args = args.slice(0, -1);
    }
    return evaluate(args, ctx) ? 0 : 1;
  },
};
