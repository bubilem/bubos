# BubOS

Výukový simulátor Linuxu běžící celý v prohlížeči (bez serverové části, bez instalace).

## Spuštění

Na Windows stačí dvojklik na `start.bat` (zvolí PHP, jinak Node, jinak Python; otevře prohlížeč; jiný port: `start.bat 9000`).
Ručně:

Stačí statický webserver ve složce projektu, např. `php -S localhost:8080` nebo `python -m http.server 8080`
(ES moduly nefungují z `file://`). Na produkci prostě nahrajte složku na PHP hosting.

Uživatelský manuál: `docs.html` (v aplikaci odkaz „Dokumentace“ v horní liště) – příkazy, klávesy, struktura systému i projektu.
Vývojářská dokumentace: `docs/PROJEKT.md` (rozhodnutí, stav, plán, přenos na jiný stroj), `docs/ARCHITEKTURA.md` (vrstvy a konvence), `CLAUDE.md` (kontext pro Clauda).

## Struktura

- `js/core/` – jádro bez DOM: virtuální FS (`vfs.js`), uživatelé, proudy, parser a spouštění shellu (`shell/`)
- `js/os/linux/` – profil OS: `profile.js` (seznam příkazů, PATH, prompt), `skeleton.js` (výchozí FS), `commands/` (1 soubor = 1 příkaz)
- `js/ui/` – terminál, pager (less/man), editor (nano)
- `i18n/` – překlady rozhraní a hlášení (cs, en); `man/` – manuálové stránky (cs, en)
- `tests/` – testy jádra: `npm test`

## Přidání příkazu

1. `js/os/linux/commands/jmeno.js` s `export default { async run(ctx) { ... } }`
2. přidat název do `COMMANDS` v `js/os/linux/profile.js`
3. přidat stránku `#### jmeno` do `man/cs.txt` a `man/en.txt`

## Ukládání

Stav se průběžně ukládá do IndexedDB v prohlížeči. Tlačítka Export / Import ukládají a načítají celý systém do JSON souboru.
Účty: `student` / `student`, `root` / `root`.
