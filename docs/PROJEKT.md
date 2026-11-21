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
1. **Druhá iterace příkazů – blok A HOTOVÝ:** `sed`, `awk`-lite, `xargs`, `printf`, `stat`, `du`/`df`, `diff`, `cal`, `groupadd`/`groupdel`/`usermod`/`userdel`,
   `chgrp`, `umask`, `read`, `Ctrl+R`. Zbývá: `tail -f`, `vi` (blok E). Starší uložené stroje dostanou stuby nových příkazů při startu (`boot` v `profile.js`).
2. **Skriptování – blok B HOTOVÝ:** `if/elif/else`, `for` (i `for ((…))`), `while`, `until`, `case`, funkce (`local`, `return`), `{ }`, `( )`, `$((…))`, `((…))`, `let`, `[[ ]]`, `$@ $# shift`, úpravy `${x%…}`, víceřádkový vstup s výzvou `>`. Parser: `core/shell/parse.js`, aritmetika `core/shell/arith.js`. Chybí: here-dokumenty, pole, `trap`.
3. **Procesy a služby – blok C HOTOVÝ:** `&`/`jobs`/`fg`/`bg`/`wait`/Ctrl+Z, signály v `kill` (+ `pkill`, `pgrep`, `killall`), `top`, `systemctl` a `service`
   (cron, ssh, rsyslog, apache2…), `crontab` se skutečně spouštěným cronem, dynamický `/proc`; kapitola kampaně „Procesy a služby“ (6 úkolů). Chybí: `nohup`, `disown`, `trap`, `at`.
4. **Síť a více strojů:** `ping`, `ip a`, `ssh` mezi virtuálními stroji, `curl` na falešné servery.
5. **Výuková vrstva = Kampaň** – rozhodnutá, viz sekce „Kampaň“ níže (děláme ji jako první). Zbytek nápadů: příkaz `explain`,
   bezstavový PHP ověřovač odevzdání.
6. **Windows profil:** `cmd`/PowerShell dialekt, `C:\` cesty, vlastní `profile.js`.
7. **Provoz:** PWA/offline, volitelný jednosouborový build, kontrola souběhu více záložek, export s gzip.

## Kampaň (výuková vrstva) – rozhodnutí a návrh
Rozhodnutí uživatele: samostatná stránka `campaign.html`; v datech žáka žádná jména; **žádné zamykání ani lineární pořadí** – žák si úkol
sám vybere a systém mu hlásí postup jen u něj; ztráta zálohy nesmí žáka zablokovat; kampaň se dělá před druhou iterací příkazů.

**Zásady**
- Úkol = jeden JSON soubor v `js/os/linux/missions/` (nový úkol = jeden soubor, jako příkaz). Rejstřík `index.json` s kapitolami.
- Dlaždice: název, kapitola, obtížnost 1–3, hvězdy 0–3, stav (nezačato / rozpracováno / splněno). Filtr podle kapitoly, obtížnosti, stavu.
  Prerekvizity jsou jen štítek „doporučeno nejdřív“, nikdy zámek.
- **Focus:** úkol se spouští (`index.html?mission=<id>`) ve **vlastním čerstvém stroji** postaveném z `setup` úkolu (soubory, uživatelé, cwd).
  Pískoviště žáka se nemění a nehodnotí se v něm nic; v úkolu se vyhodnocují jen cíle právě vybraného úkolu. Rozpracovaný úkol se autosavuje
  zvlášť a jde po návratu obnovit; „Začít znovu“ dá čistý start.
- **Postup je oddělený od stroje** (vlastní klíč v IndexedDB: `{id: {stars, hints, done, at}}`). Díky tomu: ztracený záloha pískoviště nic
  nerozbije (úkoly se stavějí z `setup`), a ztracený postup se dá snadno získat zpět – úkol lze kdykoli spustit rovnou a bez nápověd dostat
  3 ⭐ („Už to umím“). Žádné odemykání, takže nic nečeká na dřívější úkoly.
- **Přenositelnost na měsíce:** Export na stránce kampaně i v pískovišti ukládá pískoviště i postup do jednoho souboru (samotný postup: malý JSON `{format, app, kind:"progress", missions:{…}}`) a Import se slučuje (bere lepší hvězdy);
  celý export počítače (`format` 2, migrace) obsahuje `progress` také. Připomínka „naposledy zálohováno před N dny“. Soubor se validuje jako
  jakýkoli jiný import (jen data). Verze úkolů: stabilní `id`, úkol má `rev`; změněný úkol postup nemaže.
- **Hvězdy:** ⭐ splněno; ⭐⭐ bez použité nápovědy; ⭐⭐⭐ navíc splněn bonus (elegantní řešení – např. jednou rourou, bez zbytečného `sudo`).

**Formát úkolu (náčrt)**
```json
{ "id": "txt-grep-1", "rev": 1, "chapter": "text", "level": 1, "needs": ["ls","cat"],
  "title": {"cs":"…","en":"…"}, "brief": {"cs":"…","en":"…"},
  "setup": { "files": {"~/log.txt":"…"}, "users": [], "cwd": "~" },
  "goals": [ { "id":"g1", "text":{"cs":"…","en":"…"}, "check": {"fileContains":["~/errors.txt","ERROR"]} } ],
  "bonus": [ { "text":{…}, "check": {"pipeline":true} } ],
  "hints": [ {"cs":"…","en":"…"}, … ] }
