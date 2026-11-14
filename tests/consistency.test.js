import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import linux from '../js/os/linux/profile.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('každý příkaz má manuálovou stránku česky i anglicky', () => {
  for (const lang of ['cs', 'en']) {
    const names = new Set(read(`man/${lang}.txt`).split('\n').filter(l => l.startsWith('#### ')).flatMap(l => l.slice(5).trim().split(/\s+/)));
    const missing = linux.commands.filter(c => !names.has(c));
    assert.deepEqual(missing, [], `chybí stránky v man/${lang}.txt`);
  }
});

test('slovníky cs a en mají stejné klíče', () => {
  const cs = Object.keys(JSON.parse(read('i18n/cs.json'))), en = new Set(Object.keys(JSON.parse(read('i18n/en.json'))));
  assert.deepEqual(cs.filter(k => !en.has(k)), []);
  assert.deepEqual([...en].filter(k => !cs.includes(k)), []);
});

test('každá manuálová stránka má v prvním řádku krátký popisek (jmeno - popis)', () => {
  for (const lang of ['cs', 'en']) {
    const parts = read(`man/${lang}.txt`).replace(/\r\n/g, '\n').split(/^#### (.+)$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const lines = parts[i + 1].replace(/^\n+/, '').split('\n');
      assert.match(lines[1] ?? '', /^\s+\S.*? - .+$/, `${lang}: ${parts[i]}`);
    }
  }
});
