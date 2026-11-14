import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const eq = async (b, line, out, st = 0) => {
  const r = await b.run(line);
  assert.equal(r.out, out, `výstup pro: ${line}`);
  assert.equal(r.st, st, `status pro: ${line}`);
};

test('zábavné příkazy', async () => {
  const b = await boot();
  await eq(b, 'factor 42 97 1', '42: 2 3 7\n97: 97\n1: 1\n');
  await eq(b, 'seq 4 | factor | tail -1', '4: 2 2\n');
  assert.match((await b.run('cowsay Ahoj')).out, /^ _{6}\n< Ahoj >\n -{6}\n/);
  assert.match((await b.run('fortune | cowsay -f tux')).out, /\|o_o \|/);
  assert.match((await b.run('sl')).out, /ls/);
  assert.ok((await b.run('fortune')).out.length > 10);
});

test('easter eggy v systému', async () => {
  const b = await boot();
  assert.match((await b.run('grep -c 42 ~/Documents/studenti.csv')).out, /^1\n$/);
  assert.match((await b.run('grep Turing ~/Documents/studenti.csv')).out, /Alan Turing;2\.A;42/);
  assert.match((await b.run('cat ~/Documents/answer.txt')).out, /Answer: 42/);
  assert.match((await b.run('ps -e | grep deep-thought')).out, /^\s+42 /);
  const v = await b.run('vim');
  assert.equal(v.st, 127);
  assert.match(v.out, /nano/);
  const f = await b.run(':(){ :|:& };:');
  assert.match(f.out, /defused/);
  const r = await boot({ user: 'root' });
  await eq(r, 'sudo make me a sandwich', 'Okay.\n');
});
