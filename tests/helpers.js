// Pomocné funkce pro testy: virtuální terminál bez prohlížeče
import { readFileSync } from 'node:fs';
import { setDict, setLang } from '../js/core/i18n.js';
import { Machine } from '../js/core/machine.js';
import { Shell } from '../js/core/shell/shell.js';
import { sessionUser } from '../js/core/users.js';
import linux, { manSource } from '../js/os/linux/profile.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
setDict('cs', JSON.parse(read('i18n/cs.json')));
setDict('en', JSON.parse(read('i18n/en.json')));
manSource.fn = async lang => { try { return read(`man/${lang}.txt`); } catch { return ''; } };

export async function boot({ lang = 'en', user = 'student', answers = [] } = {}) {
  setLang(lang);
  const m = Machine.fresh(linux, { lang });
  const tty = {
    isTTY: false, buf: '', cols: 80,
    write(s) { this.buf += s; },
    async readLine() { return null; },
    async ask() { return answers.shift() ?? ''; },
    clear() {},
  };
  const sh = new Shell(m, sessionUser(m.fs, user), { tty });
  await sh.start();
  // spustí řádek a vrátí { out, st }; výstup se čistí po každém volání
  const run = async line => {
    tty.buf = '';
    const st = await sh.run(line);
    return { out: tty.buf, st };
  };
  return { m, sh, tty, run };
}
