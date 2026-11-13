// Lexer + parser příkazové řádky (bash-like).
// Slovo = pole částí: {t:'lit',s,q} | {t:'var',name,def,q} | {t:'cmd',src,q} | {t:'tilde'}; q = bylo v uvozovkách.
export class SyntaxErr extends Error {}

const OPS = ['&&', '||', '>>', '>&', '&>', '|', '&', ';', '>', '<'];

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
    throw new SyntaxErr("unexpected EOF while looking for matching `)'");
  };
  const dollar = q => {
    const c = src[i + 1];
    if (c === '(') { const [s, j] = readParen(i + 2); add({ t: 'cmd', src: s, q }); i = j; return; }
    if (c === '{') {
      const j = src.indexOf('}', i + 2);
      if (j < 0) throw new SyntaxErr('bad substitution');
      const body = src.slice(i + 2, j);
      const m = /^([A-Za-z_]\w*|\?)(?::-(.*))?$/s.exec(body);
      if (!m) throw new SyntaxErr('${' + body + '}: bad substitution');
      add({ t: 'var', name: m[1], def: m[2], q }); i = j + 1; return;
    }
    const m = /^(?:[A-Za-z_]\w*|[?$0-9])/.exec(src.slice(i + 1));
    if (m) { add({ t: 'var', name: m[0], q }); i += 1 + m[0].length; }
    else { lit('$', q); i++; }
  };
  const backtick = q => {
    const j = src.indexOf('`', i + 1);
    if (j < 0) throw new SyntaxErr("unexpected EOF while looking for matching ``'");
    add({ t: 'cmd', src: src.slice(i + 1, j), q }); i = j + 1;
  };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { end(); i++; }
    else if (c === '#' && !parts) break;
    else if (c === '\\') { if (i + 1 < n) lit(src[i + 1], true); i += 2; }
    else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new SyntaxErr("unexpected EOF while looking for matching `''");
      lit(src.slice(i + 1, j), true); i = j + 1;
    }
    else if (c === '"') {
      i++; lit('', true);
      for (;;) {
        if (i >= n) throw new SyntaxErr("unexpected EOF while looking for matching `\"'");
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && i + 1 < n && '$"\\`'.includes(src[i + 1])) { lit(src[i + 1], true); i += 2; }
        else if (d === '$') dollar(true);
        else if (d === '`') backtick(true);
        else { lit(d, true); i++; }
      }
    }
    else if (c === '$') dollar(false);
    else if (c === '`') backtick(false);
    else if (c === '~' && !parts && (i + 1 >= n || /[\s/|&;<>]/.test(src[i + 1]))) { add({ t: 'tilde' }); i++; }
    else if ('|&;<>'.includes(c)) {
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
  const syntax = t => new SyntaxErr(t ? `syntax error near unexpected token \`${t.type === 'op' ? t.op : 'word'}'` : 'syntax error: unexpected end of input');

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

  function command() {
    const cmd = { assigns: [], words: [], redirs: [] };
    expandAlias();
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
        cmd.words.push(t.parts);
      } else if (['>', '>>', '<', '>&', '&>'].includes(t.op)) {
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
    const cmds = [command()];
    while (toks[p]?.type === 'op' && toks[p].op === '|') {
      p++;
      if (p >= toks.length) throw syntax(null);
      cmds.push(command());
    }
    return { cmds };
  }

  const items = [];
  let op = ';';
  while (p < toks.length) {
    const pipe = pipeline();
    let bg = false, next = ';';
    const t = toks[p];
    if (t) {
      if (t.op === '&') { bg = true; p++; }
      else if (t.op === ';') p++;
      else if (t.op === '&&' || t.op === '||') { next = t.op; p++; if (p >= toks.length) throw syntax(null); }
      else throw syntax(t);
    }
    items.push({ pipe, op, bg });
    op = next;
  }
  return { items, src };
}
