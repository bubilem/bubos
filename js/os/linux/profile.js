// Profil operačního systému "Linux": seznam příkazů, PATH, prompt, výchozí souborový systém.
// Další OS (např. Windows) = další profil se stejným rozhraním.
import { buildFs } from './skeleton.js';
import { bootUnits, isActive, isEnabled } from './services.js';
import { startCron } from './cron.js';
import { mountProc } from './procfs.js';

// Všechny příkazy (každý = soubor v commands/). Nový příkaz: přidat soubor + název sem + stránku do man/*.txt
export const COMMANDS = [
  'ls', 'cat', 'touch', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln', 'head', 'tail', 'wc', 'sort', 'uniq', 'tee',
  'tree', 'find', 'chmod', 'chown', 'grep', 'cut', 'tr', 'echo', 'pwd', 'cd', 'export', 'unset', 'alias',
  'unalias', 'exit', 'logout', 'history', 'source', '.', 'type', 'which', 'clear', 'help', 'man', 'less',
  'nano', 'env', 'printenv', 'true', 'false', 'test', '[', 'sleep', 'date', 'uname', 'hostname', 'whoami',
  'id', 'groups', 'su', 'sudo', 'useradd', 'passwd', 'ps', 'kill', 'yes', 'seq', 'basename', 'dirname', 'lang', 'mission',
  'stat', 'du', 'df', 'diff', 'cal', 'printf', 'xargs', 'sed', 'awk', 'chgrp', 'umask', 'groupadd', 'groupdel', 'usermod', 'userdel', 'read',
  'break', 'continue', 'return', 'shift', 'local', ':', 'let', '[[',
  'cowsay', 'fortune', 'sl', 'factor',
  'jobs', 'fg', 'bg', 'wait', 'top', 'systemctl', 'service', 'crontab', 'pgrep', 'pkill', 'killall',
];
// Příkazy, které běží přímo v shellu (nemají soubor v /usr/bin)
const SHELL_ONLY = ['cd', 'export', 'unset', 'alias', 'unalias', 'exit', 'logout', 'history', 'source', '.', 'type', 'help', 'umask', 'read', 'break', 'continue', 'return', 'shift', 'local', ':', 'let', '[[', 'jobs', 'fg', 'bg', 'wait'];
// Příkazy přidané po prvním vydání (starší uložené stroje pro ně nemají stub v /usr/bin)
const ADDED_LATER = ['stat', 'du', 'df', 'diff', 'cal', 'printf', 'xargs', 'sed', 'awk', 'chgrp', 'groupadd', 'groupdel', 'usermod', 'userdel', 'cowsay', 'fortune', 'sl', 'factor', 'jobs', 'fg', 'bg', 'wait', 'top', 'systemctl', 'service', 'crontab', 'pgrep', 'pkill', 'killall'];
// Jméno příkazu → soubor modulu (pokud se liší)
const FILE = { '.': 'source', '[': 'test', '[[': 'test', ':': 'colon', logout: 'exit', pkill: 'pgrep', killall: 'pgrep' };

export const manSource = { fn: null }; // pro testy v Node
const manCache = {};

