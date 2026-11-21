# BubOS – architektura a konvence

## Vrstvy (závislosti jdou jen shora dolů)
```
index.html + css/bubos.css
js/main.js                 start, přihlášení, hlavní smyčka, tlačítka (jediné místo, kde se potkává UI a jádro)
js/ui/                     terminal.js (readLine, Tab, historie), pager.js, editor.js, ansi.js (SGR → DOM)
js/os/<os>/                profile.js (COMMANDS, PATH, prompt, loadCommand, loadMan), skeleton.js (výchozí FS), lib.js, commands/*.js
js/core/                   BEZ DOM, testovatelné v Node
  vfs.js        uzly {type,mode,uid,gid,mtime,data|children|target}, práva, symlinky, sticky; cesty absolutní a normalizované (resolvePath)
  users.js      /etc/passwd|group|shadow, hash (symbolický), addUser, sessionUser
  streams.js    Pipe (backpressure), Stdin, StringWriter, FileWriter
  util.js       CmdError, Interrupt, BrokenPipe, Logout, ScriptExit, Restart, sleep, tick, columns
  args.js       parseArgs(args, {bool,val,long,numeric,stop})
  regex.js      posixToJs(BRE/ERE → RegExp)
  i18n.js       t(klíč, {proměnné}); fallback en → klíč
  storage.js    IndexedDB + export/import + validateState
  machine.js    Machine = {os, fs, procs, settings}; snapshot() je formát exportu {format:1,app,os,savedAt,settings,fs}
  process.js    ProcTable + Proc (simulované PID, signály TERM/KILL/STOP/CONT, pozastavení, onChange pro /proc)
  shell/        parse.js (lex+parse → AST), expand.js (~ $ $() split glob), complete.js (Tab), shell.js (Shell třída)
```

## Procesy, úlohy a služby (blok C)
- `Proc.deliver(sig)`: TERM/INT/HUP/KILL abortují `ac` (příkazy končí `Interrupt`), STOP/TSTP nastaví `stopped`, CONT ho zruší. Pozastavit jde jen kód, který
  čeká přes `await proc.pause()` / `sleep(ms, signal, proc)` (sleep, yes, smyčky v `_execCompound`); nový dlouhý příkaz musí volat `ctx.proc.pause()`. Interaktivní `-bash` je `immune` (ignoruje TERM).
- Úlohy: `Shell.jobs` (`_addJob`, `findJob`, `jobLine`). `cmd &` → `_background`; Ctrl+Z → `terminal.onStop` → `shell.suspend()` pozastaví `fg` a vrátí `_waitFg` (stav 148, z roury je úloha).
  `fg` jen volá `sh.adopt(job)` a skutečné čekání dělá `_waitFg`; `bg` → `resumeBg`. Čekání na nejvyšší úrovni je jedno (`_top`), vnořené (smyčky, funkce) jen čekají.
- Služby: `os/linux/services.js` (`UNITS`, start/stop/enabled). Běžící služba = systémový proces s polem `unit`; „zapnuto při startu“ je v `m.settings.units`
  (exportuje se), `profile.boot` spouští zapnuté služby. `systemctl` a `service` jen volají tyto funkce a zapisují do `/var/log/syslog`.
- Cron: `os/linux/cron.js` – `parseCrontab`, `matches`, `cronTick(m, date)` (testovatelné bez času) a `startCron` (interval 5 s, `unref`, zastaví ho `Machine.close()`).
  Crontaby jsou v `/var/spool/cron/crontabs/<uživatel>`. Úloha běží přes `Shell.runLine` pod daným uživatelem, výstup se zahodí.
- `/proc`: `os/linux/procfs.js` `mountProc` – adresáře `/proc/<pid>` se při změně tabulky procesů přepisují přímo ve stromu (bez `onChange`, aby se neukládalo) a soubory
  mají uzel `{gen:'status:412'}`, jehož obsah doplní `VFS.read` přes `fs.gen`. Snapshot ho ukládá, ale `boot` ho vždy přepíše.
- Kampaň: kontroly `procRunning`, `procStopped`, `serviceActive`, `serviceEnabled`; `setup.procs` (`applyProcs`) vyrobí proces, který `kill` odstraní z tabulky (`daemon`).

## Tok příkazu
`main.js` → `shell.run(line)` → `parse` (aliasy se rozvinou už v parseru) → `runAst` (`; && || &`) → `_startPipeline`
(všechny stupně roury běží souběžně přes `Pipe`) → `_runCommand` (expanze, přesměrování) → `_invoke` (`lookup`: vestavěný / soubor v PATH
→ stub `#!bubos:<jméno>` nebo skript) → `commands/<jméno>.js` `run(ctx)`.

