// Blok C: procesy a služby – úlohy (jobs/fg/bg), signály, Ctrl+Z.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

test('příkaz na pozadí: &, jobs, $!, wait', async () => {
  const b = await boot();
  let r = await b.run('sleep 0.2 &');
  assert.match(r.out, /^\[1\] \d+\n$/);
  const pid = r.out.match(/\] (\d+)/)[1];
  r = await b.run('echo $!');
  assert.equal(r.out.trim(), pid);
  r = await b.run('jobs');
  assert.match(r.out, /^\[1\]\+  Running\s+sleep 0\.2 &\n$/);
  r = await b.run('wait');
  assert.equal(r.st, 0);
  r = await b.run('jobs');
  assert.equal(r.out, '');
});

test('kill %1 ukončí úlohu na pozadí a ohlásí Terminated', async () => {
  const b = await boot();
  await b.run('sleep 30 &');
  await b.run('kill %1');
  await wait(20);
  assert.match(b.tty.buf, /\[1\]\+  Terminated\s+sleep 30/);
  assert.equal((await b.run('jobs')).out, '');
});

test('Ctrl+Z pozastaví příkaz, bg ho pustí na pozadí, fg zpět', async () => {
  const b = await boot();
  const running = b.run('sleep 30');
  await wait(20);
  assert.ok(b.sh.suspend());
  const r = await running;
  assert.equal(r.st, 148);
  assert.match(r.out, /\[1\]\+  Stopped\s+sleep 30/);
  assert.match((await b.run('ps')).out, /sleep/);
  let o = await b.run('jobs');
  assert.match(o.out, /Stopped/);
  o = await b.run('bg');
  assert.match(o.out, /^\[1\]\+ sleep 30 &\n$/);
  assert.match((await b.run('jobs')).out, /Running/);
  // fg: čeká na úlohu; kill ji ukončí
  const fg = b.run('fg');
  await wait(20);
  await b.sh.interrupt();
  const res = await fg;
  assert.equal(res.st, 130);
  assert.equal((await b.run('jobs')).out, '');
});

test('kill -STOP / -CONT mění stav procesu; ps ukáže T', async () => {
  const b = await boot();
  const r = await b.run('sleep 30 &');
  const pid = r.out.match(/\] (\d+)/)[1];
  await b.run(`kill -STOP ${pid}`);
  assert.match((await b.run('jobs')).out, /Stopped/);
  assert.match((await b.run('ps u')).out, new RegExp(`${pid}[^\\n]* T `));
  await b.run(`kill -CONT ${pid}`);
  assert.match((await b.run('jobs')).out, /Running/);
  await b.run(`kill -9 ${pid}`);
  await wait(20);
  assert.match(b.tty.buf, /Killed/);
});

test('kill: signály, chyby a oprávnění', async () => {
  const b = await boot();
  assert.match((await b.run('kill -l')).out, /15\) SIGTERM/);
  assert.equal((await b.run('kill -l 15')).out, 'TERM\n');
  assert.equal((await b.run('kill -l TERM')).out, '15\n');
  assert.match((await b.run('kill -FOO 1')).out, /invalid signal/);
  assert.match((await b.run('kill 999999')).out, /No such process/);
  assert.match((await b.run('kill 1')).out, /not permitted/);
  assert.match((await b.run('kill %5')).out, /no such job/);
  // cizí proces student nesmí
  assert.match((await b.run('kill 412')).out, /not permitted/);
});

test('shell sám ignoruje kill -TERM, ale ne -KILL se nedotkne cizích', async () => {
  const b = await boot();
  const r = await b.run('echo $$');
  const me = r.out.trim();
  assert.equal((await b.run(`kill ${me}`)).st, 0);
  assert.equal((await b.run('echo ještě žiju')).out, 'ještě žiju\n');
});

test('fg bez úlohy hlásí chybu', async () => {
  const b = await boot();
  assert.match((await b.run('fg')).out, /no such job/);
  assert.match((await b.run('bg')).out, /no such job/);
});