```
Kontroly (deklarativní, vyhodnocují se po každém řádku): `fileExists`, `fileContains`, `fileEquals`, `mode`, `owner`, `dirExists`, `symlink`,
`ran` (použitý příkaz), `pipeline`, `output` (regex na výstup), případně vlastní JS funkce u vzácných úkolů. Vždy **stav je cíl, příkazy jsou bonus**:
cíl lze splnit libovolným správným způsobem.

**Kapitoly (první várka)** orientace · soubory a adresáře · text · roury a přesměrování · práva · uživatelé a `sudo` · shell a prostředí.
Skriptování, procesy a síť přibudou s druhou iterací příkazů.

**Stav implementace (první řez HOTOVÝ):** jádro `core/mission.js` + testy, úložiště postupu v `storage.js`, režim úkolu v `main.js`
(`index.html?mission=<id>`, panel `ui/missionpanel.js`, příkaz `mission`), `campaign.html`, 20 úkolů v 8 kapitolách (po bloku A přibyly Hledání a analýza, Pokročilý text, Skupiny a práva), kapitola Kampaň v `docs.html`.
Odchylky od původního návrhu: export celého systému zůstal `format` 1 (pole `progress` je volitelné, bez migrace); `mission` je vestavěný příkaz
(funguje i ve starých uložených systémech); rozpracovaný úkol se ukládá pod klíčem `mission:<id>`; každý úkol musí mít v JSON `solution` a `best`
(řešení, která přehrává `tests/mission.test.js`). Ověřeno v prohlížeči: stránka kampaně, spuštění úkolu, odškrtávání cílů, zápis hvězd.
Neověřeno: mobil, Export/Import postupu v prohlížeči (jen testy), „Znovu“ a „Skončit“ v panelu.

**Další kroky**
1. Dávkově další úkoly po kapitolách (cíl: hromada; viz `needs` – jen příkazy, které už existují) a kapitoly pro skriptování/procesy/síť s druhou iterací příkazů.
2. Učitelský přehled (stránka, kam učitel nahraje exporty postupu; bez jmen, např. přezdívka/kód zvolený žákem), případně podpis proti omylům.
3. Případně: štítek „doporučeno nejdřív“ podle prerekvizit, hledání v kampani, odznaky za kapitolu.

## Jak pokračovat na jiném stroji
1. Zkopírovat celou složku `bubos` (nebo `git init` + repozitář; `.gitignore` zatím není – přidat `node_modules/` pro jistotu).
2. Potřeba jen Node ≥ 18 (testy) a libovolný statický server (`python -m http.server 8080` / `php -S localhost:8080`).
3. `npm test` musí projít; pak otevřít http://localhost:8080.
4. Claude si načte `CLAUDE.md` (kontext), v případě potřeby `docs/ARCHITEKTURA.md`. Nic dalšího není potřeba – žádná externí stavová data.
5. Data žáků/učitele jsou v IndexedDB prohlížeče daného stroje; na jiný stroj je přenese Export → Import.
