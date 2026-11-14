import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const eq = async (b, line, out, st = 0) => {
  const r = await b.run(line);
  assert.equal(r.out, out, `výstup pro: ${line}`);
  assert.equal(r.st, st, `status pro: ${line}`);
};

test('printf a read', async () => {
  const b = await boot();
  await eq(b, 'printf "%s-%d\\n" ab 5', 'ab-5\n');
  await eq(b, 'printf "%s\\n" a b c', 'a\nb\nc\n');
  await eq(b, 'printf "%5.2f|%-4s|%03d\\n" 3.14159 x 7', ' 3.14|x   |007\n');
  await b.run('echo "a b c" > /tmp/r');
  await eq(b, 'read x y < /tmp/r; echo "$y/$x"', 'b c/a\n');
});

test('stat, du, df, cal', async () => {
  const b = await boot();
  await b.run('cd /tmp; echo hello > f; mkdir d; echo x > d/g');
  await eq(b, 'stat -c "%n %s %a %U" f', 'f 6 644 student\n');
  assert.match((await b.run('stat f')).out, /Size: 6/);
  assert.match((await b.run('du -s d')).out, /^\d+\s+d\n$/);
  assert.match((await b.run('du -sh d')).out, /^\S+\s+d\n$/);
  assert.match((await b.run('df -h')).out, /Filesystem/);
  const cal = (await b.run('cal 2 2024')).out;
  assert.match(cal, /2024/);
  assert.ok(cal.includes('29'));
});

test('diff', async () => {
  const b = await boot();
  await b.run('cd /tmp; printf "a\\nb\\nc\\n" > x; printf "a\\nB\\nc\\nd\\n" > y');
  await eq(b, 'diff x y', '2c2\n< b\n---\n> B\n3a4\n> d\n', 1);
  await eq(b, 'diff x x', '', 0);
  await eq(b, 'diff -q x y', 'Files x and y differ\n', 1);
  const u = (await b.run('diff -u x y')).out;
  assert.match(u, /^--- x/);
  assert.match(u, /@@ -1,3 \+1,4 @@/);
});

test('xargs', async () => {
  const b = await boot();
  await eq(b, 'echo a b c | xargs', 'a b c\n');
  await eq(b, 'printf "1\\n2\\n3\\n" | xargs -n 1 echo n', 'n 1\nn 2\nn 3\n');
  await eq(b, 'echo x y | xargs -I{} echo "<{}>"', '<x y>\n');
  await b.run('cd /tmp; touch p1 p2');
  await eq(b, 'find . -name "p?" | sort | xargs ls', './p1\n./p2\n');
  await eq(b, 'printf "" | xargs -r echo nic', '');
});

test('sed', async () => {
  const b = await boot();
  await eq(b, 'echo "ahoj svete" | sed "s/svete/svet/"', 'ahoj svet\n');
  await eq(b, 'echo aaa | sed "s/a/b/2"', 'aba\n');
  await eq(b, 'echo aaa | sed "s/a/b/g"', 'bbb\n');
  await eq(b, 'echo "jan novak" | sed -E "s/(\\w+) (\\w+)/\\2 \\1/"', 'novak jan\n');
  await eq(b, 'seq 5 | sed -n 2,3p', '2\n3\n');
  await eq(b, 'seq 5 | sed 2d', '1\n3\n4\n5\n');
  await eq(b, 'seq 5 | sed "/3/,\\$d"', '1\n2\n');
  await eq(b, 'seq 3 | sed -n "\\$p"', '3\n');
  await eq(b, 'seq 3 | sed "2i vloz"', '1\nvloz\n2\n3\n');
  await eq(b, 'seq 3 | sed "2a pridej"', '1\n2\npridej\n3\n');
  await eq(b, 'echo abc | sed "y/abc/xyz/"', 'xyz\n');
  await eq(b, 'seq 5 | sed 3q', '1\n2\n3\n');
  await eq(b, 'seq 3 | sed -e "s/1/a/" -e "s/2/b/"', 'a\nb\n3\n');
  await eq(b, 'seq 3 | sed "2!d"', '2\n');
  await b.run('cd /tmp; echo "foo bar" > s.txt');
  await eq(b, 'sed -i "s/foo/baz/" s.txt; cat s.txt', 'baz bar\n');
  await eq(b, 'echo x | sed "s/x/y"', 'sed: -e expression #1: unterminated `s\' command\n', 1);
});

test('awk', async () => {
  const b = await boot();
  await b.run('cd /tmp; printf "anna 10 a\\nboris 20 b\\ncyril 30 a\\n" > t');
  await eq(b, "awk '{print $1}' t", 'anna\nboris\ncyril\n');
  await eq(b, "awk '{s+=$2} END {print s}' t", '60\n');
  await eq(b, "awk '$2>15 {print $1, $2*2}' t", 'boris 40\ncyril 60\n');
  await eq(b, "awk -F: '{print $2}' /etc/passwd | head -1", 'x\n');
  await eq(b, "awk '/boris/' t", 'boris 20 b\n');
  await eq(b, "awk '{c[$3]++} END {for (k in c) print k, c[k]}' t | sort", 'a 2\nb 1\n');
  await eq(b, "awk 'BEGIN {printf \"%d-%s\\n\", 5, \"x\"}'", '5-x\n');
  await eq(b, "awk 'NR==2 {print NF, length($1)}' t", '3 5\n');
  await eq(b, "awk '{print toupper(substr($1,1,1)) substr($1,2)}' t", 'Anna\nBoris\nCyril\n');
  await eq(b, "awk -v p=2 '$2 > p*5 {n++} END {print n+0}' t", '2\n');
  await eq(b, "awk '{gsub(/a/,\"A\"); print}' t | head -1", 'Anna 10 A\n'.replace('Anna', 'AnnA'));
  await eq(b, "awk 'NR>1 && $2<30 {print; next} {print \"-\"}' t", '-\nboris 20 b\n-\n');
});


test('skupiny, uživatelé, chgrp a umask', async () => {
  const b = await boot({ user: 'root' });
  await eq(b, 'groupadd tym', '');
  await eq(b, 'groupadd tym', "groupadd: group 'tym' already exists\n", 9);
  await eq(b, 'useradd -m jana', '');
  await eq(b, 'usermod -aG tym jana; grep ^tym /etc/group | cut -d: -f4', 'jana\n');
  await eq(b, 'usermod -s /bin/sh jana; grep jana /etc/passwd | cut -d: -f7', '/bin/sh\n');
  await eq(b, 'cd /tmp; touch f; chgrp tym f; stat -c %G f', 'tym\n');
  await eq(b, 'userdel -r jana; ls /home | grep -c jana', '0\n', 1);
  await eq(b, 'groupdel tym; grep -c tym /etc/group', '0\n', 1);
  await eq(b, 'umask 077; touch g; stat -c %a g', '600\n');
  await eq(b, 'umask', '0077\n');
  await eq(b, 'umask -S', 'u=rwx,g=,o=\n');
});
