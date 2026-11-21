// Testy kampaně: definice úkolů, jejich řešení, hvězdy, postup žáka.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './helpers.js';
import linux, { COMMANDS, missionSource } from '../js/os/linux/profile.js';
import {
  MissionRun, applySetup, startDir, validateMission, commandsOf, evalCheck, HOME,
  emptyProgress, sanitizeProgress, extractProgress, recordResult, mergeProgress, totalStars,
} from '../js/core/mission.js';

missionSource.fn = async file => JSON.parse(readFileSync(new URL('../js/os/linux/missions/' + file, import.meta.url), 'utf8'));

const index = await linux.loadMissionIndex();
const ids = index.chapters.flatMap(c => c.missions);
const defs = Object.fromEntries(await Promise.all(ids.map(async id => [id, await linux.loadMission(id)])));

// Zahraje řádky v čerstvém stroji připraveném podle úkolu a vyhodnotí je stejně jako main.js
async function play(def, lines, { hint = false } = {}) {
  const h = await boot({ lang: 'en', answers: Array(20).fill('student') });
  applySetup(h.m, def.setup);
  const d = startDir(def.setup);
  if (h.m.fs.exists(d, null)) { h.sh.cwd = d; h.sh.vars.PWD = d; }
  const run = new MissionRun(def);
  h.m.mission = run;
  run.update(h.m, h.sh.cwd);
  const start = { done: run.done, bonus: [...run.bonusDone] };
  if (hint) run.hint('en');
  for (const l of lines) {
    const r = await h.run(l);
    run.observe(l, r.out);
    run.update(h.m, h.sh.cwd);
  }
  for (const p of h.m.procs.list()) if (!p.sys && p.cmd !== '-bash') p.deliver(9); // ať po testu nezůstanou sleep na pozadí
  return { run, h, start };
}

test('rejstřík: každý úkol existuje, id je jedinečné a shoduje se se souborem', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(defs[id].id, id);
});

test('definice úkolů jsou platné a doporučené příkazy existují', () => {
  for (const [id, d] of Object.entries(defs)) {
    assert.deepEqual(validateMission(d), [], id);
    for (const n of d.needs ?? []) assert.ok(COMMANDS.includes(n), `${id}: neznámý příkaz ${n}`);
  }
});

for (const id of ids) {
  test(`úkol ${id}: na začátku nic není splněno; řešení dá 2 hvězdy, nejlepší řešení 3`, async () => {
    const def = defs[id];
    const a = await play(def, def.solution);
    assert.equal(a.start.done, false, 'úkol nesmí být splněný hned po spuštění');
    assert.ok(a.start.bonus.every(b => !b), 'bonus nesmí být splněný hned po spuštění');
    assert.ok(a.run.done, 'solution nesplnilo všechny cíle: ' + JSON.stringify(a.run.goals));
    assert.equal(a.run.stars, 2);
    const b = await play(def, def.best);
    assert.ok(b.run.done && b.run.bonusDone.every(Boolean), 'best nesplnilo cíle i bonus: ' + JSON.stringify([b.run.goals, b.run.bonusDone]));
    assert.equal(b.run.stars, 3);
    const c = await play(def, def.best, { hint: true });
    assert.equal(c.run.stars, 1, 's nápovědou jen jedna hvězda');
  });
}

test('hvězdy přibydou, když se bonus splní až po cílech', async () => {
  const def = defs['soub-vytvor'];
  const { run, h } = await play(def, def.solution);
  assert.equal(run.stars, 2);
  const l = 'mkdir -p skola/ict/linux';
  const r = await h.run(l);
  run.observe(l, r.out);
  assert.equal(run.update(h.m, h.sh.cwd), true);
  assert.equal(run.stars, 3);
});

test('stav rozpracovaného úkolu přežije uložení', async () => {
  const def = defs['orient-kde-jsem'];
  const { run } = await play(def, ['pwd', 'ls -a']);
  const again = new MissionRun(def, JSON.parse(JSON.stringify(run.toState())));
  assert.deepEqual(again.lines, ['pwd', 'ls -a']);
  assert.deepEqual(again.bonusDone, run.bonusDone);
});

