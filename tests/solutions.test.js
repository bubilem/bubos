// Vzorová řešení úloh v /root/.reseni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Machine } from '../js/core/machine.js';
import linux, { missionSource } from '../js/os/linux/profile.js';
import { installSolutions, SOLUTIONS_DIR } from '../js/os/linux/solutions.js';

missionSource.fn = async file => JSON.parse(readFileSync(new URL('../js/os/linux/missions/' + file, import.meta.url), 'utf8'));

test('každá úloha má v /root/.reseni skript s řešením a složka je skrytá v domově roota', async () => {
  const m = Machine.fresh(linux, { lang: 'cs' });
  await installSolutions(m, linux);
  const index = await linux.loadMissionIndex();
  for (const id of index.chapters.flatMap(c => c.missions)) {
    const def = await linux.loadMission(id);
    const text = m.fs.read(`${SOLUTIONS_DIR}/${id}.sh`, null);
    assert.ok(text.startsWith('#!/bin/bash'), id);
    for (const l of def.solution) assert.ok(text.includes(l), `${id}: chybí řádek řešení ${l}`);
    for (const l of def.best) assert.ok(text.includes(l), `${id}: chybí řádek nejlepšího řešení ${l}`);
  }
  assert.ok(m.fs.exists(SOLUTIONS_DIR + '/README.txt', null));
  assert.ok(SOLUTIONS_DIR.startsWith('/root/.'));
});

test('anglická verze se vytvoří bez chyby', async () => {
  const m = Machine.fresh(linux, { lang: 'en' });
  await installSolutions(m, linux);
  assert.match(m.fs.read(SOLUTIONS_DIR + '/README.txt', null), /Sample solutions/);
});
