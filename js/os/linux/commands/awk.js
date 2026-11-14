import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { posixToJs } from '../../../core/regex.js';
import { sprintf } from '../lib.js';

// Jednoduchý awk: vzory, BEGIN/END, pole, asociativní pole, if/while/for, printf, základní funkce.
// Neumí: getline, uživatelské funkce, RS jiné než nový řádek, přesměrování do rour.

const KEYWORDS = new Set(['BEGIN', 'END', 'if', 'else', 'while', 'for', 'do', 'in', 'next', 'exit', 'break', 'continue', 'delete', 'print', 'printf', 'return']);
const BUILTINS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'toupper', 'tolower', 'sprintf', 'int', 'sqrt', 'sin', 'cos', 'exp', 'log', 'atan2', 'rand', 'srand', 'system']);
class Next {} class Exit { constructor(c) { this.code = c; } } class Brk {} class Cont {}

function lex(src) {
  const toks = [];
  let i = 0, prevVal = false;
  const push = (t, v) => { toks.push({ t, v }); prevVal = t === 'num' || t === 'str' || t === 'name' || t === 'builtin' || (t === 'op' && [')', ']', '++', '--', '$'].includes(v)); };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '\n') { toks.push({ t: 'nl' }); prevVal = false; i++; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      push('num', parseFloat(m[0])); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))[0];
      i += m.length;
      if (BUILTINS.has(m)) push('builtin', m); else push('name', m);
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          const e = src[++i];
          s += ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' })[e] ?? '\\' + e;
        } else s += src[i];
        i++;
      }
      if (i >= src.length) throw new CmdError('non-terminated string', 2);
      i++; push('str', s); continue;
    }
    if (c === '/' && !prevVal) {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '/' && src[i] !== '\n') { if (src[i] === '\\' && src[i + 1] === '/') { s += '/'; i += 2; continue; } if (src[i] === '\\') { s += src[i++]; } s += src[i++]; }
      if (src[i] !== '/') throw new CmdError('non-terminated regular expression', 2);
      i++; push('re', s); continue;
    }
    const three = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '^=', '!~', '>>'].includes(three)) { push('op', three); i += 2; continue; }
    push('op', c); i++;
  }
  toks.push({ t: 'eof' });
  return toks;
}