Příkaz = `export default { async run(ctx) { … return kód; } }`. Užitečné v `ctx`: `args`, `stdin/stdout/stderr`, `fs`, `user`, `env`, `sh`, `m`,
`tty` (write, ask, pager, edit, clear, cols), `path(p)`, `fsMsg(e)`, `check()` (Ctrl+C), `each(operandy, fn, sloveso)` (chyby po operandech),
`exec(argv,{user,env})`. Chyby: `throw new CmdError(text, kód, hint)` nebo nechat probublat `FsError`. Dlouhé smyčky volají `ctx.check()`.

## Důležité konvence
- Nový příkaz: soubor v `commands/`, název do `COMMANDS` (a do `SHELL_ONLY` v `profile.js` **i** `skeleton.js`, pokud nemá být soubor v `/usr/bin`),
  výjimky názvů → mapa `FILE` v `profile.js`, vestavěné běžící v shellu → `builtins`. Doplňování argumentů → `completions` v profilu.
- Manuál: `man/cs.txt` a `man/en.txt`, stránka začíná `#### jméno [další jména]`, první řádek pod JMÉNO/NAME je `jméno - popis`
  (z něj bere `help` popis). Nadpisy sekcí VELKÝMI písmeny se v `man` zvýrazní.
- Hlášení: klíče v `i18n/cs.json` i `en.json` (ploché, tečková notace). Chyby FS: `err.<KÓD>`.
- Výstup barevně přes ANSI SGR, jen když `ctx.stdout.isTTY`. Texty chyb: `prog: operand: zpráva` jako v GNU.
- Soubor z importu je jen data: validace `validateState`, nikdy `innerHTML` s obsahem uživatele.
- Cyklické závislosti nepřidávat (existující `profile.js` ↔ `skeleton.js` je tolerovaná).
- Testy: `tests/helpers.js` (`boot()` vrací `{run, sh, m, tty}`; `run(řádek)` → `{out, st}`), scénáře v `tests/shell.test.js`.
  K nové funkci přidat test; man/i18n pokrytí kontrolovat (každý příkaz má stránku v obou jazycích, klíče `t('…')` existují v obou JSON).

## Barvy a režimy (UX)
- Barvy terminálu (`--c30…--c97` v `css/bubos.css`) mají **standardní významy**: zelená = uživatel@počítač a spustitelné soubory, modrá = složky a cesta,
  azurová = odkazy, červená = chyby (a prompt roota), žlutá = varování. Nepřemapovávat (dříve byla „zelená“ modrá a slévala se se složkami).
- Barva stránky (`--accent`) je oddělená od barev terminálu: modrá = pískoviště a dokumentace, **fialová = úkol a kampaň** (`body.mission-mode`, `body.camp`).
  Jantarová (`--flame`) jen pro hvězdy, zelená (`--ok`) pro splněno. Režim je navíc vidět ze štítku v liště (`#mode-badge`) a z titulku záložky – barva nikdy nenese význam sama.
- Kontrast textu proti pozadí v obou tématech je ≥ 4,5 : 1 (ověřeno výpočtem při změně palety).

## Kampaň (výuková vrstva)
- `core/mission.js` (bez DOM): `evalCheck` (kontroly stavu FS a historie), `MissionRun` (cíle, bonus, nápovědy, hvězdy, `toState`), `applySetup`, postup
  (`sanitizeProgress`, `mergeProgress`, `recordResult`). Úkoly = JSON v `js/os/linux/missions/` (`index.json` + `<id>.json`), načítá `profile.loadMission`.
- `main.js` v režimu `?mission=<id>` staví vlastní `Machine` (nikdy nesahá na klíč `main` v IndexedDB), po každém řádku volá `run.observe` + `run.update`
  a při zisku hvězd zapíše postup (`storage.saveProgress`). Klíče úložiště: `main`, `progress`, `mission:<id>`.
- `campaign.js` je samostatná stránka; jazyk a vzhled sdílí s pískovištěm přes `storage.patchSettings`.
- Vzorová řešení: `os/linux/solutions.js` z `solution`/`best` každého úkolu vygeneruje `/root/.reseni/<id>.sh` (+ README.txt). Zapisuje je `withSolutions` v `main.js`
  jednou na stroj v pískovišti (příznak `settings.solutions`; ručně smazaná se nevracejí). Skrytá složka v domově roota → najde je `sudo ls -a /root`; nejsou zamčená před zvědavostí, jen neleží na očích.
- Nový úkol = JSON + řádek v `index.json`; `npm test` přehraje `solution` i `best` každého úkolu.

## Formát exportu
```json
{ "format": 1, "app": "bubos", "os": "linux", "savedAt": "…", "settings": {"lang":"cs","theme":"dark"}, "fs": { "type":"dir", … } }
```
Volitelně i `"progress": {…}` (postup v kampani; při importu se sloučí s existujícím). Při změně formátu zvýšit `format` a přidat migraci v `Machine.fromState`.
