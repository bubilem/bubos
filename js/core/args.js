// Jednoduchý parser voleb příkazů (GNU styl: -abc, -n 5, -n5, --long, --long=hodnota, --)
import { CmdError } from './util.js';

// spec: { bool: 'alR', val: 'nc', long: { all: 'a', lines: 'n' }, numeric: true, stop: true }
//  bool    – jednopísmenné přepínače bez hodnoty
//  val     – jednopísmenné přepínače s hodnotou
//  long    – mapování dlouhých voleb na klíč v o
//  numeric – povolí -5 (uloží do o.num)
//  stop    – po prvním operandu už nehledá volby (sudo, find…)
export function parseArgs(args, spec = {}) {
  const o = {}, rest = [];
  const bool = spec.bool || '', val = spec.val || '', long = spec.long || {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const v = eq < 0 ? undefined : a.slice(eq + 1);
      const key = long[k];
      if (!key) throw new CmdError(`unrecognized option '--${k}'`, 2, true);
      if (val.includes(key)) {
        const x = v ?? args[++i];
        if (x === undefined) throw new CmdError(`option '--${k}' requires an argument`, 2, true);
        o[key] = x;
      } else o[key] = true;
    } else if (spec.numeric && /^-\d+$/.test(a)) {
      o.num = +a.slice(1);
    } else if (a[0] === '-' && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (val.includes(c)) {
          const x = a.slice(j + 1) || args[++i];
          if (x === undefined) throw new CmdError(`option requires an argument -- '${c}'`, 2, true);
          o[c] = x;
          break;
        }
        if (!bool.includes(c)) throw new CmdError(`invalid option -- '${c}'`, 2, true);
        o[c] = true;
      }
    } else {
      rest.push(a);
      if (spec.stop) { rest.push(...args.slice(i + 1)); break; }
    }
  }
  return { o, rest };
}
