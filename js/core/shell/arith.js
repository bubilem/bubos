// Aritmetika shellu pro $((…)), ((…)), let a for ((…)): celá čísla, proměnné, přiřazení, ++/--, ?:, && || a bitové operátory
import { CmdError } from '../util.js';

const TOKEN = /\s*(0[xX][0-9a-fA-F]+|\d+|\$\{?\d+\}?|\$[#?]|\$?\{?[A-Za-z_]\w*\}?|\*\*=?|<<=?|>>=?|<=|>=|==|!=|&&|\|\||\+\+|--|[-+*/%&|^]=|[-+*/%<>=!~&|^?:(),])/y;
const ASSIGN = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '**='];
// priorita binárních operátorů (vyšší váže silněji)
const PREC = { '||': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8, '<': 9, '<=': 9, '>': 9, '>=': 9, '<<': 10, '>>': 10, '+': 11, '-': 11, '*': 12, '/': 12, '%': 12, '**': 13 };

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new CmdError(`${src}: syntax error: invalid arithmetic operator (error token is "${src.slice(pos).trim()}")`);
    pos = TOKEN.lastIndex;
    const s = m[1];
    if (/^0[xX]/.test(s)) out.push({ n: parseInt(s, 16) });
    else if (/^\d+$/.test(s)) out.push({ n: /^0\d/.test(s) ? parseInt(s, 8) : +s });
    else if (/^[$A-Za-z_{]/.test(s)) out.push({ id: s.replace(/[${}]/g, '') });    else out.push(s);
  }
  return out;
}

// env: { get(name) → řetězec|undefined, set(name, text) }
export function evalArith(src, env) {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const fail = msg => { throw new CmdError(`${src.trim()}: ${msg}`); };
  const num = name => {
    const v = env.get(name);
    if (v === undefined || v === '') return 0;
    const x = /^\s*-?\d+\s*$/.test(v) ? parseInt(v, 10) : evalArith(v, env); // proměnná může obsahovat výraz
    return x;
  };

  // vrací funkci () → číslo (kvůli zkratovému vyhodnocení && || ?:)
  function operand() {
    const k = t[p++];
    if (k === undefined) fail('syntax error: operand expected');
    if (k.n !== undefined) return () => k.n;
    if (k.id !== undefined) {
      const name = k.id, nx = peek();
      if (nx === '++' || nx === '--') { p++; return () => { const o = num(name); env.set(name, String(o + (nx === '++' ? 1 : -1))); return o; }; }
      if (ASSIGN.includes(nx)) {
        p++;
        const rhs = expr(1);
        return () => {
          let v = rhs();
          if (nx !== '=') v = binary(nx.slice(0, -1), num(name), v);
          env.set(name, String(v));
          return v;
        };
      }
      return () => num(name);
    }
    if (k === '(') {
      const e = expr(0);
      if (t[p++] !== ')') fail("syntax error: missing `)'");
      return e;
    }
    if (k === '++' || k === '--') {
      const id = t[p++];
      if (id?.id === undefined) fail('syntax error: variable expected');
      return () => { const v = num(id.id) + (k === '++' ? 1 : -1); env.set(id.id, String(v)); return v; };
    }
    if (k === '-' || k === '+' || k === '!' || k === '~') {
      const e = unary();
      return () => { const v = e(); return k === '-' ? -v : k === '+' ? v : k === '!' ? (v ? 0 : 1) : ~v; };
    }
    return fail(`syntax error: unexpected token '${k}'`);
  }
  function unary() { return operand(); }

  function binary(op, a, b) {
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': if (b === 0) fail('division by 0'); return Math.trunc(a / b);
      case '%': if (b === 0) fail('division by 0'); return a % b;
      case '**': return a ** b;
      case '<<': return a << b; case '>>': return a >> b;
      case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
      case '<': return +(a < b); case '<=': return +(a <= b); case '>': return +(a > b); case '>=': return +(a >= b);
      case '==': return +(a === b); case '!=': return +(a !== b);
      default: return fail(`unknown operator ${op}`);
    }
  }

  // minPrec: 0 = i čárka, 1 = přiřazení, 2 = ternární, 3+ = binární
  function expr(minPrec) {
    let left = operand();
    for (;;) {
      const op = peek();
      if (op === ',' && minPrec === 0) { p++; const a = left, b = expr(1); left = () => { a(); return b(); }; continue; }
      if (op === '?' && minPrec <= 2) {
        p++;
        const a = expr(1);
        if (t[p++] !== ':') fail("syntax error: `:' expected for conditional expression");
        const b = expr(2), c = left;
        left = () => (c() ? a() : b());
        continue;
      }
      const pr = PREC[op];
      if (pr === undefined || pr < Math.max(minPrec, 3)) break;
      p++;
      const right = expr(op === '**' ? pr : pr + 1), a = left;
      if (op === '&&') left = () => (a() && right() ? 1 : 0);
      else if (op === '||') left = () => (a() || right() ? 1 : 0);
      else left = () => binary(op, a(), right());
    }
    return left;
  }

  if (!t.length) return 0;
  const f = expr(0);
  if (p < t.length) fail(`syntax error in expression (error token is "${t.slice(p).map(x => x.id ?? x.n ?? x).join(' ')}")`);
  return f();
}
