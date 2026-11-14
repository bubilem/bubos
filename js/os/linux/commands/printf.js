import { CmdError } from '../../../core/util.js';
import { sprintf } from '../lib.js';

// Zpracuje escape sekvence (\n \t \\ \" \a \b \f \r \v \0NNN \xHH \uHHHH)
export function unescape(s) {
  return s.replace(/\\(?:([abfnrtv\\"'])|0?([0-7]{1,3})|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{4}))/g, (m, c, oct, hex, u) => {
    if (c) return { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" }[c];
    return String.fromCodePoint(oct ? parseInt(oct, 8) : parseInt(hex ?? u, 16));
  });
}

export default {
  async run(ctx) {
    if (!ctx.args.length) throw new CmdError('usage: printf FORMAT [ARGUMENT]...', 2);
    const [fmtRaw, ...args] = ctx.args;
    const fmt = unescape(fmtRaw);
    let bad = 0;
    const num = v => {
      if (v === undefined || v === '') return 0;
      if (/^['"]./.test(v)) return v.codePointAt(1);
      const n = Number(v);
      if (Number.isNaN(n)) { bad = 1; return 0; }
      return n;
    };
    // %b = řetězec s escape sekvencemi
    const f = fmt.replace(/%(?!%)([-+ #0]*\d*(?:\.\d*)?)b/g, '%$1s');
    const bIdx = [];
    let k = 0;
    for (const m of fmt.matchAll(/%(%|[-+ #0]*(?:\*|\d+)?(?:\.(?:\*|\d*))?(?:hh|h|ll|l|L)?[a-zA-Z])/g)) {
      if (m[1] === '%') continue;
      if (m[1].endsWith('b')) bIdx.push(k);
      k += 1 + (m[1].match(/\*/g) || []).length;
    }
    let rest = args, first = true;
    // formát se opakuje, dokud zbývají argumenty
    for (;;) {
      const a = rest.map((v, i) => (bIdx.includes(i) ? unescape(v) : v));
      const { text, used } = sprintf(f, a, { num, str: v => (v === undefined ? '' : String(v)) });
      await ctx.stdout.write(text);
      rest = rest.slice(used);
      first = false;
      if (!used || !rest.length) break;
    }
    void first;
    return bad;
  },
};
