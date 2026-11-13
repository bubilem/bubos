// Profil operačního systému "Linux": seznam příkazů, PATH, prompt, výchozí souborový systém.
// Další OS (např. Windows) = další profil se stejným rozhraním.
import { buildFs } from './skeleton.js';

// Všechny příkazy (každý = soubor v commands/). Nový příkaz: přidat soubor + název sem + stránku do man/*.txt
export const COMMANDS = [
  'ls', 'cat', 'touch', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln', 'head', 'tail', 'wc', 'sort', 'uniq', 'tee',
  'tree', 'find', 'chmod', 'chown', 'grep', 'cut', 'tr', 'echo', 'pwd', 'cd', 'export', 'unset', 'alias',
  'unalias', 'exit', 'logout', 'history', 'source', '.', 'type', 'which', 'clear', 'help', 'man', 'less',
  'nano', 'env', 'printenv', 'true', 'false', 'test', '[', 'sleep', 'date', 'uname', 'hostname', 'whoami',
  'id', 'groups', 'su', 'sudo', 'useradd', 'passwd', 'ps', 'kill', 'yes', 'seq', 'basename', 'dirname', 'lang',
];
// Příkazy, které běží přímo v shellu (nemají soubor v /usr/bin)
const SHELL_ONLY = ['cd', 'export', 'unset', 'alias', 'unalias', 'exit', 'logout', 'history', 'source', '.', 'type', 'help'];
// Jméno příkazu → soubor modulu (pokud se liší)
const FILE = { '.': 'source', '[': 'test', logout: 'exit' };

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

export default {
  id: 'linux',
  path: '/usr/local/bin:/usr/bin:/bin',
  commands: COMMANDS,
  shellOnly: SHELL_ONLY,
  builtins: [...SHELL_ONLY, 'echo', 'pwd', 'test', '[', 'true', 'false', 'kill'],
  // jak doplňovat argumenty (Tab): cmd | dir | path | user | alias | varname | none
  completions: { cd: 'dir', rmdir: 'dir', man: 'cmd', help: 'cmd', which: 'cmd', type: 'cmd', su: 'user', passwd: 'user',
    unalias: 'alias', unset: 'varname', export: 'varname', useradd: 'none', lang: 'none', history: 'none' },
  buildFs,

  boot(m) {
    m.procs.system([
      [1, 'root', '/sbin/init', 0], [2, 'root', '[kthreadd]', 0], [412, 'root', '/usr/sbin/cron -f'],
      [533, 'root', '/usr/sbin/sshd -D'], [601, 'root', '/lib/systemd/systemd-journald'], [702, 'root', '/usr/sbin/rsyslogd -n'],
    ]);
  },

  prompt(sh) {
    const u = sh.user;
    let cwd = sh.cwd;
    if (cwd === u.home) cwd = '~';
    else if (u.home !== '/' && cwd.startsWith(u.home + '/')) cwd = '~' + cwd.slice(u.home.length);
    return `\x1b[1;32m${u.name}@${sh.m.hostname}\x1b[0m:\x1b[1;34m${cwd}\x1b[0m${u.uid === 0 ? '#' : '$'} `;
  },

  loadCommand(name) {
    if (!COMMANDS.includes(name)) return Promise.reject(new Error('unknown command'));
    return import(`./commands/${FILE[name] ?? name}.js`);
  },

  // Stránky manuálu v daném jazyce (chybějící se doplní z angličtiny)
  async loadMan(lang) {
    const en = await fetchMan('en');
    return lang === 'en' ? en : { ...en, ...(await fetchMan(lang)) };
  },
};