async function fetchMan(lang) {
  if (manCache[lang]) return manCache[lang];
  let text = '';
  try {
    text = manSource.fn ? await manSource.fn(lang) : await (await fetch(new URL(`../../../man/${lang}.txt`, import.meta.url))).text();
  } catch { /* chybí soubor */ }
  const pages = {};
  const parts = text.split(/^#### (.+)$/m);
  for (let i = 1; i < parts.length; i += 2)
    for (const nm of parts[i].trim().split(/\s+/)) pages[nm] = parts[i + 1].replace(/^\n+|\s+$/g, '');
  return (manCache[lang] = pages);
}

// Úkoly kampaně (js/os/linux/missions/): index.json + <id>.json
export const missionSource = { fn: null }; // pro testy v Node
const ID = /^[a-z0-9-]{1,64}$/;
async function fetchMission(file) {
  if (missionSource.fn) return missionSource.fn(file);
  const r = await fetch(new URL(`./missions/${file}`, import.meta.url));
  if (!r.ok) throw new Error('mission not found');
  return r.json();
}

export default {
  id: 'linux',
  path: '/usr/local/bin:/usr/bin:/bin',
  commands: COMMANDS,
  shellOnly: SHELL_ONLY,
  // mission je vestavěný, aby fungoval i v dříve uloženém systému (bez souboru v /usr/bin)
  builtins: [...SHELL_ONLY, 'echo', 'pwd', 'test', '[', 'true', 'false', 'kill', 'mission'],
  // jak doplňovat argumenty (Tab): cmd | dir | path | user | alias | varname | none
  completions: { cd: 'dir', rmdir: 'dir', man: 'cmd', help: 'cmd', which: 'cmd', type: 'cmd', su: 'user', passwd: 'user',
    unalias: 'alias', unset: 'varname', export: 'varname', useradd: 'none', lang: 'none', history: 'none', mission: 'none',
    usermod: 'user', userdel: 'user', jobs: 'none', fg: 'none', bg: 'none', wait: 'none', top: 'none', groupadd: 'none', groupdel: 'none', read: 'varname', cal: 'none', df: 'none', umask: 'none' },
  buildFs,
  services: { active: isActive, enabled: isEnabled },
  // Hlášky za "command not found" pro známé příkazy, které v simulátoru nejsou
  hints: {
    vim: { cs: 'Tip: zkus nano. A nezačínej svatou válku s Emacsem.', en: "Tip: try nano. And don't start a holy war with Emacs." },
    vi: { cs: 'Tip: zkus nano. (Z vi se dá vystoupit, ale to je jiný příběh.)', en: 'Tip: try nano. (You can exit vi, but that is another story.)' },
    emacs: { cs: 'Tip: Emacs tu není, ale je tu nano. Vim ani nezmiňujeme.', en: "Tip: there's no Emacs here, but there is nano. We won't mention Vim." },
    please: { cs: 'Slušnost oceňujeme. Zkus sudo.', en: 'Politeness is appreciated. Try sudo.' },
    make: { cs: 'Tady žádný make není. (Sendvič ale zkus přes sudo.)', en: 'There is no make here. (But try a sandwich with sudo.)' },
    42: { cs: 'To je odpověď. Otázku hledej jinde.', en: 'That is the answer. Look elsewhere for the question.' },
  },

  boot(m) {
    // Uložené stroje ze starší verze: doplní stuby nově přidaných příkazů (jednou; ručně smazané se nevracejí)
    const known = new Set(m.settings.stubs ?? COMMANDS.filter(c => !ADDED_LATER.includes(c)));
    for (const c of COMMANDS) {
      if (known.has(c) || SHELL_ONLY.includes(c)) continue;
      try { m.fs.stat('/usr/bin/' + c); } catch { m.fs.put('/usr/bin/' + c, `#!bubos:${c}\n`, { mode: 0o755 }); }
    }
    m.settings.stubs = [...COMMANDS];
    mountProc(m); // /proc podle tabulky procesů
    m.procs.system([[1, 'root', '/sbin/init', 0], [2, 'root', '[kthreadd]', 0]]);
    bootUnits(m); // služby zapnuté při startu (cron, ssh, …)
    startCron(m);
  },

  prompt(sh) {
    const u = sh.user;
    let cwd = sh.cwd;
    if (cwd === u.home) cwd = '~';
    else if (u.home !== '/' && cwd.startsWith(u.home + '/')) cwd = '~' + cwd.slice(u.home.length);
    // root má celý prompt červený (varování, že pracuje správce)
    return `\x1b[1;${u.uid === 0 ? 31 : 32}m${u.name}@${sh.m.hostname}\x1b[0m:\x1b[1;34m${cwd}\x1b[0m${u.uid === 0 ? '#' : '$'} `;
  },

  loadCommand(name) {
    if (!COMMANDS.includes(name)) return Promise.reject(new Error('unknown command'));
    return import(`./commands/${FILE[name] ?? name}.js`);
  },

  loadMissionIndex: () => fetchMission('index.json'),
  loadMission: id => (ID.test(id) ? fetchMission(id + '.json') : Promise.reject(new Error('bad mission id'))),

  // Stránky manuálu v daném jazyce (chybějící se doplní z angličtiny)
  async loadMan(lang) {
    const en = await fetchMan('en');
    return lang === 'en' ? en : { ...en, ...(await fetchMan(lang)) };
  },
};
