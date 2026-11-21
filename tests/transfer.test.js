// Export a import: pískoviště i postup v kampani se přenášejí jedním souborem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { parseImport } from '../js/core/storage.js';
import { emptyProgress, mergeProgress, recordResult, extractProgress } from '../js/core/mission.js';

const progress = () => { const p = emptyProgress(); recordResult(p, 'orient-kde-jsem', { stars: 3, hints: 0, rev: 1 }); return p; };

test('celý export: pískoviště i postup se rozpoznají', async () => {
  const b = await boot();
  await b.run('echo ahoj > ~/pisek.txt');
  const file = JSON.parse(JSON.stringify({ ...b.m.snapshot(), progress: progress() }));
  const r = parseImport(file);
  assert.equal(r.progress, true);
  assert.ok(r.system.fs.children.home.children.student.children['pisek.txt']);
  assert.equal(extractProgress(file).missions['orient-kde-jsem'].stars, 3);
});

test('soubor jen s postupem nemá pískoviště', () => {
  const r = parseImport(JSON.parse(JSON.stringify({ ...progress(), kind: 'progress' })));
  assert.equal(r.system, null);
  assert.equal(r.progress, true);
});

test('starší export bez postupu je platný, bez postupu', async () => {
  const b = await boot();
  const r = parseImport(JSON.parse(JSON.stringify(b.m.snapshot())));
  assert.ok(r.system);
  assert.equal(r.progress, false);
});

test('cizí nebo poškozený soubor se odmítne', () => {
  assert.throws(() => parseImport({ a: 1 }));
  assert.throws(() => parseImport(null));
  assert.throws(() => parseImport({ format: 1, app: 'bubos', os: 'linux', fs: { type: 'nic' } }));
  assert.throws(() => parseImport({ kind: 'progress', app: 'jiny', format: 1, missions: {} }));
});

test('slučování postupu nikdy nesníží hvězdy', () => {
  const a = progress(), weak = emptyProgress();
  recordResult(weak, 'orient-kde-jsem', { stars: 1, hints: 2, rev: 1 });
  recordResult(weak, 'text-chyby', { stars: 2, hints: 0, rev: 1 });
  const m = mergeProgress(a, weak);
  assert.equal(m.missions['orient-kde-jsem'].stars, 3);
  assert.equal(m.missions['text-chyby'].stars, 2);
});
