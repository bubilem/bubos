import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { posixToJs } from '../../../core/regex.js';
import { toLines } from '../lib.js';

// Jednoduchý sed: adresy (N, $, /re/, N,M, N,/re/, !), příkazy s p d q = y a i c { }
export default {
  async run(ctx) {
    const exprs = [], args = [];
    for (let i = 0; i < ctx.args.length; i++) {
      const a = ctx.args[i];
      if (a === '-e' || a === '--expression') exprs.push(ctx.args[++i] ?? '');
      else if (a.startsWith('--expression=')) exprs.push(a.slice(13));
      else args.push(a);
    }
    const { o, rest } = parseArgs(args, { bool: 'nEriz', long: { quiet: 'n', silent: 'n', 'regexp-extended': 'E', 'in-place': 'i' } });
    const ere = o.E || o.r;
    const scripts = [];
    if (exprs.length) scripts.push(...exprs);
    else if (rest.length) scripts.push(rest.shift());
    else throw new CmdError('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...', 1);
    const fail = m => { throw new CmdError(`-e expression #1: ${m}`, 1); };

    // ---- parser skriptu ----
    const src = scripts.join('\n');
    let p = 0;
    const cmds = [], stack = [];
    const skipWs = () => { while (p < src.length && /[ \t]/.test(src[p])) p++; };
    const delimited = d => {
      let out = '';
      while (p < src.length && src[p] !== d) {
        if (src[p] === '\\' && p + 1 < src.length) {
          if (src[p + 1] === d && !/[.*[\]^$+?(){}|]/.test(d)) { out += d; p += 2; continue; }
          if (src[p + 1] === 'n') { out += '\n'; p += 2; continue; }
          out += src[p] + src[p + 1]; p += 2; continue;
        }
        out += src[p++];
      }
      if (src[p] !== d) fail('unterminated address regex');
      p++;
      return out;
    };
    const mkRe = (s, icase) => { try { return posixToJs(s, { ere, icase }); } catch (e) { return fail(e.message); } };
    const address = () => {
      skipWs();
      const c = src[p];
      if (c === undefined) return null;
      if (/\d/.test(c)) { let n = ''; while (/\d/.test(src[p] ?? '')) n += src[p++]; return { n: +n }; }
      if (c === '$') { p++; return { last: true }; }
      if (c === '/' || c === '\\') {
        let d = '/';
        if (c === '\\') { p++; d = src[p]; }
        p++;
        const s = delimited(d);
        let ic = false;
        if (src[p] === 'I') { ic = true; p++; }
        return { re: mkRe(s, ic) };
      }
      return null;
    };
    const textArg = () => {
      skipWs();
      if (src[p] === '\\') { p++; skipWs(); if (src[p] === '\n') p++; }
      let t = '';
      while (p < src.length && src[p] !== '\n') {
        if (src[p] === '\\' && p + 1 < src.length) { p++; }
        t += src[p++];
      }
      return t;
    };
    while (p < src.length) {
      while (p < src.length && /[\s;]/.test(src[p])) p++;
      if (p >= src.length) break;
      const c = { a1: null, a2: null, neg: false, on: false };
      c.a1 = address();
      if (c.a1) {
        skipWs();
        if (src[p] === ',') {
          p++; skipWs();
          if (src[p] === '+') { p++; let n = ''; while (/\d/.test(src[p] ?? '')) n += src[p++]; c.a2 = { plus: +n }; }
          else c.a2 = address() ?? fail('unexpected `,\'');
        }
      }
      skipWs();
      while (src[p] === '!') { c.neg = true; p++; skipWs(); }
      const k = src[p++];
      if (k === undefined) fail('missing command');
      c.k = k;
      if (k === '{') { stack.push(cmds.length); cmds.push(c); continue; }
      if (k === '}') { const s = stack.pop(); if (s === undefined) fail('unexpected `}\''); cmds[s].end = cmds.length; continue; }
      if (k === 's') {
        const d = src[p++];
        if (!d || d === '\n' || d === '\\') fail('unterminated `s\' command');
        const pat = delimited(d);
        let rep = '';
        while (p < src.length && src[p] !== d) {
          if (src[p] === '\\' && p + 1 < src.length) { rep += src[p] + src[p + 1]; p += 2; } else rep += src[p++];
        }
        if (src[p] !== d) fail('unterminated `s\' command');
        p++;
        let g = false, pr = false, ic = false, nth = 0;
        for (;;) {
          const f = src[p];
          if (f === 'g') g = true; else if (f === 'p') pr = true; else if (f === 'i' || f === 'I') ic = true;
          else if (/\d/.test(f ?? '')) { let n = ''; while (/\d/.test(src[p] ?? '')) n += src[p++]; nth = +n; continue; }
          else break;
          p++;
        }
        // náhrada: & = celá shoda, \1..\9, \n = nový řádek
        const parts = [];
        for (let i = 0; i < rep.length; i++) {
          const ch = rep[i];
          if (ch === '\\' && i + 1 < rep.length) {
            const e = rep[++i];
            if (/\d/.test(e)) parts.push({ g: +e });
            else parts.push(e === 'n' ? '\n' : e === 't' ? '\t' : e);
          } else if (ch === '&') parts.push({ g: 0 });
          else parts.push(ch);
        }
        Object.assign(c, { re: mkRe(pat, ic), parts, g, pr, nth });
      } else if (k === 'y') {
        const d = src[p++];
        const a = delimited(d), b = delimited(d);
        const A = [...a.replace(/\\\\/g, '\\')], B = [...b.replace(/\\\\/g, '\\')];
        if (A.length !== B.length) fail('strings for `y\' command are different lengths');
        c.map = new Map(A.map((ch, i) => [ch, B[i]]));
      } else if (k === 'a' || k === 'i' || k === 'c') c.text = textArg();
      else if (k === 'q' || k === 'Q') { skipWs(); let n = ''; while (/\d/.test(src[p] ?? '')) n += src[p++]; c.code = n ? +n : 0; }
      else if (!'pdPD=nNgGhHxl'.includes(k)) fail(`unknown command: \`${k}'`);
      cmds.push(c);
      skipWs();
      if (p < src.length && !/[;\n}]/.test(src[p])) fail('extra characters after command');
    }
    if (stack.length) fail('unmatched `{\'');

    // ---- běh ----
    const run = async (text, name) => {
      const lines = toLines(text), out = [];
      let quit = null, hold = '';
      for (const c of cmds) { c.on = false; c.endAt = -1; }
      for (let li = 0; li < lines.length && quit === null; li++) {
        ctx.check();
        const n = li + 1, last = li === lines.length - 1;
        let ps = lines[li];
        const after = [];
        let del = false;
        const m1 = a => (a.n !== undefined ? n === a.n : a.last ? last : a.re.test(ps));
        const matches = c => {
          let r;
          if (!c.a1) r = true;
          else if (!c.a2) r = m1(c.a1);
          else if (c.on) {
            r = true;
            if (c.a2.n !== undefined ? n >= c.a2.n : c.a2.plus !== undefined ? n >= c.endAt : c.a2.last ? last : c.a2.re.test(ps)) c.on = false;
          } else if (m1(c.a1)) {
            r = true;
            if (c.a2.plus !== undefined) { c.endAt = n + c.a2.plus; c.on = c.a2.plus > 0; }
            else if (c.a2.n !== undefined) c.on = c.a2.n > n;
            else c.on = !(c.a2.last && last);
          } else r = false;
          return r !== c.neg;
        };
        for (let ci = 0; ci < cmds.length && !del && quit === null; ci++) {
          const c = cmds[ci];
          if (c.k === '}') continue;
          if (!matches(c)) { if (c.k === '{') ci = c.end - 1; continue; }
          switch (c.k) {
            case '{': break;
            case 's': {
              let cnt = 0, hit = false;
              const re = new RegExp(c.re.source, c.re.flags + 'g');
              ps = ps.replace(re, (...a) => {
                cnt++;
                if ((c.nth && cnt < c.nth) || (!c.g && cnt > (c.nth || 1))) return a[0];
                hit = true;
                return c.parts.map(x => (typeof x === 'string' ? x : (x.g === 0 ? a[0] : (typeof a[x.g] === 'string' ? a[x.g] : '')))).join('');
              });
              if (hit && c.pr) out.push(ps);
              break;
            }
            case 'p': out.push(ps); break;
            case 'd': del = true; break;
            case 'q': quit = c.code; break;
            case 'Q': quit = c.code; del = true; break;
            case '=': out.push(String(n)); break;
            case 'y': ps = [...ps].map(ch => c.map.get(ch) ?? ch).join(''); break;
            case 'a': after.push(c.text); break;
            case 'i': out.push(c.text); break;
            case 'c': if (!c.a2 || !c.on) out.push(c.text); del = true; break;
            case 'h': hold = ps; break;
            case 'H': hold += '\n' + ps; break;
            case 'g': ps = hold; break;
            case 'G': ps += '\n' + hold; break;
            case 'x': [ps, hold] = [hold, ps]; break;
            default: break;
          }
        }
        if (!del && !o.n) out.push(ps);
        out.push(...after);
      }
      return { out, quit };
    };

    const emit = s => ctx.stdout.write(s);
    if (!rest.length) {
      const r = await run(await ctx.stdin.readAll(), '-');
      if (r.out.length) await emit(r.out.join('\n') + '\n');
      return r.quit ?? 0;
    }
    let code = 0;
    const st = await ctx.each(rest, async a => {
      if (code !== 0) return;
      const text = a === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user);
      const r = await run(text, a);
      const body = r.out.length ? r.out.join('\n') + '\n' : '';
      if (o.i && a !== '-') ctx.fs.write(ctx.path(a), body, ctx.user);
      else await emit(body);
      if (r.quit) code = r.quit;
    });
    return code || st;
  },
};
