import { CmdError } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';
import { UNITS, unitName, findUnit, isEnabled, isActive, procOf, setEnabled, startUnit, stopUnit, logLine } from '../services.js';

const p2 = n => String(n).padStart(2, '0');
const stamp = ms => {
  const d = new Date(ms);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};
const ago = ms => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${s % 60}s ago`;
  return `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}min ago`;
};
const GREEN = '\x1b[1;32m●\x1b[0m', WHITE = '○';
const MANAGE = ['start', 'stop', 'restart', 'reload', 'try-restart', 'enable', 'disable'];

export default {
  async run(ctx) {
    const { m, user } = ctx;
    const flags = ctx.args.filter(a => a.startsWith('-'));
    const rest = ctx.args.filter(a => !a.startsWith('-'));
    const now = flags.includes('--now'), all = flags.includes('--all') || flags.includes('-a');
    const lang = getLang() === 'en' ? 'en' : 'cs';
    const desc = n => UNITS[n].desc[lang];
    const verb = rest[0] ?? 'list-units';
    const names = rest.slice(1);
    const w = s => ctx.stdout.write(s);
    const e = s => ctx.stderr.write(s);

    if (MANAGE.includes(verb) && user.uid !== 0) {
      const what = verb === 'enable' || verb === 'disable' ? `${verb} unit files` : `${verb} ${names.map(unitName).join(', ')}`;
      await e(`Failed to ${what}: Interactive authentication required.\n`);
      if (!/unit files/.test(what)) await e(`See system logs and 'systemctl status ${unitName(names[0] ?? '')}' for details.\n`);
      return 1;
    }

    switch (verb) {
      case 'list-units': {
        const rows = Object.keys(UNITS).filter(n => all || isActive(m, n));
        await w('  ' + 'UNIT'.padEnd(32) + 'LOAD   ACTIVE SUB     DESCRIPTION\n');
        for (const n of rows) {
          const a = isActive(m, n);
          await w(`${a ? '  ' : `${WHITE} `}${unitName(n).padEnd(32)}loaded ${(a ? 'active' : 'inactive').padEnd(7)}${(a ? 'running' : 'dead').padEnd(8)}${desc(n)}\n`);
        }
        await w(`\n${rows.length} loaded units listed.${all ? '' : ' Pass --all to see loaded but inactive units, too.'}\n`);
        return 0;
      }
      case 'list-unit-files': {
        await w('UNIT FILE'.padEnd(34) + 'STATE     PRESET\n');
        for (const n of Object.keys(UNITS)) await w(`${unitName(n).padEnd(34)}${(isEnabled(m, n) ? 'enabled' : 'disabled').padEnd(10)}enabled\n`);
        await w(`\n${Object.keys(UNITS).length} unit files listed.\n`);
        return 0;
      }
      case 'daemon-reload': return 0;
      case 'is-active': case 'is-enabled': case 'status': break;
      default:
        if (!MANAGE.includes(verb)) throw new CmdError(`Unknown command verb '${verb}'.`, 1);
    }
    if (!names.length) {
      if (verb === 'status') { await w(`${GREEN} ${m.hostname}\n    State: running\n`); return 0; }
      throw new CmdError('Too few arguments.', 1);
    }

    let st = 0;
    const bump = c => { st = Math.max(st, c); };
    for (const raw of names) {
      const n = findUnit(raw), full = unitName(raw);
      if (!n) {
        if (verb === 'status') { await e(`Unit ${full} could not be found.\n`); bump(4); }
        else if (verb === 'is-active') { await w('inactive\n'); bump(3); }
        else if (verb === 'is-enabled') { await e(`Failed to get unit file state for ${full}: No such file or directory\n`); bump(1); }
        else if (verb === 'enable' || verb === 'disable') { await e(`Failed to ${verb} unit: Unit file ${full} does not exist.\n`); bump(1); }
        else { await e(`Failed to ${verb} ${full}: Unit ${full} not found.\n`); bump(5); }
        continue;
      }
      const unit = unitName(n);
      switch (verb) {
        case 'is-active': { const a = isActive(m, n); await w(a ? 'active\n' : 'inactive\n'); if (!a) bump(3); break; }
        case 'is-enabled': { const en = isEnabled(m, n); await w(en ? 'enabled\n' : 'disabled\n'); if (!en) bump(1); break; }
        case 'status': {
          const p = procOf(m, n), en = isEnabled(m, n) ? 'enabled' : 'disabled';
          await w(`${p ? GREEN : WHITE} ${unit} - ${desc(n)}\n`);
          await w(`     Loaded: loaded (/lib/systemd/system/${unit}; ${en}; preset: enabled)\n`);
          if (p) {
            await w(`     Active: \x1b[1;32mactive (running)\x1b[0m since ${stamp(p.start)}; ${ago(p.start)}\n`);
            await w(`   Main PID: ${p.pid} (${UNITS[n].comm})\n      Tasks: 1 (limit: 2275)\n     Memory: ${(1 + (p.pid % 9) / 2).toFixed(1)}M\n`);
            await w(`     CGroup: /system.slice/${unit}\n             └─${p.pid} ${p.cmd}\n`);
          } else { await w('     Active: inactive (dead)\n'); bump(3); }
          break;
        }
        case 'start': startUnit(m, n); logLine(m, `Started ${unit} - ${UNITS[n].desc.en}.`); break;
        case 'stop': if (stopUnit(m, n)) logLine(m, `Stopped ${unit} - ${UNITS[n].desc.en}.`); break;
        case 'restart': stopUnit(m, n); startUnit(m, n); logLine(m, `Restarted ${unit} - ${UNITS[n].desc.en}.`); break;
        case 'reload':
          if (!isActive(m, n)) { await e(`Failed to reload ${unit}: Unit ${unit} is not active.\n`); bump(1); }
          else logLine(m, `Reloaded ${unit} - ${UNITS[n].desc.en}.`);
          break;
        case 'try-restart': if (isActive(m, n)) { stopUnit(m, n); startUnit(m, n); } break;
        case 'enable':
          setEnabled(m, n, true);
          await e(`Created symlink /etc/systemd/system/multi-user.target.wants/${unit} → /lib/systemd/system/${unit}.\n`);
          if (now) startUnit(m, n);
          break;
        case 'disable':
          setEnabled(m, n, false);
          await e(`Removed "/etc/systemd/system/multi-user.target.wants/${unit}".\n`);
          if (now) stopUnit(m, n);
          break;
        default: break;
      }
    }
    return st;
  },
};