// --- služby ---
test('služby: status, stop/start jen jako správce, ps odpovídá', async () => {
  const s = await boot();
  assert.match((await s.run('systemctl status cron')).out, /active \(running\)[\s\S]*Main PID: 412 \(cron\)/);
  assert.match((await s.run('ps -ef')).out, /\/usr\/sbin\/cron -f/);
  const denied = await s.run('systemctl stop cron');
  assert.equal(denied.st, 1);
  assert.match(denied.out, /Interactive authentication required/);
  const r = await boot({ user: 'root' });
  assert.equal((await r.run('systemctl stop cron')).st, 0);
  assert.equal((await r.run('systemctl is-active cron')).out, 'inactive\n');
  assert.equal((await r.run('systemctl is-active cron')).st, 3);
  assert.doesNotMatch((await r.run('ps -ef')).out, /cron -f/);
  assert.match((await r.run('systemctl status cron')).out, /inactive \(dead\)/);
  await r.run('systemctl start cron');
  assert.equal((await r.run('systemctl is-active cron')).out, 'active\n');
  assert.match(r.m.fs.read('/var/log/syslog', null), /Stopped cron\.service[\s\S]*Started cron\.service/);
});

test('služby: enable/disable, apache2 ve výchozím stavu neběží, --now, neznámá služba', async () => {
  const r = await boot({ user: 'root' });
  assert.equal((await r.run('systemctl is-active apache2')).out, 'inactive\n');
  assert.equal((await r.run('systemctl is-enabled apache2')).out, 'disabled\n');
  await r.run('systemctl enable --now apache2');
  assert.equal((await r.run('systemctl is-active apache2')).out, 'active\n');
  assert.equal((await r.run('systemctl is-enabled apache2')).out, 'enabled\n');
  assert.equal(r.m.settings.units.apache2, 'enabled');
  await r.run('systemctl disable --now apache2');
  assert.equal((await r.run('systemctl is-active apache2')).out, 'inactive\n');
  const bad = await r.run('systemctl start nesmysl');
  assert.equal(bad.st, 5);
  assert.match(bad.out, /nesmysl\.service not found/);
  assert.match((await r.run('systemctl list-units')).out, /cron\.service[\s\S]*loaded units listed/);
  assert.match((await r.run('service --status-all')).out, /\[ \+ \] {2}cron[\s\S]*\[ - \] {2}apache2/);
  await r.run('service apache2 start');
  assert.equal((await r.run('systemctl is-active apache2')).out, 'active\n');
});

test('kill služby ji zastaví; vypnutá služba po novém startu stroje nenaběhne', async () => {
  const { Machine } = await import('../js/core/machine.js');
  const linux = (await import('../js/os/linux/profile.js')).default;
  const r = await boot({ user: 'root' });
  await r.run('systemctl disable cron');
  const m2 = Machine.fromState(linux, JSON.parse(JSON.stringify(r.m.snapshot())));
  assert.equal(m2.procs.list().some(p => p.unit === 'cron'), false);
  assert.equal(m2.procs.list().some(p => p.unit === 'ssh'), true);
  await r.run('kill 533');
  assert.equal((await r.run('systemctl is-active ssh')).out, 'inactive\n');
  assert.equal((await r.run('systemctl is-active sshd')).out, 'inactive\n'); // sshd = přezdívka ssh
});

// --- /proc ---
test('/proc je dynamický: procesy přibývají a mizí, uptime a status', async () => {
  const b = await boot();
  assert.match((await b.run('cat /proc/412/cmdline')).out, /cron/);
  assert.match((await b.run('cat /proc/uptime')).out, /^\d+\.\d\d \d+\.\d\d\n$/);
  assert.match((await b.run('cat /proc/meminfo')).out, /MemTotal:\s+2048000 kB/);
  const pid = (await b.run('sleep 30 &')).out.match(/\] (\d+)/)[1];
  const status = (await b.run(`cat /proc/${pid}/status`)).out;
  assert.match(status, /^Name:\tsleep\nState:\tS \(sleeping\)\n/);
  assert.match(status, new RegExp(`Pid:\\t${pid}\\nPPid:\\t\\d+\\nUid:\\t1000\\t`));
  await b.run(`kill -STOP ${pid}`);
  assert.match((await b.run(`cat /proc/${pid}/status`)).out, /State:\tT \(stopped\)/);
  await b.run(`kill -9 ${pid}`);
  await wait(20);
  assert.match((await b.run(`cat /proc/${pid}/status`)).out, /No such file/);
  assert.match((await b.run('ls /proc')).out, /\b412\b/);
});

