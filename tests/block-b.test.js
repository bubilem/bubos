import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const eq = async (b, line, out, st = 0) => {
  const r = await b.run(line);
  assert.equal(r.out, out, `výstup pro: ${line}`);
  assert.equal(r.st, st, `status pro: ${line}`);
};

test('aritmetika $((…)), let a ((…))', async () => {
  const b = await boot();
  await eq(b, 'echo $((1 + 2 * 3))', '7\n');
  await eq(b, 'x=5; echo $((x * x)) $((x % 3)) $((2 ** 10)) $((10 / 3))', '25 2 1024 3\n');
  await eq(b, 'echo $(( (1+2) * 4 )) $((7 > 3 ? 1 : 0)) $((1 && 0)) $((!0))', '12 1 0 1\n');
  await eq(b, 'n=1; n=$((n + 1)); echo $n; echo $((n++)) $n $((++n)) $n', '2\n2 3 4 4\n');
  await eq(b, 'let "a = 4 + 1" b=a*2; echo $a $b', '5 10\n');
  await eq(b, 'let x=0', '', 1);
  await eq(b, '((3 > 2)) && echo ano', 'ano\n');
  await eq(b, '((i = 5)); ((i += 2)); echo $i', '7\n');
  await eq(b, 'echo $((1/0))', 'bash: 1/0: division by 0\n', 1);
});

test('pozicni parametry a rozsireni promennych', async () => {
  const b = await boot();
  await eq(b, 'f() { echo "$# $1 $2"; }; f a "b c" d', '3 a b c\n');
  await eq(b, 'f() { for x in "$@"; do echo "<$x>"; done; }; f "a b" c', '<a b>\n<c>\n');
  await eq(b, 'f() { echo "$*"; shift; echo "$# $1"; }; f x y z', 'x y z\n2 y\n');
  await eq(b, 'echo ${u:-nic} ${#HOME}', 'nic 13\n');
  await eq(b, 'f=report.final.txt; echo ${f%.txt} ${f%%.*} ${f#*.} ${f##*.}', 'report.final report final.txt txt\n');
  await eq(b, 'p=/a/b/c; echo ${p/b/X} ${p//\\//-}', '/a/X/c -a-b-c\n');
  await eq(b, 's=abcdef; echo ${s:2} ${s:1:3} ${s:-2:5}', 'cdef bcd abcdef\n');
  await eq(b, 'echo ${v:=def}; echo $v ${w:+set} ${HOME:+set}', 'def\ndef set\n');
});

test('if / elif / else', async () => {
  const b = await boot();
  await eq(b, 'if true; then echo ano; fi', 'ano\n');
  await eq(b, 'if false; then echo ano; else echo ne; fi', 'ne\n');
  await eq(b, 'x=5\nif [ $x -lt 3 ]; then\n  echo male\nelif [ $x -lt 10 ]; then\n  echo stredni\nelse\n  echo velke\nfi', 'stredni\n');
  await eq(b, 'if ! grep -q zzz /etc/passwd; then echo nenalezeno; fi', 'nenalezeno\n');
  await eq(b, 'if [[ "abc" == a* && 3 -gt 2 ]]; then echo ok; fi', 'ok\n');
  await eq(b, 'if [[ abc =~ ^a.c$ ]]; then echo shoda; fi', 'shoda\n');
  await eq(b, 'if [[ -n $nic ]]; then echo ano; else echo ne; fi', 'ne\n');
  await eq(b, 'if true; then false; fi; echo $?', '1\n');
  await eq(b, 'if false; then echo x; fi; echo $?', '0\n');
});

test('for, while, until, break, continue', async () => {
  const b = await boot();
  await eq(b, 'for i in 1 2 3; do echo "c$i"; done', 'c1\nc2\nc3\n');
  await eq(b, 'for f in /etc/host*; do echo $f; done', '/etc/hostname\n/etc/hosts\n');
  await eq(b, 'for ((i=0; i<3; i++)); do echo $i; done', '0\n1\n2\n');
  await eq(b, 'i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done', '0\n1\n2\n');
  await eq(b, 'i=3; until [ $i -eq 0 ]; do echo $i; i=$((i-1)); done', '3\n2\n1\n');
  await eq(b, 'for i in 1 2 3 4 5; do if [ $i -eq 2 ]; then continue; fi; if [ $i -eq 4 ]; then break; fi; echo $i; done', '1\n3\n');
  await eq(b, 'for a in 1 2; do for c in x y; do if [ $c = y ]; then continue 2; fi; echo $a$c; done; done', '1x\n2x\n');
  await eq(b, 'for a in 1 2; do for c in x y; do break 2; done; echo nikdy; done; echo konec', 'konec\n');
  await eq(b, 'for i in a b c; do echo $i; done | wc -l', '3\n');
  await eq(b, 'seq 3 | while read n; do echo "n=$n"; done', 'n=1\nn=2\nn=3\n');
  await b.run('printf "a 1\\nb 2\\n" > /tmp/in.txt');
  await eq(b, 'while read k v; do echo "$v:$k"; done < /tmp/in.txt', '1:a\n2:b\n');
  await eq(b, 'while :; do echo jednou; break; done', 'jednou\n');
});

