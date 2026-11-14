// Expanze slov: ~, $proměnné, $(příkazy), dělení na pole a hvězdičkové vzory (globbing)
import { resolvePath } from '../vfs.js';
import { lex } from './parse.js';
import { evalArith } from './arith.js';

const SPECIAL = /[*?[]/;

async function pieces(parts, sh) {
  const out = [];
  for (const p of parts) {
    if (p.t === 'lit') out.push({ s: p.s, q: p.q });
    else if (p.t === 'tilde') out.push({ s: sh.vars.HOME ?? '~', q: true });
    else if (p.t === 'var') {
      if (p.name === '@' && p.q && !p.mod) { out.push({ at: true, list: sh.args }); continue; } // "$@" = každý argument zvlášť
      let v = sh.getVar(p.name);
      if (p.mod) v = await applyMod(p, v, sh);
      out.push({ s: v ?? '', q: p.q, exp: true });
    } else if (p.t === 'cmd') out.push({ s: await sh.capture(p.src), q: p.q, exp: true });
    else if (p.t === 'arith') out.push({ s: String(arith(p.src, sh)), q: p.q, exp: true });
  }
  return out;
}

export const arith = (src, sh) => evalArith(src, { get: n => sh.getVar(n), set: (n, v) => sh.setVar(n, v) });

// Vzor pro case: uvozené znaky jsou doslovné, ostatní jsou zástupné
export async function expandPattern(parts, sh) {
  return (await pieces(parts, sh)).map(x => (x.at ? x.list.join(' ') : x.q ? x.s.replace(/[\\*?[]/g, '\\$&') : x.s)).join('');
}

export async function expandString(parts, sh) {
  return (await pieces(parts, sh)).map(x => (x.at ? x.list.join(' ') : x.s)).join('');
}

// Argument uvnitř ${…} se rozvíjí jako text v uvozovkách
const argText = (arg, sh) => expandString(lex('"' + (arg ?? '').replace(/"/g, '\\"') + '"')[0].parts, sh);

// ${jmeno:-výchozí}, ${#jmeno}, ${jmeno%přípona}, ${jmeno/co/čím}, ${jmeno:od:délka} …
async function applyMod(p, v, sh) {
  const empty = v === undefined || v === '';
  switch (p.mod) {
    case 'len': return String(p.name === '@' || p.name === '*' ? sh.args.length : (v ?? '').length);
    case ':-': return empty ? argText(p.arg, sh) : v;
    case '-': return v === undefined ? argText(p.arg, sh) : v;
    case ':=': if (empty) { v = await argText(p.arg, sh); sh.setVar(p.name, v); } return v;
    case '=': if (v === undefined) { v = await argText(p.arg, sh); sh.setVar(p.name, v); } return v;
    case ':+': return empty ? '' : argText(p.arg, sh);
    case '+': return v === undefined ? '' : argText(p.arg, sh);
    case '%': case '%%': case '#': case '##': {
      v ??= '';
      const re = segToRegex(await argText(p.arg, sh)), n = v.length;
      if (p.mod[0] === '%') {
        const order = p.mod === '%' ? [...Array(n + 1).keys()].reverse() : [...Array(n + 1).keys()]; // nejkratší / nejdelší přípona
        for (const i of order) if (re.test(v.slice(i))) return v.slice(0, i);
      } else {
        const order = p.mod === '#' ? [...Array(n + 1).keys()] : [...Array(n + 1).keys()].reverse();
        for (const i of order) if (re.test(v.slice(0, i))) return v.slice(i);
      }
      return v;
    }
    case '/': case '//': {
      v ??= '';
      const a = p.arg ?? '', k = a.search(/(?<!\\)\//);
      const pat = await argText(k < 0 ? a : a.slice(0, k), sh), rep = k < 0 ? '' : await argText(a.slice(k + 1), sh);
      if (!pat) return v;
      const re = new RegExp(segToRegex(pat).source.slice(1, -1), p.mod === '//' ? 'gs' : 's');
      return v.replace(re, () => rep);
    }
    case ':': {
      v ??= '';
      const [o, l] = (await argText(p.arg, sh)).split(':');
      let off = Math.trunc(arith(o, sh));
      if (off < 0) off = Math.max(0, v.length + off);
      return l === undefined ? v.slice(off) : v.slice(off, off + Math.trunc(arith(l, sh)));
    }
    default: return v;
  }
}

export async function expandWord(parts, sh) {
  const ps = await pieces(parts, sh);
  const fields = [];
  let cur = { ps: [], has: false };
  const close = () => { if (cur.has) fields.push(cur); cur = { ps: [], has: false }; };
  for (const x of ps) {
    if (x.at) {
      x.list.forEach((a, k) => { if (k > 0) close(); cur.ps.push({ s: a, q: true }); cur.has = true; });
    } else if (x.exp && !x.q) {
      // nezabalená expanze se dělí na slova podle mezer (proto je dobré proměnné uvozovkovat)
      x.s.split(/[ \t\n]+/).forEach((seg, k) => {
        if (k > 0) close();
        if (seg) { cur.ps.push({ s: seg, q: false }); cur.has = true; }
      });
    } else { cur.ps.push(x); cur.has = true; }
  }
  close();
  const res = [];
  for (const f of fields) {
    const text = f.ps.map(x => x.s).join('');
    if (f.ps.some(x => !x.q && SPECIAL.test(x.s))) {
      const pat = f.ps.map(x => (x.q ? x.s.replace(/[\\*?[]/g, '\\$&') : x.s)).join('');
      const m = globExpand(sh, pat);
      res.push(...(m.length ? m : [text]));
    } else res.push(text);
  }
  return res;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function segToRegex(seg) {
  let re = '^';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '\\') re += esc(seg[++i] ?? '\\');
    else if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const j = seg.indexOf(']', i + 2);
      if (j < 0) { re += '\\['; continue; }
      let body = seg.slice(i + 1, j);
      if (body[0] === '!') body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else re += esc(c);
  }
  return new RegExp(re + '$', 's');
}

export function globExpand(sh, pat) {
  const abs = pat.startsWith('/');
  const segs = pat.split('/').filter(Boolean);
  let bases = [{ real: abs ? '/' : sh.cwd, shown: abs ? '/' : '' }];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k], last = k === segs.length - 1, next = [];
    for (const b of bases) {
      if (!SPECIAL.test(seg.replace(/\\./g, ''))) {
        const name = seg.replace(/\\(.)/g, '$1');
        const real = resolvePath(b.real, name);
        if (sh.fs.exists(real, sh.user)) next.push({ real, shown: b.shown + name + (last ? '' : '/') });
      } else {
        let names;
        try { names = sh.fs.readdir(b.real, sh.user); } catch { continue; }
        const re = segToRegex(seg);
        for (const nm of names) {
          if (nm[0] === '.' && seg[0] !== '.') continue;
          if (!re.test(nm)) continue;
          const real = resolvePath(b.real, nm);
          if (!last) { try { if (sh.fs.stat(real, sh.user).type !== 'dir') continue; } catch { continue; } }
          next.push({ real, shown: b.shown + nm + (last ? '' : '/') });
        }
      }
    }
    bases = next;
    if (!bases.length) return [];
  }
  return bases.map(b => b.shown).sort();
}
