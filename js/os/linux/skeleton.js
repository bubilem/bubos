// Výchozí obsah souborového systému po "instalaci" systému.
import { VFS } from '../../core/vfs.js';
import { hashPw } from '../../core/users.js';
import { COMMANDS, } from './profile.js';

const SHELL_ONLY = ['cd', 'export', 'unset', 'alias', 'unalias', 'exit', 'logout', 'history', 'source', '.', 'type', 'help', 'umask', 'read', 'break', 'continue', 'return', 'shift', 'local', ':', 'let', '[[', 'jobs', 'fg', 'bg', 'wait'];

export function buildFs(lang = 'cs') {
  const fs = new VFS();
  const S = (cs, en) => (lang === 'cs' ? cs : en);
  const dir = (p, mode = 0o755, uid = 0, gid = 0) => fs.mkdirp(p, { mode, uid, gid });
  const file = (p, data, mode = 0o644, uid = 0, gid = 0) => fs.put(p, data, { mode, uid, gid });

  for (const d of ['boot', 'dev', 'etc', 'home', 'media', 'mnt', 'opt', 'proc', 'run', 'srv', 'sys', 'usr/bin', 'usr/sbin',
    'usr/lib', 'usr/share', 'usr/local/bin', 'var/log', 'var/tmp', 'var/www/html']) dir('/' + d);
  dir('/tmp', 0o1777);
  dir('/var/spool/cron/crontabs', 0o730); // crontaby uživatelů (spravuje příkaz crontab)
  dir('/root', 0o700);
  fs.putLink('/bin', 'usr/bin');
  fs.putLink('/sbin', 'usr/sbin');
  fs.putLink('/lib', 'usr/lib');

  // Příkazy jako "binárky" v /usr/bin (zkopírovaný stub se chová jako příkaz)
  for (const c of COMMANDS) if (!SHELL_ONLY.includes(c)) file('/usr/bin/' + c, `#!bubos:${c}\n`, 0o755);

  // Uživatelé a skupiny
  file('/etc/passwd', [
    'root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
    'sys:x:3:3:sys:/dev:/usr/sbin/nologin', 'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
    'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin', 'student:x:1000:1000:Student,,,:/home/student:/bin/bash', ''].join('\n'));
  file('/etc/group', [
    'root:x:0:', 'daemon:x:1:', 'bin:x:2:', 'sys:x:3:', 'adm:x:4:', 'sudo:x:27:student', 'shadow:x:42:', 'www-data:x:33:',
    'users:x:100:student', 'nogroup:x:65534:', 'student:x:1000:', ''].join('\n'));
  file('/etc/shadow', [
    `root:${hashPw('root', 'root')}:19700:0:99999:7:::`, 'daemon:*:19700:0:99999:7:::', 'bin:*:19700:0:99999:7:::',
    'sys:*:19700:0:99999:7:::', 'www-data:*:19700:0:99999:7:::', 'nobody:*:19700:0:99999:7:::',
    `student:${hashPw('student', 'student')}:19700:0:99999:7:::`, ''].join('\n'), 0o640, 0, 42);

  file('/etc/hostname', 'bubos\n');
  file('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tbubos\n::1\t\tlocalhost ip6-localhost\n');
  file('/etc/os-release', 'PRETTY_NAME="BubOS 1.0 (Linux simulator)"\nNAME="BubOS"\nVERSION_ID="1.0"\nID=bubos\n');
  file('/etc/shells', '/bin/sh\n/bin/bash\n');
  file('/etc/issue', 'BubOS 1.0 \\n \\l\n');
  file('/etc/motd', S(
    'Vítejte v BubOS – výukovém simulátoru Linuxu.\nNapište "help" pro přehled příkazů, "man příkaz" pro manuál.\nKlávesa Tab doplňuje, šipky nahoru/dolů listují historií.\n',
    'Welcome to BubOS – a Linux teaching simulator.\nType "help" for the command list, "man command" for the manual.\nTab completes, up/down arrows browse the history.\n'));

  const bashrc = S('# ~/.bashrc – spouští se při přihlášení\n', '# ~/.bashrc – runs at login\n') +
    "alias ll='ls -l'\nalias la='ls -A'\nalias ..='cd ..'\nalias grep='grep --color=auto'\nexport EDITOR=nano\n";
  file('/etc/skel/.bashrc', bashrc);

  // /proc a /dev (jen ukázkové statické soubory)
  file('/proc/version', 'Linux version 6.8.0-bubos (bubos@build) (gcc 13.2) #1 SMP\n');
  file('/proc/cpuinfo', 'processor\t: 0\nmodel name\t: BubOS Virtual CPU @ 2.40GHz\ncpu cores\t: 1\n');
  file('/proc/meminfo', 'MemTotal:        2048000 kB\nMemFree:         1024000 kB\nMemAvailable:    1536000 kB\n');
  file('/proc/uptime', '3600.00 3500.00\n');
  file('/dev/null', '', 0o666); fs.stat('/dev/null').dev = 'null';

  // Logy
  const day = new Date().toISOString().slice(0, 10);
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';
  const ts = i => `${day}T0${(i % 9)}:${String(10 + (i * 7) % 50)}:${String((i * 13) % 60).padStart(2, '0')}`;
  file('/var/log/syslog', mk(30, i => `${ts(i)} bubos ${['kernel: eth0 link up', 'cron[412]: job started', 'systemd[1]: Started Daily apt activities.', 'sshd[533]: Server listening on 0.0.0.0 port 22.'][i % 4]}`), 0o640, 0, 4);
  file('/var/log/auth.log', mk(12, i => `${ts(i)} bubos ${i % 3 === 0 ? 'sshd[533]: Failed password for invalid user admin' : i % 3 === 1 ? 'sudo: student : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/ls' : 'login: session opened for user student'}`), 0o640, 0, 4);

  fs.put('/var/www/html/index.html', '<!DOCTYPE html>\n<html><body><h1>It works!</h1></body></html>\n');

  // Domovský adresář studenta
  const H = '/home/student', U = 1000;
  dir(H, 0o755, U, U);
  file(H + '/.bashrc', bashrc, 0o644, U, U);
  file(H + '/README.txt', S(
    'Vítej v BubOS!\n\nZkus tyto příkazy:\n  ls            – co je v adresáři\n  cd Documents  – přejdi do složky\n  cat pisen.txt – vypiš soubor\n  man ls        – manuál k příkazu\n  help          – přehled všech příkazů\n\nTab doplňuje názvy, šipky nahoru/dolů listují historií.\nPracuj bez obav – kdyby se něco pokazilo, dole na stránce je tlačítko Přeinstalovat.\nSvou práci si můžeš uložit do souboru (Export) a později načíst (Import).\n',
    'Welcome to BubOS!\n\nTry these commands:\n  ls            – what is in the directory\n  cd Documents  – enter a folder\n  cat poem.txt  – print a file\n  man ls        – manual for a command\n  help          – overview of all commands\n\nTab completes names, up/down arrows browse the history.\nExperiment freely – the Reinstall button at the top resets everything.\nYou can save your work to a file (Export) and load it later (Import).\n'),
    0o644, U, U);
  dir(H + '/Downloads', 0o755, U, U);
  dir(H + '/Documents', 0o755, U, U);
  file(H + '/Documents/' + S('pisen.txt', 'poem.txt'), S(
    'Byl pozdní večer – první máj –\nvečerní máj – byl lásky čas.\nHrdliččin zval ku lásce hlas,\nkde borový zaváněl háj.\nLákavě kvítí rozvité\nobjímal vlahý vánek.\n',
    'Shall I compare thee to a summer\'s day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer\'s lease hath all too short a date;\nSometime too hot the eye of heaven shines,\nAnd often is his gold complexion dimm\'d;\n'), 0o644, U, U);
  file(H + '/Documents/studenti.csv', 'jmeno;trida;body\nAda Lovelace;2.A;95\nAlan Turing;2.A;42\nGrace Hopper;2.B;84\nLinus Torvalds;3.C;92\nDennis Ritchie;3.C;78\nMargaret Hamilton;2.B;99\nTim Berners-Lee;3.C;64\nJohn Doe;2.B;0\n', 0o644, U, U);
  file(H + '/Documents/' + S('odpoved.txt', 'answer.txt'), S(
    'Otázka: Jaká je odpověď na život, vesmír a vůbec?\nOdpověď: 42\n\n(Spočítal ji počítač Hlubina myšlení za 7,5 milionu let.\nBohužel nikdo neví, jaká byla vlastně otázka.)\n',
    'Question: What is the answer to life, the universe and everything?\nAnswer: 42\n\n(Computed by the computer Deep Thought in 7.5 million years.\nUnfortunately nobody knows what the question actually was.)\n'), 0o644, U, U);
  const lv = ['INFO  server started', 'INFO  user ada logged in', 'WARN  disk usage at 85%', 'ERROR database connection failed', 'INFO  user linus logged in', 'ERROR timeout while reading /data/in.csv', 'INFO  backup finished', 'WARN  slow response (2.4 s)', 'INFO  user alan logged out', 'ERROR out of memory'];
  file(H + '/Documents/log.txt', mk(24, i => `${day} ${String(8 + (i >> 2)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:${String((i * 29) % 60).padStart(2, '0')} ${lv[(i * 7 + 3) % lv.length]}`), 0o644, U, U);
  dir(H + '/Documents/projekt/src', 0o755, U, U);
  dir(H + '/Documents/projekt/include', 0o755, U, U);
  dir(H + '/Documents/projekt/docs', 0o755, U, U);
  file(H + '/Documents/projekt/src/main.c', '#include <stdio.h>\n#include "util.h"\n\nint main(void) {\n    printf("Hello, BubOS!\\n");\n    return 0;\n}\n', 0o644, U, U);
  file(H + '/Documents/projekt/src/util.c', '#include "util.h"\n\nint add(int a, int b) { return a + b; }\n', 0o644, U, U);
  file(H + '/Documents/projekt/include/util.h', '#ifndef UTIL_H\n#define UTIL_H\nint add(int a, int b);\n#endif\n', 0o644, U, U);
  file(H + '/Documents/projekt/docs/README.md', '# Projekt\n\nUkázkový projekt pro cvičení s find, grep a tree.\n', 0o644, U, U);
  file(H + '/Documents/projekt/Makefile', 'all:\n\tgcc -Iinclude src/main.c src/util.c -o app\n', 0o644, U, U);
  file(H + '/Documents/projekt/.gitignore', 'app\n*.o\n', 0o644, U, U);

  file('/root/.bashrc', bashrc);
  return fs;
}
