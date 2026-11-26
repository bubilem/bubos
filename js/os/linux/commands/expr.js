import { CmdError } from '../../../core/util.js';
import { posixToJs } from '../../../core/regex.js';

const isNull = v => v === '' || /^-?0+$/.test(v);
const isInt = v => /^-?\d+$/.test(v);
const fail = msg => { throw new CmdError(msg, 2); };

// řetězec : vzor – délka shody od začátku, nebo obsah první skupiny \( \)
function match(str, pattern) {
  let re;
  try { re = new RegExp('^(?:' + posixToJs(pattern).source + ')', 'u'); }
  catch (e) { return fail(e.message); }
  const grouped = pattern.includes('\\(');
  const m = re.exec(str);
  if (grouped) return m?.[1] ?? '';
  return String(m ? [...m[0]].length : 0);
}

const compare = {
  '=': c => c === 0, '!=': c => c !== 0, '<': c => c < 0, '<=': c => c <= 0, '>': c => c > 0, '>=': c => c >= 0,
};

// Rekurzivní sestup podle priority: | < & < porovnání < +- < */% < : < funkce a závorky
function evaluate(tokens) {
  let p = 0;
  const next = () => (p < tokens.length ? tokens[p++] : fail('syntax error: missing argument'));
  const accept = (...ops) => (ops.includes(tokens[p]) ? tokens[p++] : null);
  const int = v => (isInt(v) ? BigInt(v) : fail('non-integer argument'));

  function or() {
    let v = and();
    while (accept('|')) { const r = and(); v = !isNull(v) ? v : !isNull(r) ? r : '0'; }
    return v;
  }
  function and() {
    let v = rel();
    while (accept('&')) { const r = rel(); v = !isNull(v) && !isNull(r) ? v : '0'; }
    return v;
  }
  function rel() {
    let v = add(), op;
    while ((op = accept(...Object.keys(compare)))) {
      const r = add();
      const c = isInt(v) && isInt(r) ? (BigInt(v) < BigInt(r) ? -1 : BigInt(v) > BigInt(r) ? 1 : 0) : v < r ? -1 : v > r ? 1 : 0;
      v = compare[op](c) ? '1' : '0';
    }
    return v;
  }
  function add() {
    let v = mul(), op;
    while ((op = accept('+', '-'))) { const a = int(v), b = int(mul()); v = String(op === '+' ? a + b : a - b); }
    return v;
  }
  function mul() {
    let v = colon(), op;
    while ((op = accept('*', '/', '%'))) {
      const a = int(v), b = int(colon());
      if (op !== '*' && b === 0n) fail('division by zero');
      v = String(op === '*' ? a * b : op === '/' ? a / b : a % b);
    }
    return v;
  }
  function colon() {
    let v = primary();
    while (accept(':')) v = match(v, primary());
    return v;
  }
  function primary() {
    const t = next();
    if (t === '(') {
      const v = or();
      if (!accept(')')) fail("syntax error: expecting ')'");
      return v;
    }
    // klíčové slovo bez argumentů je obyčejný řetězec
    if (p < tokens.length) {
      if (t === 'length') return String([...primary()].length);
      if (t === 'match') { const s = primary(); return match(s, primary()); }
      if (t === 'index') {
        const s = [...primary()], set = primary();
        return String(s.findIndex(c => set.includes(c)) + 1);
      }
      if (t === 'substr') {
        const s = [...primary()], from = primary(), len = primary();
        if (!isInt(from) || !isInt(len) || +from < 1 || +len < 1) return '';
        return s.slice(+from - 1, +from - 1 + +len).join('');
      }
    }
    return t;
  }

  const result = or();
  if (p < tokens.length) fail(`syntax error: unexpected argument '${tokens[p]}'`);
  return result;
}

export default {
  async run(ctx) {
    if (!ctx.args.length) fail('missing operand');
    const v = evaluate(ctx.args);
    await ctx.stdout.write(v + '\n');
    return isNull(v) ? 1 : 0;
  },
};
