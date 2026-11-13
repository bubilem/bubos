// Spuštění aplikace: načtení stavu, přihlášení, smyčka příkazového řádku, tlačítka v záhlaví.
import { Terminal } from './ui/terminal.js';
import { Machine } from './core/machine.js';
import { Shell } from './core/shell/shell.js';
import { checkPassword, findUser, sessionUser } from './core/users.js';
import { loadDict, setLang, t } from './core/i18n.js';
import { Interrupt, Logout, Restart } from './core/util.js';
import * as storage from './core/storage.js';
import linux from './os/linux/profile.js';

const $ = s => document.querySelector(s);
const term = new Terminal($('#term'));

let machine = null, shell = null, restartWith = null, autoLogin = true;

// --- uložení ---
let saveTimer = 0;
const flush = () => { clearTimeout(saveTimer); saveTimer = 0; if (machine) storage.save(machine.snapshot()); };
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

// --- nastavení (jazyk, vzhled) ---
function applySettings() {
  const { lang, theme } = machine.settings;
  setLang(lang);
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = theme;
  document.title = t('ui.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  $('#btn-lang').textContent = lang === 'cs' ? 'CS' : 'EN';
  $('#btn-theme').textContent = theme === 'dark' ? '☾' : '☀';
  if (shell) shell.vars.LANG = lang === 'cs' ? 'cs_CZ.UTF-8' : 'en_US.UTF-8';
}
function attach(m) {
  machine = m;
  m.fs.onChange = scheduleSave;
  m.onSettings = () => { applySettings(); scheduleSave(); };
  applySettings();
}

// --- relace ---
async function login() {
  for (;;) {
    term.write(`\n${t('login.hint')}\n`);
    let name, pw;
    try {
      name = await term.readLine({ prompt: `${machine.hostname} ${t('login.user')}` });
      if (name === null || !name.trim()) continue;
      name = name.trim();
      pw = await term.readLine({ prompt: t('login.password'), password: true });
    } catch (e) { if (e instanceof Interrupt) continue; throw e; }
    const u = findUser(machine.fs, name);
    if (u && !/nologin|false$/.test(u.shell) && checkPassword(machine.fs, name, pw ?? '')) return name;
    await new Promise(r => setTimeout(r, 700));
    term.write(t('login.incorrect') + '\n');
  }
}

async function sessionLoop() {
  for (;;) {
    const name = autoLogin && findUser(machine.fs, 'student') ? 'student' : await login();
    autoLogin = false;
    shell = new Shell(machine, sessionUser(machine.fs, name), { tty: term });
    term.onInterrupt = () => shell.interrupt();
    await shell.start();
    try { term.write('\n' + machine.fs.read('/etc/motd', null) + '\n'); } catch { /* bez motd */ }
    try {
      for (;;) {
        if (restartWith) throw new Restart();
        let line;
        try {
          line = await term.readLine({ prompt: shell.prompt(), history: shell.history, complete: (l, c) => shell.complete(l, c) });
        } catch (e) { if (e instanceof Interrupt) continue; throw e; }
        if (line === null) { term.write('exit\n'); line = 'exit'; }
        await shell.run(line);
        scheduleSave();
      }
    } catch (e) {
      shell.end();
      if (!(e instanceof Logout)) throw e;
    }
  }
}

function restart(m) {
  restartWith = m;
  term.cancelRead(new Restart());
  shell?.interrupt();
}

// --- tlačítka ---
$('#btn-export').addEventListener('click', () => storage.exportFile(machine.snapshot()));
$('#btn-import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const st = await storage.readImportFile(f);
    if (!confirm(t('ui.import.confirm'))) return;
    restart(Machine.fromState(linux, st));
  } catch (err) { alert(t('ui.import.bad', { msg: err.message })); }
});
$('#btn-reset').addEventListener('click', async () => {
  if (!confirm(t('ui.reset.confirm'))) return;
  await storage.wipe();
  restart(Machine.fresh(linux, { ...machine.settings }));
});
$('#btn-lang').addEventListener('click', () => machine.setSetting('lang', machine.settings.lang === 'cs' ? 'en' : 'cs'));
$('#btn-theme').addEventListener('click', () => machine.setSetting('theme', machine.settings.theme === 'dark' ? 'light' : 'dark'));

// --- start ---
async function main() {
  await Promise.all([loadDict('en'), loadDict('cs')]);
  let m = null;
  const saved = await storage.load();
  if (saved) { try { m = Machine.fromState(linux, saved); } catch (e) { console.warn('Uložený stav nelze načíst, začínám znovu.', e); } }
  attach(m ?? Machine.fresh(linux, { lang: 'cs' }));
  storage.requestPersist();
  for (;;) {
    try { await sessionLoop(); }
    catch (e) {
      if (!(e instanceof Restart)) throw e;
      shell = null;
      term.clear();
      attach(restartWith);
      restartWith = null;
      autoLogin = true;
      flush();
    }
  }
}
main();
window.bubos = { term, get machine() { return machine; }, get shell() { return shell; } };