// --- top ---
test('top -b -n 1 vypíše hlavičku a procesy; zastavené se počítají', async () => {
  const b = await boot();
  const out = (await b.run('top -b -n 1')).out;
  assert.match(out, /^top - \d\d:\d\d:\d\d up .*load average: [\d.]+, [\d.]+, [\d.]+\nTasks:/);
  assert.match(out, /PID USER[\s\S]*COMMAND[\s\S]*\/usr\/sbin\/cron -f/);
  assert.doesNotMatch(out, /\x1b/);
  assert.match((await b.run('top -x')).out, /unknown option/);
  assert.match((await b.run('top -b -n x')).out, /bad iterations/);
});

// --- cron ---
test('crontab: instalace ze souboru, -l, -r a chyby', async () => {
  const { parseCrontab, matches } = await import('../js/os/linux/cron.js');
  const b = await boot();
  assert.match((await b.run('crontab -l')).out, /no crontab for student/);
  await b.run("printf '* * * * * echo ahoj >> ~/out.txt\n' > c.txt");
  assert.equal((await b.run('crontab c.txt')).st, 0);
  assert.equal((await b.run('crontab -l')).out, '* * * * * echo ahoj >> ~/out.txt\n');
  assert.equal((await b.run('crontab -r')).st, 0);
  assert.match((await b.run('crontab -l')).out, /no crontab/);
  await b.run("printf '61 * * * * echo\n' > zle.txt");
  const bad = await b.run('crontab zle.txt');
  assert.equal(bad.st, 1);
  assert.match(bad.out, /"zle\.txt":1: bad minute[\s\S]*can't install/);
  // parser a shoda s časem
  const e = parseCrontab('# komentář\nMAILTO=x\n*/15 9-17 * * 1-5 echo a b\n@daily echo d\n').entries;
  assert.equal(e.length, 2);
  assert.equal(e[0].cmd, 'echo a b');
  assert.equal(e[1].cmd, 'echo d');
  assert.ok(matches(e[0], new Date(2026, 10, 23, 9, 30)));  // pondělí 9:30
  assert.ok(!matches(e[0], new Date(2026, 10, 23, 9, 31)));
  assert.ok(!matches(e[0], new Date(2026, 10, 22, 9, 30))); // neděle
  assert.ok(matches(e[1], new Date(2026, 10, 23, 0, 0)));
  assert.equal(parseCrontab('1 2 3 4 5\n').errors.length, 1);
  assert.equal(parseCrontab('* * * 13 * x\n').errors[0].msg, 'bad month');
  assert.equal(parseCrontab('0 0 * jan mon echo\n').errors.length, 0);
});

test('cron spustí úlohu jen když běží služba cron a zapíše CRON do syslogu', async () => {
  const { cronTick } = await import('../js/os/linux/cron.js');
  const b = await boot();
  await b.run("printf '30 9 * * * echo ahoj >> ~/out.txt\n' > c.txt");
  await b.run('crontab c.txt');
  const when = new Date(2026, 10, 23, 9, 30);
  assert.equal(await cronTick(b.m, new Date(2026, 10, 23, 9, 31)), 0);
  assert.equal(await cronTick(b.m, when), 1);
  assert.equal((await b.run('cat ~/out.txt')).out, 'ahoj\n');
  assert.match(b.m.fs.read('/var/log/syslog', null), /CRON\[\d+\]: \(student\) CMD \(echo ahoj >> ~\/out\.txt\)/);
  const r = await boot({ user: 'root' });
  await r.run('systemctl stop cron');
  r.m.fs.put('/var/spool/cron/crontabs/root', '* * * * * touch /tmp/x\n');
  assert.equal(await cronTick(r.m, when), 0); // cron neběží
  await r.run('systemctl start cron');
  assert.equal(await cronTick(r.m, when), 1);
  assert.ok(r.m.fs.exists('/tmp/x'));
});
