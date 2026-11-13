# BubOS – kontext pro Clauda

Výukový simulátor Linuxu v prohlížeči pro učitele střední školy (uživatel, komunikace česky).
Přehled rozhodnutí a plán: `docs/PROJEKT.md`. Architektura a konvence: `docs/ARCHITEKTURA.md`.

## Pravidla projektu (rozhodnutí uživatele)
- LITE: žádný build, žádné npm závislosti, čisté ES moduly, vlastní DOM terminál (bez xterm.js).
- Server (PHP) jen servíruje statické soubory; žádná uživatelská data na serveru. Stav je v prohlížeči + export/import JSON.
- Jednoduchost a modularita: nový příkaz = jeden soubor. Preferovat jednoduché řešení.
- Příkazy standardní (anglické), nápověda a hlášení česky i anglicky (`i18n/`, `man/`). Výuková věrnost, ne dokonalá shoda s bashem.
- Volné pískoviště, zatím bez úkolů/lekcí. Linux nyní, Windows profil později (jádro je OS-nezávislé).
- Komentáře v kódu česky, stručné; styl kódu viz okolní soubory.

## Příkazy
- Testy: `npm test` (= `node --test`; Node 24 stačí, bez závislostí; `node --test tests/` na Node 24 nefunguje).
- Uživatelská dokumentace/manuál: `docs.html` (+ `css/docs.css`, `js/docs.js`), odkaz „Dokumentace“ je v horní liště `index.html`. Referenční příručka příkazů se čte z `man/*.txt` sama (nový příkaz = jen přidat do `CATS` v `js/docs.js`, jinak spadne do „Ostatní“); ručně psané kapitoly (struktura FS, soubory projektu, klávesy) je nutné při změnách aktualizovat.
- Spuštění: `python -m http.server 8080` (PHP na dev stroji nebylo), pak http://localhost:8080. ES moduly nejdou z `file://`.
- `.claude/launch.json` má konfiguraci `bubos` pro preview_start.

## Pasti, které už jsme potkali
- Skrytý Browser pane = klávesy z automatizace se ztrácejí; nejdřív `mcp__ccd_view__show_pane` (preview), pak screenshot před klikem.
- Automatizace píše dřív, než naskočí další prompt → píšte po jednom příkazu, ne v dávce.
- Cyklický import `profile.js` ↔ `skeleton.js` funguje jen proto, že `COMMANDS` se čte až za běhu funkce.
- Před commitem/přidáním příkazu spustit `npm test`; kontrola, že každý příkaz má stránku v `man/cs.txt` i `man/en.txt` a klíče v obou `i18n/*.json` (skript se dá snadno znovu napsat – viz `docs/ARCHITEKTURA.md`).
- Složka zatím NENÍ git repozitář.

## Stav
MVP hotové a ověřené (viz `docs/PROJEKT.md`, sekce Stav a Plán). Další krok: druhá iterace.
