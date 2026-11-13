# BubOS – projekt, rozhodnutí, stav a plán

## Cíl
Mini operační systém v okně prohlížeče pro výuku OS na střední škole. Žáci nic neinstalují, jejich „počítač“ je u nich v prohlížeči
a mohou si ho exportovat/importovat do souboru. Server (PHP 8.5) jen doručí soubory.

## Rozhodnutí (z konzultace)
| Téma | Rozhodnutí |
|---|---|
| Technologie | Simulace v JS (varianta A), ne WASM Linux – kvůli velikosti a možnosti výukové vrstvy |
| Build | Žádný, ES moduly, bez závislostí |
| Terminál | Vlastní DOM (`<pre>` + `<input>`), nativní klávesnice na mobilech |
| OS | Nejdřív Linux; Windows (`cmd`/PowerShell) jako další profil v `js/os/windows/` |
| Styl | Volné pískoviště, příjemné prostředí; lekce/úkoly až později |
| Zařízení | PC, notebooky, mobily; obvykle online |
| Jazyk | Příkazy anglicky, nápověda a hlášení cs + en s přepínačem |
| Věrnost | Výuková, ne přesná shoda s bashem |
| Vývoj | Společně uživatel + Claude; jednoduché a modulární |

## Stav (MVP hotové)
Funguje a je otestováno (10 Node testů + ruční ověření v prohlížeči): terminál (Tab, historie, Ctrl zkratky, lišta kláves pro dotyk),
shell (roury, přesměrování, globbing, proměnné, `$()`, aliasy, `!!`, `&`, skripty, `.bashrc`), VFS s právy, uživatelé (`su`, `sudo`,
`useradd`, `passwd`), ~60 příkazů, `man`/`--help` cs+en, `nano`, `less`, autosave do IndexedDB, Export/Import JSON, přepínač jazyka a vzhledu.

Neověřeno: Export/Import souboru, skutečný mobil, Ctrl+C při běžícím příkazu v prohlížeči.
Známé drobnosti: `chmod.js` obsahuje zbytečný řádek s `noWho` (no-op); `head.js` má kostrbatou logiku koncového `\n`;
hard linky (`ln` bez `-s`) nejsou podporované záměrně (export JSON by sdílení uzlů nezachoval).

## Plán / nápady (priorita přibližně shora dolů)
1. **Druhá iterace příkazů:** `sed`, `awk`-lite, `xargs`, `printf`, `tail -f`, `stat`, `du`/`df`, `diff`, `cal`, `which`-úpravy, `groupadd`/`usermod`/`userdel`,
   `chgrp`, `umask`, `read`, `Ctrl+R` (hledání v historii), `vi`.
2. **Skriptování:** `if/for/while/case`, funkce, `$((…))`, `$@`/`$#`, `read`, `exit` kódy – rozšířit `parse.js` o víceřádkové konstrukty.
3. **Procesy a služby:** `jobs/fg/bg`, `top`, falešný `systemctl`, `cron`, `/proc` dynamicky.
4. **Síť a více strojů:** `ping`, `ip a`, `ssh` mezi virtuálními stroji, `curl` na falešné servery.
5. **Výuková vrstva:** lekce/mise jako JSON balíčky s automatickou kontrolou stavu FS, nápovědy, `explain` příkaz, tlačítko snapshot/obnovit,
   odevzdání jako exportovaný soubor (případně bezstavový PHP ověřovač).
6. **Windows profil:** `cmd`/PowerShell dialekt, `C:\` cesty, vlastní `profile.js`.
7. **Provoz:** PWA/offline, volitelný jednosouborový build, kontrola souběhu více záložek, export s gzip.

## Jak pokračovat na jiném stroji
1. Zkopírovat celou složku `bubos` (nebo `git init` + repozitář; `.gitignore` zatím není – přidat `node_modules/` pro jistotu).
2. Potřeba jen Node ≥ 18 (testy) a libovolný statický server (`python -m http.server 8080` / `php -S localhost:8080`).
3. `npm test` musí projít; pak otevřít http://localhost:8080.
4. Claude si načte `CLAUDE.md` (kontext), v případě potřeby `docs/ARCHITEKTURA.md`. Nic dalšího není potřeba – žádná externí stavová data.
5. Data žáků/učitele jsou v IndexedDB prohlížeče daného stroje; na jiný stroj je přenese Export → Import.