test('příkaz mission: bez úkolu chyba, s úkolem stav a nápověda', async () => {
  const h = await boot({ lang: 'en' });
  let r = await h.run('mission');
  assert.notEqual(r.st, 0);
  assert.match(r.out, /no mission is running/);
  const def = defs['orient-kde-jsem'];
  h.m.mission = new MissionRun(def);
  r = await h.run('mission');
  assert.equal(r.st, 0);
  assert.match(r.out, /Where am I\?/);
  assert.match(r.out, /\[ \] Find out where you are/);
  r = await h.run('mission hint');
  assert.match(r.out, /Hint 1\/3/);
  assert.equal(h.m.mission.hints, 1);
});

test('commandsOf: příkazy v rourách, sudo a přiřazení', () => {
  assert.deepEqual(commandsOf('grep a f | wc -l'), ['grep', 'wc']);
  assert.deepEqual(commandsOf('sudo -u root cat /x > y'), ['sudo', 'cat']);
  assert.deepEqual(commandsOf('A=1 ls; /usr/bin/pwd && echo ok'), ['ls', 'pwd', 'echo']);
});

test('kontroly: kombinátory a neznámý typ', async () => {
  const h = await boot();
  const env = { fs: h.m.fs, home: HOME, lines: [], out: '', cwd: HOME };
  assert.equal(evalCheck({ dirExists: '~/Documents' }, env), true);
  assert.equal(evalCheck({ not: { dirExists: '~/nic' } }, env), true);
  assert.equal(evalCheck({ any: [{ fileExists: '~/nic' }, { fileExists: '~/Documents' }] }, env), true);
  assert.equal(evalCheck({ all: [{ fileExists: '~/nic' }, { fileExists: '~/Documents' }] }, env), false);
  assert.equal(evalCheck({ mode: ['~/Documents', '755'] }, env), true);
  assert.equal(evalCheck({ owner: ['~/Documents', 'student', 'student'] }, env), true);
  assert.throws(() => evalCheck({ nesmysl: 1 }, env));
});

test('postup: zápis, slučování, validace a nedůvěryhodný vstup', () => {
  const p = emptyProgress();
  assert.equal(recordResult(p, 'a-1', { stars: 2, hints: 0, rev: 1 }), true);
  assert.equal(recordResult(p, 'a-1', { stars: 1, hints: 0, rev: 1 }), false, 'horší výsledek se nezapíše');
  assert.equal(recordResult(p, 'a-1', { stars: 3, hints: 0, rev: 1 }), true);
  const q = emptyProgress();
  recordResult(q, 'a-1', { stars: 1, hints: 0, rev: 1 });
  recordResult(q, 'b-2', { stars: 2, hints: 1, rev: 1 });
  const m = mergeProgress(p, q);
  assert.equal(m.missions['a-1'].stars, 3);
  assert.equal(m.missions['b-2'].stars, 2);
  assert.equal(totalStars(m), 5);
  // nedůvěryhodný soubor: špatná jména a hodnoty se zahodí
  const bad = sanitizeProgress({ app: 'bubos', format: 1, missions: { __proto__x: { stars: 3 }, 'ok-1': { stars: 9 }, 'ok-2': { stars: 2, hints: -4 }, 'X Y': { stars: 1 } } });
  assert.deepEqual(Object.keys(bad.missions), ['ok-2']);
  assert.equal(bad.missions['ok-2'].hints, 0);
  assert.throws(() => sanitizeProgress({ app: 'jiny' }));
  // postup lze vyčíst i z exportu celého systému
  assert.equal(extractProgress({ format: 1, app: 'bubos', os: 'linux', progress: p }).missions['a-1'].stars, 3);
  assert.throws(() => extractProgress({ format: 1, app: 'bubos', os: 'linux' }));
});
