// Spuštění aplikace: načtení stavu, přihlášení, smyčka příkazového řádku, tlačítka v záhlaví.
// Dva režimy: pískoviště (výchozí) a úkol z kampaně (index.html?mission=<id>) – úkol běží ve vlastním stroji.
import { Terminal } from './ui/terminal.js';
import { MissionPanel } from './ui/missionpanel.js';
import { Machine } from './core/machine.js';
import { Shell } from './core/shell/shell.js';
import { checkPassword, findUser, sessionUser } from './core/users.js';
import { loadDict, setLang, t, getLang } from './core/i18n.js';
import { Interrupt, Logout, Restart } from './core/util.js';
import { MissionRun, applySetup, startDir, recordResult, pick } from './core/mission.js';
import * as storage from './core/storage.js';
import linux from './os/linux/profile.js';

const $ = s => document.querySelector(s);
const term = new Terminal($('#term'));
const missionId = new URLSearchParams(location.search).get('mission');
const mkey = 'mission:' + missionId;

let machine = null, shell = null, restartWith = null, autoLogin = true, mdef = null, panel = null, cap = '';

// --- uložení ---
let saveTimer = 0;
const flush = () => {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!machine) return Promise.resolve();
  return missionId ? storage.save({ ...machine.snapshot(), mission: machine.mission?.toState() }, mkey) : storage.save(machine.snapshot());
};
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

// --- nastavení (jazyk, vzhled) ---
function applySettings() {
  const { lang, theme } = machine.settings;
  setLang(lang);
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = theme;
  const title = mdef ? pick(mdef.title, lang) : '';
  document.title = mdef ? t('ui.title.mission', { title }) : t('ui.title.sandbox');
  $('#mode-badge').textContent = mdef ? t('ui.mode.mission', { title }) : t('ui.mode.sandbox');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  $('#btn-lang').textContent = lang === 'cs' ? 'CS' : 'EN';
  $('#btn-theme').textContent = theme === 'dark' ? '☾' : '☀';
  if (shell) shell.vars.LANG = lang === 'cs' ? 'cs_CZ.UTF-8' : 'en_US.UTF-8';
  panel?.render();
}
function attach(m) {
  machine = m;
  m.fs.onChange = scheduleSave;
  m.onSettings = () => {
    applySettings(); scheduleSave();
    if (missionId) storage.patchSettings({ lang: m.settings.lang, theme: m.settings.theme }); // jazyk a vzhled jsou společné s pískovištěm
  };
  if (m.mission) {
    m.mission.hooks = {
      changed: () => { panel.render(); scheduleSave(); },
      restart: restartMission,
      quit: quitMission,
    };
    panel.attach(m.mission);
  }
  applySettings();
}

// --- úkol z kampaně ---
async function buildMissionMachine(fresh = false) {
  const prefs = await storage.loadSettings();
  const settings = { ...(prefs.lang && { lang: prefs.lang }), ...(prefs.theme && { theme: prefs.theme }) };
  const saved = fresh ? null : await storage.load(mkey);
  if (saved?.mission?.rev === (mdef.rev ?? 1)) {
    try {
      const m = Machine.fromState(linux, { ...saved, settings: { ...saved.settings, ...settings } });
      m.mission = new MissionRun(mdef, saved.mission);
      return m;
    } catch (e) { console.warn('Rozpracovaný úkol nelze načíst, začínám znovu.', e); }
  }
  const m = Machine.fresh(linux, settings);
  applySetup(m, mdef.setup);
  m.mission = new MissionRun(mdef);
  return m;
}
async function restartMission() {
  await storage.wipe(mkey);
  restart(await buildMissionMachine(true));
}
async function quitMission() {
  await flush();
  location.href = 'campaign.html';
}
async function recordProgress(run) {
  run.recorded = run.stars;
  const p = await storage.loadProgress();
  if (recordResult(p, mdef.id, run.result())) await storage.saveProgress(p);
  scheduleSave();
}
// Po každém příkazu: zapíše řádek a výstup, přepočítá cíle
function afterLine(line) {
  const run = machine.mission;
  if (!run) return;
  run.observe(line, cap); cap = '';
  if (run.update(machine, shell.cwd)) recordProgress(run);
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
    const first = autoLogin;
    autoLogin = false;
    shell = new Shell(machine, sessionUser(machine.fs, name), { tty: term });
    term.onInterrupt = () => shell.interrupt();
    await shell.start();
    if (machine.mission) {
      if (first) {
        const d = startDir(mdef.setup);
        if (machine.fs.exists(d, null)) { shell.cwd = d; shell.vars.PWD = d; }
      }
      term.write(`\n\x1b[1m${pick(mdef.title, getLang())}\x1b[0m\n${t('mission.intro')}\n\n`);
      if (machine.mission.update(machine, shell.cwd)) recordProgress(machine.mission);
    } else {
      try { term.write('\n' + machine.fs.read('/etc/motd', null) + '\n'); } catch { /* bez motd */ }
    }
    try {
      for (;;) {
        if (restartWith) throw new Restart();
        let line;
        try {
          line = await term.readLine({ prompt: shell.prompt(), history: shell.history, complete: (l, c) => shell.complete(l, c) });
        } catch (e) { if (e instanceof Interrupt) continue; throw e; }
        if (line === null) { term.write('exit\n'); line = 'exit'; }
        cap = '';
        await shell.run(line);
        afterLine(line);
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
$('#btn-export').addEventListener('click', () => storage.exportAll(machine.snapshot()));
$('#btn-import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const st = await storage.readImportFile(f);
    if (!confirm(t('ui.import.confirm'))) return;
    await storage.mergeProgressFrom(st); // postup v kampani (je-li v souboru) se přidá k existujícímu
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
  if (missionId) {
    document.body.classList.add('mission-mode');
    panel = new MissionPanel($('#mission'), { onRestart: restartMission, onQuit: quitMission });
    try { mdef = await linux.loadMission(missionId); }
    catch { alert(t('panel.loadfail')); location.replace('campaign.html'); return; }
    // zachytává výstup příkazů (pro kontroly typu output)
    const write = term.write.bind(term);
    term.write = (s, k) => { cap += s; return write(s, k); };
    m = await buildMissionMachine();
  } else {
    const saved = await storage.load();
    if (saved) { try { m = Machine.fromState(linux, saved); } catch (e) { console.warn('Uložený stav nelze načíst, začínám znovu.', e); } }
  }
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
