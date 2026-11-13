import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const eq = async (b, line, out, st = 0) => {
  const r = await b.run(line);
  assert.equal(r.out, out, `výstup pro: ${line}`);
  assert.equal(r.st, st, `status pro: ${line}`);
};

test('základní příkazy a cesty', async () => {
  const b = await boot();
  await eq(b, 'pwd', '/home/student\n');
  await eq(b, 'cd Documents && pwd', '/home/student/Documents\n');
  await eq(b, 'cd ..; cd -', '/home/student/Documents\n');
  await eq(b, 'echo ahoj svete', 'ahoj svete\n');
  await eq(b, 'echo "a   b"  c', 'a   b c\n');
  await eq(b, 'cd /nonexistent', 'bash: cd: /nonexistent: No such file or directory\n', 1);
  await eq(b, 'neexistuje', 'bash: neexistuje: command not found\n', 127);
  await eq(b, 'whoami', 'student\n');
});

test('roury, přesměrování a práce se soubory', async () => {
  const b = await boot();
  await eq(b, 'echo hello > /tmp/a.txt && cat /tmp/a.txt', 'hello\n');
  await eq(b, 'echo world >> /tmp/a.txt; cat /tmp/a.txt', 'hello\nworld\n');
  await eq(b, 'cat /tmp/a.txt | wc -l', '2\n');
  await eq(b, 'printf=1; echo $printf', '1\n');
  await eq(b, 'cat < /tmp/a.txt | sort -r | head -1', 'world\n');
  await eq(b, 'cat /nope 2>&1 | wc -l', '1\n');
  await eq(b, 'cat /nope 2> /dev/null; echo $?', '1\n');
  await eq(b, 'seq 5 | tail -n 2', '4\n5\n');
  await eq(b, 'seq 1000000 | head -3', '1\n2\n3\n');
  await eq(b, 'yes | head -2', 'y\ny\n');
});

test('globbing, proměnné a substituce', async () => {
  const b = await boot();
  await eq(b, 'cd /tmp; touch a1 a2 b1; echo a*', 'a1 a2\n');
  await eq(b, 'echo "a*"', 'a*\n');
  await eq(b, 'echo nic*', 'nic*\n');
  await eq(b, 'x=$(echo 1 2 3); echo "$x"', '1 2 3\n');
  await eq(b, 'echo ~; echo $HOME', '/home/student\n/home/student\n');
  await eq(b, 'N=5; echo ${N}x ${M:-def}', '5x def\n');
  await eq(b, "echo '$HOME'", '$HOME\n');
  await eq(b, 'false || echo ok; true && echo yes', 'ok\nyes\n');
});

test('práva a uživatelé', async () => {
  const b = await boot({ answers: ['student'] });
  await eq(b, 'cat /etc/shadow', 'cat: /etc/shadow: Permission denied\n', 1);
  await eq(b, 'echo x > /etc/foo', 'bash: /etc/foo: Permission denied\n', 1);
  await eq(b, 'sudo whoami', 'root\n');
  await eq(b, 'sudo cat /etc/shadow | head -1 | cut -d: -f1', 'root\n');
  await eq(b, 'id', 'uid=1000(student) gid=1000(student) groups=1000(student),27(sudo),100(users)\n');
  await eq(b, 'touch f; chmod 000 f; cat f', 'cat: f: Permission denied\n', 1);
  await eq(b, 'chmod u+rw f; ls -l f | cut -c1-10', '-rw-------\n');
  await eq(b, 'chmod 755 f; ls -l f | cut -c1-10', '-rwxr-xr-x\n');
});

test('useradd, passwd a su', async () => {
  const b = await boot({ user: 'root', answers: ['pw1', 'pw1'] });
  await eq(b, 'useradd -m bob', '');
  await eq(b, 'ls /home', 'bob\nstudent\n');
  const r = await b.run('passwd bob');
  assert.equal(r.st, 0);
  await eq(b, 'su bob; whoami; exit', 'bob\nlogout\n'.replace('logout\n', ''));
});

test('grep a regulární výrazy', async () => {
  const b = await boot();
  await b.run('cd ~/Documents');
  await eq(b, 'grep -c ERROR log.txt', String((await b.run('grep ERROR log.txt')).out.trim().split('\n').length) + '\n');
  await eq(b, 'grep -E "^(Anna|Boris)" studenti.csv | cut -d";" -f1', 'Anna Nováková\nBoris Svoboda\n');
  await eq(b, 'grep -i "anna" studenti.csv | wc -l', '1\n');
  await eq(b, 'grep "9[0-9]$" studenti.csv | cut -d";" -f3', '92\n95\n');
  await eq(b, 'grep -v ";" studenti.csv', '', 1);
  await eq(b, 'echo "a.b" | grep -F "."', 'a.b\n');
  await eq(b, 'echo abc | grep -o "[[:alpha:]]\\{2\\}"', 'ab\n');
});

test('find, tree, ls', async () => {
  const b = await boot();
  await b.run('cd ~/Documents');
  await eq(b, 'find projekt -name "*.c"', 'projekt/src/main.c\nprojekt/src/util.c\n');
  await eq(b, 'find projekt -type d | sort', 'projekt\nprojekt/docs\nprojekt/include\nprojekt/src\n');
  await eq(b, 'ls projekt | cat', 'docs\ninclude\nMakefile\nsrc\n');
  await eq(b, 'ls -A projekt | head -1', '.gitignore\n');
  const t = await b.run('tree projekt');
  assert.match(t.out, /├── docs\n│   └── README.md\n├── include/);
  assert.match(t.out, /3 directories, 5 files/);
});

test('rm, cp, mv, mkdir', async () => {
  const b = await boot();
  await eq(b, 'cd /tmp; mkdir -p x/y/z; touch x/y/z/f; ls x/y/z', 'f\n');
  await eq(b, 'cp -r x x2; ls x2/y/z', 'f\n');
  await eq(b, 'mv x2 x3; ls', 'x\nx3\n');
  await eq(b, 'rm x', 'rm: cannot remove \'x\': Is a directory\n', 1);
  await eq(b, 'rm -r x x3; ls', '');
  await eq(b, 'rm -rf /', "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n", 1);
});

test('historie, alias, doplňování', async () => {
  const b = await boot();
  await eq(b, 'alias hi="echo hello"', '');
  await eq(b, 'hi there', 'hello there\n');
  await eq(b, 'echo one', 'one\n');
  await eq(b, '!!', 'echo one\none\n');
  const c = await b.sh.complete('ls Doc', 6);
  assert.equal(c.cands[0].text, 'Documents/');
  const d = await b.sh.complete('wh', 2);
  assert.ok(d.cands.some(x => x.text === 'whoami'));
  const e = await b.sh.complete('echo $HO', 8);
  assert.equal(e.cands[0].text, '$HOME');
});

test('skripty a test', async () => {
  const b = await boot();
  await b.run('cd /tmp');
  await b.run('echo "echo ahoj \\$1" > s.sh');
  await eq(b, './s.sh', 'bash: ./s.sh: Permission denied\n', 126);
  await b.run('chmod +x s.sh');
  await eq(b, './s.sh svete', 'ahoj svete\n');
  await eq(b, 'test -f s.sh && echo je; [ 3 -gt 2 ] && echo vetsi', 'je\nvetsi\n');
});
