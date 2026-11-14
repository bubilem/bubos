import { parseArgs } from '../../../core/args.js';
import { CmdError } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';

const NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  cs: ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'],
};
const HEAD = { en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], cs: ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'] };

// Jeden měsíc jako pole řádků široké 20 znaků
function month(y, m, monFirst, lang, today) {
  const head = (HEAD[lang] ?? HEAD.en);
  const days = monFirst ? [...head.slice(1), head[0]] : head;
  const title = `${(NAMES[lang] ?? NAMES.en)[m]} ${y}`;
  const out = [' '.repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title, days.join(' ')];
  const first = (new Date(y, m, 1).getDay() - (monFirst ? 1 : 0) + 7) % 7, n = new Date(y, m + 1, 0).getDate();
  let row = Array(first).fill('  ');
  for (let d = 1; d <= n; d++) {
    const cell = String(d).padStart(2);
    row.push(today && today.getFullYear() === y && today.getMonth() === m && today.getDate() === d ? `\x1b[7m${cell}\x1b[0m` : cell);
    if (row.length === 7) { out.push(row.join(' ')); row = []; }
  }
  if (row.length) out.push(row.join(' '));
  return out;
}
const vis = s => s.replace(/\x1b\[[0-9;]*m/g, '').length;

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'ysm', long: { year: 'y', monday: 'm', sunday: 's' } });
    const lang = getLang(), now = new Date();
    const monFirst = o.m ? true : o.s ? false : lang === 'cs';
    let y = now.getFullYear(), mo = now.getMonth(), whole = !!o.y;
    const num = (s, what) => { if (!/^\d+$/.test(s)) throw new CmdError(`illegal ${what} value: use 1-${what === 'month' ? 12 : 9999}`); return +s; };
    const monthArg = s => {
      const i = [...NAMES.en, ...NAMES.cs].findIndex(x => s.length >= 3 && x.toLowerCase().startsWith(s.toLowerCase()));
      return i >= 0 ? i % 12 : num(s, 'month') - 1;
    };
    if (rest.length === 1) { y = num(rest[0], 'year'); whole = true; }
    else if (rest.length === 2) { mo = monthArg(rest[0]); y = num(rest[1], 'year'); }
    else if (rest.length > 2) throw new CmdError('too many arguments', 1, true);
    if (mo < 0 || mo > 11 || y < 1 || y > 9999) throw new CmdError('illegal date value', 1, true);
    const today = ctx.stdout.isTTY ? now : null;
    if (!whole) { await ctx.stdout.write(month(y, mo, monFirst, lang, today).join('\n') + '\n'); return 0; }
    const out = [' '.repeat(Math.floor((62 - String(y).length) / 2)) + y, ''];
    for (let r = 0; r < 4; r++) {
      const cols = [0, 1, 2].map(c => month(y, r * 3 + c, monFirst, lang, today));
      for (let i = 0; i < Math.max(...cols.map(c => c.length)); i++)
        out.push(cols.map(c => { const s = c[i] ?? ''; return s + ' '.repeat(20 - vis(s)); }).join('  ').trimEnd());
    }
    await ctx.stdout.write(out.join('\n') + '\n');
    return 0;
  },
};
