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
  process.js    ProcTable (simulované PID, AbortController)
  shell/        parse.js (lex+parse → AST), expand.js (~ $ $() split glob), complete.js (Tab), shell.js (Shell třída)
```

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

## Formát exportu
```json
{ "format": 1, "app": "bubos", "os": "linux", "savedAt": "…", "settings": {"lang":"cs","theme":"dark"}, "fs": { "type":"dir", … } }
```
Při změně formátu zvýšit `format` a přidat migraci v `Machine.fromState`.
