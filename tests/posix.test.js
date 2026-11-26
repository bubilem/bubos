// sh, command, set, getopts, trap, expr, getconf a průchod posixcheck-lite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './helpers.js';

const script = readFileSync(new URL('./posixcheck-lite.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

async function withFile(data, name = 't.sh') {
  const env = await boot();
  env.m.fs.put('/home/student/' + name, data, { mode: 0o755, uid: 1000, gid: 1000 });
  return env;
}
// očekává přesný výstup (a volitelně návratový kód) skriptu
async function expect(code, out, st) {
  const { run } = await withFile(code + '\n');
  const r = await run('sh t.sh');
  assert.equal(r.out, out, code);
  if (st !== undefined) assert.equal(r.st, st, code);
}

test('posixcheck-lite projde celý', async () => {
  const { run } = await withFile(script, 'posixcheck-lite.sh');
  for (const line of ['sh posixcheck-lite.sh', './posixcheck-lite.sh bash']) {
    const r = await run(line);
    assert.doesNotMatch(r.out, /\[FAIL\]/);
    assert.match(r.out, /40 prošlo, 0 selhalo/);
    assert.equal(r.st, 0);
  }
});

test('nový shell dostane jen exportované proměnné a změny nevrací', async () => {
  const { run } = await boot();
  await run("a=1; export b=2; alias x='echo alias'; f() { echo f; }");
  assert.equal((await run("sh -c 'echo [$a][$b]; x; f; b=9; cd /' 2>/dev/null; echo $b; pwd")).out, '[][2]\n2\n/home/student\n');
  assert.equal((await run("sh -c 'echo $0 $1 $#' jmeno p q")).out, 'jmeno p 2\n');
  assert.equal((await run("echo 'echo ze vstupu' | sh")).out, 'ze vstupu\n');
  assert.equal((await run('sh neni.sh')).st, 127);
  assert.equal((await run("sh -c 'exit 3'; echo $?")).out, '3\n');
});

test('interaktivní vnořený shell čte řádky do exit', async () => {
  const { sh, tty, run } = await boot();
  const lines = ['x=5', 'if true; then', 'echo $x', 'fi', 'exit 4', 'echo nikdy'];
  tty.readLine = async () => lines.shift() ?? null;
  sh.base.stdin.sticky = false;
  const r = await run('sh');
  assert.equal(r.out, '5\n');
  assert.equal(r.st, 4);
});

test('$( ) je podshell', async () => {
  await expect('x=1; y=$(x=2; cd /; echo $x); echo $x $y; pwd', '1 2\n/home/student\n');
  await expect('v=$(exit 3); echo $?; echo dál', '3\ndál\n');
});

test('set -e a jeho výjimky', async () => {
  await expect('set -e; false; echo no', '', 1);
  await expect('set -e; if false; then :; fi; false || echo a; false && echo no; ! true; echo b', 'a\nb\n', 0);
  await expect('set -e; f() { false; echo uvnitř; }; if f; then echo ok; fi', 'uvnitř\nok\n');
  await expect('set -e; for i in 1 2; do [ $i = 1 ] && echo jedna; done; echo konec', 'jedna\nkonec\n');
  await expect('set -e; x=$(false); echo no', '', 1);
  await expect('set -e; (exit 2); echo no', '', 2);
  await expect('set -e; set +e; false; echo ano', 'ano\n');
  const { run } = await boot();
  assert.equal((await run('set -e; false; echo dál')).out, 'dál\n', 'interaktivní shell se neukončí');
  assert.equal((await run("sh -ec 'false; echo no'")).st, 1);
});

test('set -- a výpis proměnných', async () => {
  await expect("set -- a 'b c'; echo $# \"$2\"; set --; echo $#", '2 b c\n0\n');
  await expect('zz="a b"; set | grep ^zz=', "zz='a b'\n");
});

test('getopts', async () => {
  const loop = 'while getopts "vn:" o; do echo "$o:$OPTARG"; done; shift $((OPTIND-1)); echo "zbytek $*"';
  await expect(`set -- -v -n5 -vn 7 -- -x y; ${loop}`, 'v:\nn:5\nv:\nn:7\nzbytek -x y\n');
  await expect(`set -- soubor -v; ${loop}`, 'zbytek soubor -v\n');
  await expect('set -- -z -n; while getopts :n: o; do echo "$o $OPTARG"; done', '? z\n: n\n');
  await expect('set -- -a; getopts a o; OPTIND=1; getopts a o; echo $? $o', '0 a\n');
});

test('trap EXIT', async () => {
  await expect("trap 'echo bye $?' EXIT; echo a; exit 5", 'a\nbye 5\n', 5);
  await expect("set -e; trap 'echo úklid' EXIT; false", 'úklid\n', 1);
  await expect("(trap 'echo vnitřní' EXIT); echo venku", 'vnitřní\nvenku\n');
  await expect("trap 'echo x' EXIT INT; trap; trap - EXIT INT; trap", "trap -- 'echo x' EXIT\ntrap -- 'echo x' INT\n");
  await expect('trap x SPATNY 2>/dev/null; echo $?', '1\n');
});

test('command', async () => {
  await expect('command -v ls; command -v echo; command -v nic; echo $?', '/usr/local/bin/ls\n'.replace('/local', '') + 'echo\n1\n');
  await expect('echo() { printf "funkce\\n"; }; echo a; command echo b', 'funkce\nb\n');
});

test('expr a getconf', async () => {
  const { run } = await boot();
  const out = async c => (await run(c)).out;
  assert.equal(await out('expr 2 + 3 \\* 4'), '14\n');
  assert.equal(await out("expr \\( 2 + 3 \\) \\* 4"), '20\n');
  assert.equal(await out('expr 7 / 2; expr 7 % 2; expr 10 \\> 9; expr length ahoj; expr substr abcdef 2 3; expr index abc c'), '3\n1\n1\n4\nbcd\n3\n');
  assert.equal(await out("expr abc123 : '[a-z]*'; expr soubor.txt : '\\(.*\\)\\.txt'"), '3\nsoubor\n');
  assert.equal((await run('expr 0')).st, 1);
  assert.equal((await run('expr 1 / 0')).st, 2);
  assert.equal((await run('expr 1 +')).st, 2);
  assert.equal(await out('getconf _POSIX_VERSION'), '200809\n');
  assert.equal((await run('getconf NIC')).st, 1);
});

test('Ctrl+C zastaví smyčku ve skriptu i v sh -c', async () => {
  const { sh, run } = await withFile('while true; do sleep 0.01; done\n');
  for (const line of ['sh t.sh', './t.sh', "sh -c 'x=$(sleep 30)'"]) {
    setTimeout(() => sh.interrupt(), 60);
    assert.equal((await run(line)).st, 130, line);
  }
});