test('case', async () => {
  const b = await boot();
  const prog = 'case $1 in\n  start|go) echo spusteno ;;\n  stop) echo zastaveno ;;\n  *.txt) echo textovy ;;\n  *) echo neznamy ;;\nesac';
  await eq(b, `f() { ${prog}\n}; f start; f go; f stop; f a.txt; f jine`, 'spusteno\nspusteno\nzastaveno\ntextovy\nneznamy\n');
  await eq(b, 'case x in a) echo a;; esac; echo $?', '0\n');
  await eq(b, 'x=Ahoj; case "$x" in [A-Z]*) echo velke;; esac', 'velke\n');
});

test('funkce, return, local', async () => {
  const b = await boot();
  await eq(b, 'pozdrav() { echo "Ahoj $1"; }; pozdrav Jano', 'Ahoj Jano\n');
  await eq(b, 'function soucet { echo $(($1 + $2)); }; soucet 2 3', '5\n');
  await eq(b, 'f() { return 3; echo nikdy; }; f; echo $?', '3\n');
  await eq(b, 'x=venku; f() { local x=uvnitr; echo $x; }; f; echo $x', 'uvnitr\nvenku\n');
  await eq(b, 'fakt() { if [ $1 -le 1 ]; then echo 1; else local p=$(fakt $(($1 - 1))); echo $(($1 * p)); fi; }; fakt 5', '120\n');
  await eq(b, 'f() { echo a; }; f | tr a b', 'b\n');
  await eq(b, 'f() { false; }; f && echo ano || echo ne', 'ne\n');
  await eq(b, 'f() { f; }; f 2>&1 | head -1', 'bash: f: maximum function nesting level exceeded (200)\n');
});

test('skupiny a podshell', async () => {
  const b = await boot();
  await eq(b, '{ echo a; echo b; } | sort -r', 'b\na\n');
  await eq(b, 'x=1; (x=2; echo $x); echo $x', '2\n1\n');
  await eq(b, '(cd /tmp; pwd); pwd', '/tmp\n/home/student\n');
  await eq(b, '{ echo x; } > /tmp/g.txt; cat /tmp/g.txt', 'x\n');
  await eq(b, '(exit 3); echo $?', '3\n');
});

test('víceřádkový vstup a syntaktické chyby', async () => {
  const b = await boot();
  await eq(b, 'for i in 1 2\ndo\n  echo $i\ndone', '1\n2\n');
  const r = await b.run('echo ahoj; fi');
  assert.match(r.out, /syntax error near unexpected token `fi'/);
  assert.equal(r.st, 2);
  const r2 = await b.run('if true; then echo x');
  assert.match(r2.out, /unexpected end of file/);
  assert.equal(r2.st, 2);
});

test('skript se strukturami spuštěný jako soubor', async () => {
  const b = await boot();
  const script = [
    '#!/bin/bash', '# počítá soubory',
    'dir=${1:-/etc}', 'n=0',
    'for f in "$dir"/*; do', '  if [ -f "$f" ]; then n=$((n + 1)); fi', 'done',
    'if [ $n -gt 0 ]; then echo "souboru: ok"; else echo "nic"; fi',
    'usage() {', '  echo "pouziti: $0 [adresar]"', '}', 'usage',
  ].join('\n');
  await b.run(`printf '%s\\n' '${script.replace(/'/g, "'\\''")}' > /tmp/s.sh; chmod +x /tmp/s.sh`);
  await eq(b, '/tmp/s.sh', 'souboru: ok\npouziti: /tmp/s.sh [adresar]\n');
  await eq(b, '/tmp/s.sh /nonexistent', 'nic\npouziti: /tmp/s.sh [adresar]\n');
});

test('ukončení smyček přerušením a historie víceřádkového příkazu', async () => {
  const b = await boot();
  setTimeout(() => b.sh.interrupt(), 20);
  const r = await b.run('while true; do :; done');
  assert.equal(r.st, 130);
  await b.run('for i in 1 2\ndo\n  echo $i\ndone');
  assert.equal(b.sh.history.at(-1), 'for i in 1 2; do echo $i; done');
});