function parse(src) {
  const T = lex(src);
  let p = 0, noGt = false, noIn = false;
  const peek = () => T[p];
  const isOp = v => T[p].t === 'op' && T[p].v === v;
  const isName = v => T[p].t === 'name' && T[p].v === v;
  const eat = v => { if (!isOp(v)) throw new CmdError(`syntax error at source line 1: expected '${v}'`, 2); p++; };
  const skipNl = () => { while (T[p].t === 'nl') p++; };
  const skipTerm = () => { while (T[p].t === 'nl' || isOp(';')) p++; };

  const primary = () => {
    const k = T[p];
    if (k.t === 'num') { p++; return { n: 'num', v: k.v }; }
    if (k.t === 'str') { p++; return { n: 'str', v: k.v }; }
    if (k.t === 're') { p++; return { n: 'match', re: k.v }; }
    if (k.t === 'op' && k.v === '(') {
      p++; const sv = [noGt, noIn]; noGt = false; noIn = false;
      const e = expr();
      [noGt, noIn] = sv; eat(')');
      return { n: 'group', e };
    }
    if (k.t === 'op' && k.v === '$') { p++; return { n: 'field', e: incdec(true) }; }
    if (k.t === 'op' && (k.v === '-' || k.v === '+' || k.v === '!')) { p++; return { n: 'un', op: k.v, e: unary() }; }
    if (k.t === 'op' && (k.v === '++' || k.v === '--')) { p++; return { n: 'pre', op: k.v, e: primary() }; }
    if (k.t === 'builtin') {
      p++;
      const args = [];
      if (isOp('(')) {
        p++;
        const sv = [noGt, noIn]; noGt = false; noIn = false;
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; skipNl(); args.push(expr()); } }
        [noGt, noIn] = sv; eat(')');
      } else if (k.v !== 'length') throw new CmdError(`syntax error: ${k.v} needs arguments`, 2);
      return { n: 'call', f: k.v, args };
    }
    if (k.t === 'name' && !KEYWORDS.has(k.v)) {
      p++;
      if (isOp('[')) {
        p++; const idx = [expr()]; while (isOp(',')) { p++; idx.push(expr()); } eat(']');
        return { n: 'idx', name: k.v, idx };
      }
      return { n: 'var', name: k.v };
    }
    throw new CmdError(`syntax error at source line 1: unexpected ${k.t === 'eof' ? 'end of program' : k.v ?? k.t}`, 2);
  };
  function incdec(fieldArg = false) {
    const e = primary();
    if (!fieldArg && (isOp('++') || isOp('--')) && ['var', 'idx', 'field'].includes(e.n)) { const op = T[p++].v; return { n: 'post', op, e }; }
    return e;
  }
  function power() {
    const b = incdec();
    if (isOp('^')) { p++; return { n: 'bin', op: '^', a: b, b: unaryOnly() }; }
    return b;
  }
  function unaryOnly() { if (isOp('-') || isOp('+') || isOp('!')) { const op = T[p++].v; return { n: 'un', op, e: unaryOnly() }; } return power(); }
  function unary() { return unaryOnly(); }
  const mul = () => { let a = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = T[p++].v; a = { n: 'bin', op, a, b: unary() }; } return a; };
  const add = () => { let a = mul(); while (isOp('+') || isOp('-')) { const op = T[p++].v; a = { n: 'bin', op, a, b: mul() }; } return a; };
  const startsOperand = () => {
    const k = T[p];
    if (k.t === 'num' || k.t === 'str' || k.t === 're' || k.t === 'builtin') return true;
    if (k.t === 'name') return !KEYWORDS.has(k.v) || false;
    return k.t === 'op' && ['$', '(', '!', '-', '+', '++', '--'].includes(k.v) && !['-', '+'].includes(k.v);
  };
  const concat = () => {
    let a = add();
    while (startsOperand() && !(T[p].t === 'name' && T[p].v === 'in')) a = { n: 'cat', a, b: add() };
    return a;
  };
  const cmp = () => {
    let a = concat();
    for (;;) {
      const k = T[p];
      if (k.t === 'op' && ['<', '<=', '==', '!=', '>='].includes(k.v) || (k.t === 'op' && k.v === '>' && !noGt)) { p++; a = { n: 'cmp', op: k.v, a, b: concat() }; }
      else return a;
    }
  };
  const mtch = () => {
    let a = cmp();
    while (isOp('~') || isOp('!~')) { const neg = T[p++].v === '!~'; a = { n: 'rematch', neg, a, b: cmp() }; }
    return a;
  };
  const inn = () => {
    let a = mtch();
    while (!noIn && isName('in')) { p++; const arr = T[p++].v; a = { n: 'in', k: a, arr }; }
    return a;
  };
  const and = () => { let a = inn(); while (isOp('&&')) { p++; skipNl(); a = { n: 'and', a, b: inn() }; } return a; };
  const or = () => { let a = and(); while (isOp('||')) { p++; skipNl(); a = { n: 'or', a, b: and() }; } return a; };
  const tern = () => {
    const c = or();
    if (isOp('?')) { p++; const a = tern(); eat(':'); const b = tern(); return { n: 'tern', c, a, b }; }
    return c;
  };
  function expr() {
    const l = tern();
    const k = T[p];
    if (k.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(k.v) && ['var', 'idx', 'field'].includes(l.n)) {
      p++; return { n: 'asg', op: k.v, l, r: expr() };
    }
    return l;
  }

  const endStmt = () => {
    if (isOp(';') || T[p].t === 'nl') { skipTerm(); return; }
    if (isOp('}') || T[p].t === 'eof') return;
    throw new CmdError(`syntax error at source line 1: unexpected ${T[p].v ?? T[p].t}`, 2);
  };
  const block = () => {
    eat('{');
    const list = [];
    skipTerm();
    while (!isOp('}')) {
      if (T[p].t === 'eof') throw new CmdError('syntax error: missing }', 2);
      list.push(stmt()); skipTerm();
    }
    p++;
    return { n: 'block', list };
  };
  function simple() {
    const k = T[p];
    if (k.t === 'name' && (k.v === 'print' || k.v === 'printf')) {
      p++;
      const args = [];
      noGt = true;
      let paren = false;
      if (isOp('(')) { // print (a, b) > "f"
        const save = p; p++;
        try { const sv = noGt; noGt = false; args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } noGt = sv; if (isOp(')') && (T[p + 1].t === 'nl' || T[p + 1].t === 'eof' || (T[p + 1].t === 'op' && [';', '}', '>', '>>'].includes(T[p + 1].v)))) { p++; paren = true; } else { args.length = 0; p = save; } }
        catch (e) { args.length = 0; p = save; }
      }
      if (!paren && !args.length && !(isOp(';') || isOp('}') || isOp('>') || isOp('>>') || T[p].t === 'nl' || T[p].t === 'eof')) {
        args.push(expr()); while (isOp(',')) { p++; skipNl(); args.push(expr()); }
      }
      noGt = false;
      let redir = null;
      if (isOp('>') || isOp('>>')) { const app = T[p++].v === '>>'; redir = { app, e: concat() }; }
      return { n: k.v, args, redir };
    }
    if (k.t === 'name' && k.v === 'next') { p++; return { n: 'next' }; }
    if (k.t === 'name' && k.v === 'break') { p++; return { n: 'break' }; }
    if (k.t === 'name' && k.v === 'continue') { p++; return { n: 'continue' }; }
    if (k.t === 'name' && k.v === 'exit') {
      p++;
      return { n: 'exit', e: (isOp(';') || isOp('}') || T[p].t === 'nl' || T[p].t === 'eof') ? null : expr() };
    }
    if (k.t === 'name' && k.v === 'delete') {
      p++; const name = T[p++].v;
      if (isOp('[')) { p++; const idx = [expr()]; while (isOp(',')) { p++; idx.push(expr()); } eat(']'); return { n: 'delete', name, idx }; }
      return { n: 'delete', name, idx: null };
    }
    return { n: 'expr', e: expr() };
  }
  function stmt() {
    skipNl();
    if (isOp('{')) return block();
    const k = T[p];
    if (k.t === 'name' && k.v === 'if') {
      p++; eat('('); const c = expr(); eat(')'); skipNl();
      const a = stmt();
      const save = p;
      skipTerm();
      if (isName('else')) { p++; skipNl(); return { n: 'if', c, a, b: stmt() }; }
      p = save;
      return { n: 'if', c, a, b: null };
    }
    if (k.t === 'name' && k.v === 'while') { p++; eat('('); const c = expr(); eat(')'); skipNl(); return { n: 'while', c, body: isOp(';') ? (p++, { n: 'block', list: [] }) : stmt() }; }
    if (k.t === 'name' && k.v === 'do') {
      p++; const body = stmt(); skipTerm();
      if (!isName('while')) throw new CmdError('syntax error: expected while', 2);
      p++; eat('('); const c = expr(); eat(')'); endStmt();
      return { n: 'do', c, body };
    }
    if (k.t === 'name' && k.v === 'for') {
      p++; eat('(');
      if (T[p].t === 'name' && T[p + 1].t === 'name' && T[p + 1].v === 'in' && T[p + 3]?.t === 'op' && T[p + 3].v === ')') {
        const v = T[p].v, arr = T[p + 2].v; p += 4; skipNl();
        return { n: 'forin', v, arr, body: stmt() };
      }
      const init = isOp(';') ? null : simple(); eat(';'); skipNl();
      const c = isOp(';') ? null : expr(); eat(';'); skipNl();
      const step = isOp(')') ? null : simple(); eat(')'); skipNl();
      return { n: 'for', init, c, step, body: isOp(';') ? (p++, { n: 'block', list: [] }) : stmt() };
    }
    const s = simple();
    endStmt();
    return s;
  }

  const rules = [];
  skipTerm();
  while (T[p].t !== 'eof') {
    const r = { pat: null, pat2: null, body: null, kind: 'main', on: false };
    if (isName('BEGIN')) { p++; r.kind = 'begin'; skipNl(); r.body = block(); }
    else if (isName('END')) { p++; r.kind = 'end'; skipNl(); r.body = block(); }
    else {
      if (!isOp('{')) { r.pat = expr(); if (isOp(',')) { p++; skipNl(); r.pat2 = expr(); } }
      if (isOp('{')) r.body = block();
    }
    rules.push(r);
    skipTerm();
  }
  return rules;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { val: 'Fvf', bool: '', long: { 'field-separator': 'F', assign: 'v', file: 'f' } });
    // opakované -v: parseArgs drží jen poslední, proto je vybereme ručně
    const assigns = [];
    for (let i = 0; i < ctx.args.length; i++) {
      if (ctx.args[i] === '-v') assigns.push(ctx.args[i + 1]);
      else if (/^-v./.test(ctx.args[i])) assigns.push(ctx.args[i].slice(2));
    }
    let progText;
    if (o.f !== undefined) { try { progText = ctx.fs.read(ctx.path(o.f), ctx.user); } catch (e) { throw new CmdError(`${o.f}: ${ctx.fsMsg(e)}`, 2); } }
    else if (rest.length) progText = rest.shift();
    else throw new CmdError('usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]', 2);
    // hodnota rest po odebrání -v hodnot: parseArgs je už zpracoval jako volby
    const rules = parse(progText);

    const vars = Object.create(null), arrs = Object.create(null), outs = new Map();
    vars.FS = o.F !== undefined ? o.F.replace(/\\t/g, '\t') : ' ';
    vars.OFS = ' '; vars.ORS = '\n'; vars.NR = 0; vars.NF = 0; vars.SUBSEP = '\x1c'; vars.FILENAME = ''; vars.RSTART = 0; vars.RLENGTH = -1;
    for (const a of assigns) { const m = /^([A-Za-z_]\w*)=(.*)$/s.exec(a ?? ''); if (m) vars[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t'); }

    let rec = '', fields = [];
    const looksNum = v => typeof v === 'number' || (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v));
    const toNum = v => { if (typeof v === 'number') return v; if (v === undefined) return 0; const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(String(v)); return m ? parseFloat(m[0]) : 0; };
    const toStr = v => { if (v === undefined) return ''; if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(6))); return String(v); };
    const toBool = v => (typeof v === 'number' ? v !== 0 : v !== undefined && v !== '');
    const reCache = new Map();
    const reOf = (s) => {
      if (!reCache.has(s)) { try { reCache.set(s, posixToJs(s, { ere: true })); } catch (e) { throw new CmdError(`syntax error in regular expression ${s}: ${e.message}`, 2); } }
      return reCache.get(s);
    };
    const splitRec = (s, fs) => {
      if (fs === ' ') return s.trim() === '' ? [] : s.trim().split(/\s+/);
      if (s === '') return [];
      if (fs.length === 1 && fs !== '\\') return s.split(fs);
      return s.split(new RegExp(reOf(fs).source, reOf(fs).flags));
    };
    const setRec = s => { rec = s; fields = splitRec(s, toStr(vars.FS)); vars.NF = fields.length; };
    const rebuild = () => { rec = fields.join(toStr(vars.OFS)); };
    const getField = i => (i === 0 ? rec : (fields[i - 1] ?? ''));
    const setField = (i, v) => {
      if (i === 0) { setRec(toStr(v)); return; }
      if (i < 0) throw new CmdError(`trying to access out of range field ${i}`, 2);
      while (fields.length < i) fields.push('');
      fields[i - 1] = toStr(v); vars.NF = fields.length; rebuild();
    };
    const arr = name => (arrs[name] ??= new Map());
    const key = idx => idx.map(e => toStr(ev(e))).join(toStr(vars.SUBSEP));

    const get = n => {
      if (n.n === 'var') {
        if (n.name === 'NF') return vars.NF;
        return vars[n.name];
      }
      if (n.n === 'idx') return arr(n.name).get(key(n.idx));
      return getField(Math.trunc(toNum(ev(n.e))));
    };
    const set = (n, v) => {
      if (n.n === 'var') {
        vars[n.name] = v;
        if (n.name === 'NF') { const c = Math.max(0, Math.trunc(toNum(v))); while (fields.length < c) fields.push(''); fields.length = c; vars.NF = c; rebuild(); }
      } else if (n.n === 'idx') arr(n.name).set(key(n.idx), v);
      else setField(Math.trunc(toNum(ev(n.e))), v);
      return v;
    };
    const arith = (op, a, b) => {
      switch (op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': if (b === 0) throw new CmdError('division by zero', 2); return a / b;
        case '%': if (b === 0) throw new CmdError('division by zero in %', 2); return a % b;
        default: return a ** b;
      }
    };
    const compare = (op, a, b) => {
      let c;
      if (looksNum(a) && looksNum(b)) c = toNum(a) - toNum(b);
      else { const x = toStr(a), y = toStr(b); c = x < y ? -1 : x > y ? 1 : 0; }
      return { '<': c < 0, '<=': c <= 0, '==': c === 0, '!=': c !== 0, '>': c > 0, '>=': c >= 0 }[op] ? 1 : 0;
    };
    const subst = (g, a) => {
      const re = reOf(a[0].n === 'match' ? a[0].re : toStr(ev(a[0])));
      const rep = toStr(ev(a[1]));
      const target = a[2] ?? { n: 'field', e: { n: 'num', v: 0 } };
      const src = toStr(get(target));
      let cnt = 0;
      const out = src.replace(new RegExp(re.source, re.flags + 'g'), (...m) => {
        if (!g && cnt) return m[0];
        cnt++;
        return rep.replace(/\\\\|\\&|&/g, x => (x === '&' ? m[0] : x === '\\&' ? '&' : '\\'));
      });
      if (cnt) set(target, out);
      return cnt;
    };

    function ev(n) {
      switch (n.n) {
        case 'num': case 'str': return n.v;
        case 'group': return ev(n.e);
        case 'match': return reOf(n.re).test(rec) ? 1 : 0;
        case 'var': case 'idx': case 'field': return get(n);
        case 'un': { const v = ev(n.e); return n.op === '!' ? (toBool(v) ? 0 : 1) : n.op === '-' ? -toNum(v) : toNum(v); }
        case 'bin': return arith(n.op, toNum(ev(n.a)), toNum(ev(n.b)));
        case 'cat': return toStr(ev(n.a)) + toStr(ev(n.b));
        case 'cmp': return compare(n.op, ev(n.a), ev(n.b));
        case 'rematch': { const s = toStr(ev(n.a)); const r = n.b.n === 'match' ? reOf(n.b.re) : reOf(toStr(ev(n.b))); return r.test(s) !== n.neg ? 1 : 0; }
        case 'in': return arr(n.arr).has(toStr(ev(n.k))) ? 1 : 0;
        case 'and': return toBool(ev(n.a)) && toBool(ev(n.b)) ? 1 : 0;
        case 'or': return toBool(ev(n.a)) || toBool(ev(n.b)) ? 1 : 0;
        case 'tern': return toBool(ev(n.c)) ? ev(n.a) : ev(n.b);
        case 'asg': {
          const v = n.op === '=' ? ev(n.r) : arith(n.op[0], toNum(get(n.l)), toNum(ev(n.r)));
          return set(n.l, v);
        }
        case 'pre': { const v = toNum(get(n.e)) + (n.op === '++' ? 1 : -1); set(n.e, v); return v; }
        case 'post': { const old = toNum(get(n.e)); set(n.e, old + (n.op === '++' ? 1 : -1)); return old; }
        case 'call': return call(n);
        default: throw new CmdError('internal awk error: ' + n.n, 2);
      }
    }
    function call(n) {
      const a = n.args, s = i => toStr(ev(a[i])), x = i => toNum(ev(a[i]));
      switch (n.f) {
        case 'length': {
          if (!a.length) return rec.length;
          if (a[0].n === 'var' && arrs[a[0].name] && vars[a[0].name] === undefined) return arrs[a[0].name].size;
          return s(0).length;
        }
        case 'substr': {
          const str = s(0);
          let st = Math.round(x(1)), len = a[2] ? Math.round(x(2)) : Infinity;
          let en = st + len;
          if (st < 1) st = 1;
          if (en > str.length + 1) en = str.length + 1;
          return en > st ? str.slice(st - 1, en - 1) : '';
        }
        case 'index': return s(0).indexOf(s(1)) + 1;
        case 'split': {
          const str = s(0), name = a[1].name, fs = a[2] ? (a[2].n === 'match' ? a[2].re : s(2)) : toStr(vars.FS);
          const parts = splitRec(str, fs), m = arr(name);
          m.clear();
          parts.forEach((v, i) => m.set(String(i + 1), v));
          return parts.length;
        }
        case 'sub': return subst(false, a);
        case 'gsub': return subst(true, a);
        case 'match': {
          const m = reOf(a[1].n === 'match' ? a[1].re : s(1)).exec(s(0));
          vars.RSTART = m ? m.index + 1 : 0; vars.RLENGTH = m ? m[0].length : -1;
          return vars.RSTART;
        }
        case 'toupper': return s(0).toUpperCase();
        case 'tolower': return s(0).toLowerCase();
        case 'sprintf': return sprintf(s(0), a.slice(1).map(e => ev(e)), { num: toNum, str: toStr }).text;
        case 'int': return Math.trunc(x(0));
        case 'sqrt': return Math.sqrt(x(0));
        case 'sin': return Math.sin(x(0));
        case 'cos': return Math.cos(x(0));
        case 'exp': return Math.exp(x(0));
        case 'log': return Math.log(x(0));
        case 'atan2': return Math.atan2(x(0), x(1));
        case 'rand': return Math.random();
        case 'srand': return 0;
        default: throw new CmdError(`function ${n.f} is not supported`, 2);
      }
    }

    let buf = '';
    const flush = async () => { if (buf) { const b = buf; buf = ''; await ctx.stdout.write(b); } };
    const emit = async (st, text) => {
      if (!st.redir) { buf += text; if (buf.length > 4096) await flush(); return; }
      const f = toStr(ev(st.redir.e));
      if (!outs.has(f)) outs.set(f, { text: st.redir.app && ctx.fs.exists?.(ctx.path(f)) ? ctx.fs.read(ctx.path(f), ctx.user) : '' });
      outs.get(f).text += text;
    };
    async function exec(s) {
      switch (s.n) {
        case 'block': for (const x of s.list) await exec(x); return;
        case 'expr': ev(s.e); return;
        case 'print': {
          const text = (s.args.length ? s.args.map(e => toStr(ev(e))).join(toStr(vars.OFS)) : rec) + toStr(vars.ORS);
          await emit(s, text); return;
        }
        case 'printf': {
          if (!s.args.length) throw new CmdError('printf: no format', 2);
          await emit(s, sprintf(toStr(ev(s.args[0])), s.args.slice(1).map(e => ev(e)), { num: toNum, str: toStr }).text); return;
        }
        case 'if': if (toBool(ev(s.c))) await exec(s.a); else if (s.b) await exec(s.b); return;
        case 'while':
          while (toBool(ev(s.c))) { ctx.check(); try { await exec(s.body); } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e; } }
          return;
        case 'do':
          do { ctx.check(); try { await exec(s.body); } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e; } } while (toBool(ev(s.c)));
          return;
        case 'for':
          if (s.init) await exec(s.init);
          while (!s.c || toBool(ev(s.c))) {
            ctx.check();
            try { await exec(s.body); } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e; }
            if (s.step) await exec(s.step);
          }
          return;
        case 'forin':
          for (const k of [...arr(s.arr).keys()]) {
            ctx.check(); vars[s.v] = k;
            try { await exec(s.body); } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e; }
          }
          return;
        case 'next': throw new Next();
        case 'break': throw new Brk();
        case 'continue': throw new Cont();
        case 'exit': throw new Exit(s.e ? Math.trunc(toNum(ev(s.e))) : null);
        case 'delete': if (s.idx) arr(s.name).delete(key(s.idx)); else arr(s.name).clear(); return;
        default: throw new CmdError('internal awk error: ' + s.n, 2);
      }
    }

    let code = 0, exited = false;
    const guard = async fn => {
      try { await fn(); } catch (e) {
        if (e instanceof Exit) { exited = true; if (e.code !== null) code = e.code; } else if (e instanceof Next) { /* další záznam */ } else throw e;
      }
    };
    for (const r of rules) if (r.kind === 'begin') await guard(() => exec(r.body));

    const needInput = !exited && rules.some(r => r.kind !== 'begin');
    if (needInput) {
      const feed = async (text, name) => {
        vars.FILENAME = name;
        const lines = text.split('\n');
        if (lines.at(-1) === '') lines.pop();
        for (const line of lines) {
          if (exited) return;
          ctx.check();
          vars.NR = toNum(vars.NR) + 1;
          setRec(line);
          for (const r of rules) {
            if (r.kind !== 'main' || exited) continue;
            let hit;
            if (!r.pat) hit = true;
            else if (!r.pat2) hit = toBool(ev(r.pat));
            else if (r.on) { hit = true; if (toBool(ev(r.pat2))) r.on = false; }
            else if (toBool(ev(r.pat))) { hit = true; r.on = !toBool(ev(r.pat2)); }
            else hit = false;
            if (!hit) continue;
            try {
              if (r.body) await exec(r.body); else await emit({}, rec + toStr(vars.ORS));
            } catch (e) {
              if (e instanceof Next) break;
              if (e instanceof Exit) { exited = true; if (e.code !== null) code = e.code; break; }
              throw e;
            }
          }
        }
      };
      let st = 0;
      if (!rest.length) await feed(await ctx.stdin.readAll(), '');
      else st = await ctx.each(rest, async a => { if (!exited) await feed(a === '-' ? await ctx.stdin.readAll() : ctx.fs.read(ctx.path(a), ctx.user), a === '-' ? '' : a); });
      if (st && !code) code = 2;
    }
    // END běží i po exit v hlavní části (ne po exit v BEGIN)
    for (const r of rules) if (r.kind === 'end') { exited = false; await guard(() => exec(r.body)); break; }
    await flush();
    for (const [f, v] of outs) { try { ctx.fs.write(ctx.path(f), v.text, ctx.user); } catch (e) { throw new CmdError(`${f}: ${ctx.fsMsg(e)}`, 2); } }
    return code;
  },
};
