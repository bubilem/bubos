// Převod POSIX regulárních výrazů (BRE / ERE, jak je znají grep a sed) na JS RegExp.
// Výuková věrnost: podporuje třídy [[:alpha:]], intervaly, \< \>, zpětné reference, GNU rozšíření \| \+ \?.

const CLASSES = {
  alpha: '\\p{L}', digit: '0-9', alnum: '\\p{L}\\p{N}', upper: '\\p{Lu}', lower: '\\p{Ll}',
  space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', print: ' -~',
  graph: '!-~', cntrl: '\\x00-\\x1f\\x7f', xdigit: '0-9A-Fa-f',
};
const escOut = c => (/[\\^$.*+?()[\]{}|/]/.test(c) ? '\\' + c : c);
const escIn = c => (/[\\\]\[^-]/.test(c) ? '\\' + c : c);

function bracket(s, i) {
  let j = i + 1, neg = false, items = '', first = true;
  if (s[j] === '^') { neg = true; j++; }
  for (;;) {
    if (j >= s.length) throw new Error('Unmatched [, [^, [:, [., or [=');
    const c = s[j];
    if (c === ']' && !first) { j++; break; }
    first = false;
    if (c === '[' && s[j + 1] === ':') {
      const k = s.indexOf(':]', j + 2);
      if (k > 0) {
        const nm = s.slice(j + 2, k);
        if (!(nm in CLASSES)) throw new Error('Invalid character class name');
        items += CLASSES[nm]; j = k + 2; continue;
      }
    }
    if (c === '-' && items && s[j + 1] !== ']') { items += '-'; j++; continue; }
    items += escIn(c); j++;
  }
  return { js: '[' + (neg ? '^' : '') + items + ']', end: j };
}

export function posixToJs(src, { ere = false, icase = false, fixed = false } = {}) {
  const flags = icase ? 'iu' : 'u';
  if (fixed) return new RegExp([...src].map(escOut).join(''), flags);
  let out = '', i = 0, atStart = true;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    let startNext = false;
    if (c === '\\') {
      const d = src[i + 1];
      if (d === undefined) throw new Error('Trailing backslash');
      i += 2;
      if (!ere && d === '(') { out += '('; startNext = true; }
      else if (!ere && d === ')') out += ')';
      else if (!ere && d === '{') {
        const j = src.indexOf('\\}', i);
        if (j < 0) throw new Error('Unmatched \\{');
        out += '{' + src.slice(i, j) + '}'; i = j + 2;
      }
      else if (!ere && d === '|') { out += '|'; startNext = true; }
      else if (!ere && (d === '+' || d === '?')) out += d;
      else if (d === '<' || d === '>') out += '\\b';
      else if ('bBwWsS'.includes(d)) out += '\\' + d;
      else if (/[1-9]/.test(d)) out += '\\' + d;
      else out += escOut(d);
    } else if (c === '[') {
      const r = bracket(src, i); out += r.js; i = r.end;
    } else if (c === '*') {
      out += atStart ? '\\*' : '*'; i++;
    } else if (c === '^') {
      out += (ere || atStart) ? '^' : '\\^'; i++;
      startNext = atStart && !ere;
    } else if (c === '$') {
      const rest = src.slice(i + 1);
      const last = rest === '' || (!ere && (rest.startsWith('\\)') || rest.startsWith('\\|'))) || (ere && (rest[0] === ')' || rest[0] === '|'));
      out += (ere || last) ? '$' : '\\$'; i++;
    } else if (ere && c === '(') { out += '('; startNext = true; i++; }
    else if (ere && c === '|') { out += '|'; startNext = true; i++; }
    else if (ere && (c === ')' || c === '+' || c === '?')) { out += c; i++; }
    else if (ere && c === '{') {
      const m = /^\{\d+(,\d*)?\}/.exec(src.slice(i));
      if (m) { out += m[0]; i += m[0].length; } else { out += '\\{'; i++; }
    }
    else { out += (c === '.') ? '.' : escOut(c); i++; }
    atStart = startNext;
  }
  return new RegExp(out, flags);
}
