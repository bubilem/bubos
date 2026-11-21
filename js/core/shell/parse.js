// Lexer + parser příkazové řádky i skriptů (bash-like): roury, seznamy, if/for/while/until/case, funkce, { }, ( ), ((…)).
// Slovo = pole částí: {t:'lit',s,q} | {t:'var',name,mod,arg,q} | {t:'cmd',src,q} | {t:'arith',src,q} | {t:'tilde'}; q = bylo v uvozovkách.
export class SyntaxErr extends Error {}
// Vstup je zatím neúplný (chybí fi, done, uzavírací uvozovka…): interaktivní shell se zeptá na další řádek
export class IncompleteErr extends SyntaxErr {}

const OPS = [';;', '&&', '||', '>>', '>&', '&>', '|', '&', ';', '>', '<', '(', ')'];
const REDIR = ['>', '>>', '<', '>&', '&>'];

// Je text uvnitř $( … ) ve skutečnosti aritmetika $(( … ))?
const isArith = s => {
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let d = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '(') d++;
    else if (s[k] === ')' && --d === 0 && k < s.length - 1) return false;
  }
  return true;
};

export function lex(src) {
  const toks = [];
  let parts = null, i = 0;
  const n = src.length;
  const add = p => { (parts ??= []).push(p); };
  const lit = (s, q) => {
    parts ??= [];
    const l = parts[parts.length - 1];
    if (l && l.t === 'lit' && l.q === q) l.s += s; else parts.push({ t: 'lit', s, q });
  };
  const end = () => { if (parts) { toks.push({ type: 'word', parts }); parts = null; } };

  const readParen = start => {
    let depth = 1, j = start, q = null;
    while (j < n) {
      const c = src[j];
      if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') j++; }
      else if (c === "'" || c === '"') q = c;
      else if (c === '\\') j++;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return [src.slice(start, j), j + 1];
      j++;
    }
    throw new IncompleteErr("unexpected EOF while looking for matching `)'");
  };
  const dollar = q => {
    const c = src[i + 1];
    if (c === '(') {
      const [s, j] = readParen(i + 2);
      add(isArith(s) ? { t: 'arith', src: s.slice(1, -1), q } : { t: 'cmd', src: s, q });
      i = j; return;
    }
    if (c === '{') {
      const j = src.indexOf('}', i + 2);
      if (j < 0) throw new IncompleteErr('bad substitution');
      const body = src.slice(i + 2, j);
      let m = /^#([A-Za-z_]\w*|[@*])$/.exec(body);
      if (m) { add({ t: 'var', name: m[1], mod: 'len', q }); i = j + 1; return; }
      m = /^([A-Za-z_]\w*|\?|[0-9]+|[@*#])(?:(:-|:=|:\+|-|=|\+|%%|%|##|#|\/\/|\/|:)(.*))?$/s.exec(body);
      if (!m) throw new SyntaxErr('${' + body + '}: bad substitution');
      add({ t: 'var', name: m[1], mod: m[2], arg: m[3], q }); i = j + 1; return;
    }
    const m = /^(?:[A-Za-z_]\w*|[?$0-9#@*!])/.exec(src.slice(i + 1));
    if (m) { add({ t: 'var', name: m[0], q }); i += 1 + m[0].length; }
    else { lit('$', q); i++; }
  };
  const backtick = q => {
    const j = src.indexOf('`', i + 1);
    if (j < 0) throw new IncompleteErr("unexpected EOF while looking for matching ``'");
    add({ t: 'cmd', src: src.slice(i + 1, j), q }); i = j + 1;
  };

  while (i < n) {
    const c = src[i];
    if (c === '\n') { end(); toks.push({ type: 'op', op: '\n', fd: null }); i++; }
    else if (c === ' ' || c === '\t') { end(); i++; }
    else if (c === '#' && !parts) { while (i < n && src[i] !== '\n') i++; }
    else if (c === '\\') {
      if (src[i + 1] === '\n') i += 2; // spojení řádků
      else { if (i + 1 < n) lit(src[i + 1], true); i += 2; }
    }
    else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new IncompleteErr("unexpected EOF while looking for matching `''");
      lit(src.slice(i + 1, j), true); i = j + 1;
    }
    else if (c === '"') {
      i++; lit('', true);
      for (;;) {
        if (i >= n) throw new IncompleteErr("unexpected EOF while looking for matching `\"'");
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && i + 1 < n && '$"\\`'.includes(src[i + 1])) { lit(src[i + 1], true); i += 2; }
        else if (d === '\\' && src[i + 1] === '\n') i += 2;
        else if (d === '$') dollar(true);
        else if (d === '`') backtick(true);
        else { lit(d, true); i++; }
      }
    }
    else if (c === '$') dollar(false);
    else if (c === '`') backtick(false);
    else if (c === '~' && !parts && (i + 1 >= n || /[\s/|&;<>]/.test(src[i + 1]))) { add({ t: 'tilde' }); i++; }
    else if (c === '(' && src[i + 1] === '(' && !parts && (() => {
      let d = 0;
      for (let k = i + 2; k < n; k++) {
        if (src[k] === '(') d++;
        else if (src[k] === ')') { if (d === 0 && src[k + 1] === ')') { toks.push({ type: 'arith', src: src.slice(i + 2, k) }); i = k + 2; return true; } d--; }
      }
      return false;
    })()) { /* ((…)) přečteno */ }
    else if ('|&;<>()'.includes(c)) {
      let fd = null;
      if ((c === '<' || c === '>') && parts && parts.length === 1 && parts[0].t === 'lit' && !parts[0].q && /^[0-2]$/.test(parts[0].s)) {
        fd = +parts[0].s; parts = null;
      } else end();
      const op = OPS.find(o => src.startsWith(o, i));
      i += op.length;
      toks.push({ type: 'op', op, fd });
    }
    else { lit(c, false); i++; }
  }
  end();
  return toks;
}

export function parse(src, { aliases = {} } = {}) {
  const toks = lex(src);
  let p = 0;
  const plainWord = t => (t?.type === 'word' && t.parts.length === 1 && t.parts[0].t === 'lit' && !t.parts[0].q ? t.parts[0].s : null);
  const isOp = (o, t = toks[p]) => t?.type === 'op' && t.op === o;
  const tokName = t => (t.type === 'op' ? (t.op === '\n' ? 'newline' : t.op) : plainWord(t) ?? 'word');
  const syntax = t => (t ? new SyntaxErr(`syntax error near unexpected token \`${tokName(t)}'`) : new IncompleteErr('syntax error: unexpected end of file'));
  const skipNl = () => { while (isOp('\n')) p++; };
  const skipSeps = () => { while (isOp('\n') || isOp(';')) p++; };
  const expectWord = w => {
    if (p >= toks.length) throw syntax(null);
    if (plainWord(toks[p]) !== w) throw syntax(toks[p]);
    p++;
  };
  const expectOp = o => {
    if (p >= toks.length) throw syntax(null);
    if (!isOp(o)) throw syntax(toks[p]);
    p++;
  };

  // alias se rozvine textově na začátku příkazu (jako v bashi), každý jen jednou
  const expandAlias = () => {
    const seen = new Set();
    for (;;) {
      const w = plainWord(toks[p]);
      if (w == null || !Object.hasOwn(aliases, w) || seen.has(w)) return;
      seen.add(w);
      toks.splice(p, 1, ...lex(aliases[w]));
    }
  };

  const atStop = stops => {
    const t = toks[p];
    if (!t) return true;
    if (t.type === 'op') return t.op === ')' || t.op === ';;';
    const w = plainWord(t);
    return w != null && stops.has(w);
  };

  // přesměrování za příkazem
  function redirsInto(list) {
    while (toks[p]?.type === 'op' && REDIR.includes(toks[p].op)) {
      const t = toks[p], w = toks[p + 1];
      if (w?.type !== 'word') throw syntax(w);
      list.push({ fd: t.fd ?? (t.op === '<' ? 0 : 1), op: t.op, target: w.parts });
      p += 2;
    }
  }

  const ENDERS = new Set(['then', 'elif', 'else', 'fi', 'do', 'done', 'esac']);

  function compound() {
    const t = toks[p], w = plainWord(t);
    let node = null;
    if (t.type === 'arith') { p++; node = { kind: 'arith', src: t.src }; }
    else if (isOp('(')) {
      p++;
      const body = list(new Set());
      expectOp(')');
      node = { kind: 'subshell', body };
    }
    else if (w === '{') {
      p++;
      const body = list(new Set(['}']));
      expectWord('}');
      node = { kind: 'group', body };
    }
    else if (w === 'if') {
      p++;
      const clauses = [];
      let orelse = null;
      for (;;) {
        const cond = list(new Set(['then']));
        expectWord('then');
        const body = list(new Set(['elif', 'else', 'fi']));
        clauses.push({ cond, body });
        if (plainWord(toks[p]) === 'elif') { p++; continue; }
        if (plainWord(toks[p]) === 'else') { p++; orelse = list(new Set(['fi'])); }
        expectWord('fi');
        break;
      }
      node = { kind: 'if', clauses, orelse };
    }
    else if (w === 'while' || w === 'until') {
      p++;
      const cond = list(new Set(['do']));
      expectWord('do');
      const body = list(new Set(['done']));
      expectWord('done');
      node = { kind: 'while', until: w === 'until', cond, body };
    }
    else if (w === 'for') {
      p++;
      if (p >= toks.length) throw syntax(null);
      if (toks[p].type === 'arith') {
        const [init = '', cond = '', step = ''] = toks[p].src.split(';');
        p++; skipSeps();
        expectWord('do');
        const body = list(new Set(['done']));
        expectWord('done');
        node = { kind: 'cfor', init, cond, step, body };
      } else {
        const name = plainWord(toks[p]);
        if (name == null || !/^[A-Za-z_]\w*$/.test(name)) throw syntax(toks[p]);
        p++;
        let words = null;
        skipNl();
        if (plainWord(toks[p]) === 'in') {
          p++; words = [];
          while (toks[p]?.type === 'word') words.push(toks[p++].parts);
        }
        skipSeps();
        expectWord('do');
        const body = list(new Set(['done']));
        expectWord('done');
        node = { kind: 'for', name, words, body };
      }
    }
    else if (w === 'case') {
      p++;
      const subject = toks[p];
      if (subject?.type !== 'word') throw syntax(subject ?? null);
      p++; skipNl();
      expectWord('in');
      const clauses = [];
      for (;;) {
        skipSeps();
        if (p >= toks.length) throw syntax(null);
        if (plainWord(toks[p]) === 'esac') { p++; break; }
        if (isOp('(')) p++;
        const pats = [];
        for (;;) {
          const x = toks[p];
          if (x?.type !== 'word') throw syntax(x ?? null);
          pats.push(x.parts); p++;
          if (isOp('|')) { p++; continue; }
          break;
        }
        expectOp(')');
        const body = list(new Set(['esac']));
        clauses.push({ pats, body });
        if (isOp(';;')) p++;
      }
      node = { kind: 'case', subject: subject.parts, clauses };
    }
    else if (w === 'function') {
      p++;
      const name = plainWord(toks[p]);
      if (name == null) throw syntax(toks[p] ?? null);
      p++;
      if (isOp('(')) { p++; expectOp(')'); }
      skipNl();
      node = { kind: 'funcdef', name, body: command() };
    }
    if (!node) return null;
    node.redirs = [];
    redirsInto(node.redirs);
    return node;
  }

  function command() {
    expandAlias();
    if (p >= toks.length) throw syntax(null);
    const w0 = plainWord(toks[p]);
    // definice funkce: jmeno() { … }
    if (w0 != null && /^[\w.-]+$/.test(w0) && isOp('(', toks[p + 1]) && isOp(')', toks[p + 2])) {
      p += 3; skipNl();
      return { kind: 'funcdef', name: w0, body: command(), redirs: [] };
    }
    const c = compound();
    if (c) return c;
    if (w0 != null && ENDERS.has(w0)) throw syntax(toks[p]);

    const cmd = { assigns: [], words: [], redirs: [] };
    let dbl = false; // uvnitř [[ … ]] jsou && a || částí podmínky
    for (; p < toks.length; p++) {
      const t = toks[p];
      if (t.type === 'word') {
        if (!cmd.words.length) {
          const f = t.parts[0];
          const m = f.t === 'lit' && !f.q ? /^([A-Za-z_]\w*)=/.exec(f.s) : null;
          if (m) {
            cmd.assigns.push({ name: m[1], parts: [{ ...f, s: f.s.slice(m[0].length) }, ...t.parts.slice(1)] });
            continue;
          }
        }
        if (plainWord(t) === '[[' && !cmd.words.length) dbl = true;
        else if (plainWord(t) === ']]') dbl = false;
        // uvnitř [[ ]] se slova nedělí ani nerozbalují na soubory
        cmd.words.push(dbl && plainWord(t) !== ']]' ? t.parts.map(x => ({ ...x, q: true })) : t.parts);
      } else if (dbl && (t.op === '&&' || t.op === '||')) {
        cmd.words.push([{ t: 'lit', s: t.op === '&&' ? '-a' : '-o', q: true }]);
      } else if (REDIR.includes(t.op)) {
        const w = toks[p + 1];
        if (w?.type !== 'word') throw syntax(w);
        cmd.redirs.push({ fd: t.fd ?? (t.op === '<' ? 0 : 1), op: t.op, target: w.parts });
        p++;
      } else break;
    }
    if (!cmd.words.length && !cmd.assigns.length && !cmd.redirs.length) throw syntax(toks[p]);
    return cmd;
  }

  function pipeline() {
    let neg = false;
    if (plainWord(toks[p]) === '!') { neg = true; p++; }
    const cmds = [command()];
    while (isOp('|')) {
      p++; skipNl();
      if (p >= toks.length) throw syntax(null);
      cmds.push(command());
    }
    return { cmds, neg };
  }

  function list(stops) {
    const items = [];
    let op = ';';
    skipSeps();
    while (!atStop(stops)) {
      const pipe = pipeline();
      let bg = false, next = ';';
      const t = toks[p];
      if (t) {
        if (t.op === '&') { bg = true; p++; }
        else if (t.op === ';' || t.op === '\n') p++;
        else if (t.op === '&&' || t.op === '||') { next = t.op; p++; skipNl(); if (p >= toks.length) throw syntax(null); }
        else if (t.op === ')' || t.op === ';;') { /* konec seznamu řeší volající */ }
        else throw syntax(t);
      }
      items.push({ pipe, op, bg });
      op = next;
      skipSeps();
    }
    return { items };
  }

  const ast = list(new Set());
  if (p < toks.length) throw syntax(toks[p]);
  ast.src = src;
  return ast;
}
