// Služby (systemd jednotky) – jen simulace. Běžící služba = systémový proces s příznakem unit;
// "zapnuto při startu" (enabled) je v m.settings.units (ukládá se i exportuje), výchozí hodnota je v UNITS.

const H = 3600e3;

export const UNITS = {
  cron: { cmd: '/usr/sbin/cron -f', comm: 'cron', pid: 412, enabled: true, desc: { cs: 'Plánovač úloh (cron)', en: 'Regular background program processing daemon' } },
  ssh: { cmd: '/usr/sbin/sshd -D', comm: 'sshd', pid: 533, enabled: true, desc: { cs: 'Server OpenBSD Secure Shell', en: 'OpenBSD Secure Shell server' } },
  rsyslog: { cmd: '/usr/sbin/rsyslogd -n', comm: 'rsyslogd', pid: 702, enabled: true, desc: { cs: 'Systémový záznamník (logy)', en: 'System Logging Service' } },
  'systemd-journald': { cmd: '/lib/systemd/systemd-journald', comm: 'systemd-journal', pid: 601, enabled: true, desc: { cs: 'Žurnál systemd', en: 'Journal Service' } },
  'deep-thought': { cmd: '/usr/sbin/deep-thought --compute-answer', comm: 'deep-thought', pid: 42, enabled: true, desc: { cs: 'Výpočet odpovědi na život, vesmír a vůbec', en: 'Computes the Answer to Life, the Universe and Everything' } },
  apache2: { cmd: '/usr/sbin/apache2 -k start', comm: 'apache2', enabled: false, desc: { cs: 'Webový server Apache', en: 'The Apache HTTP Server' } },
};

export const unitName = n => (/\.service$/.test(n) ? n : n + '.service');
const base = n => n.replace(/\.service$/, '');
// "sshd" je přezdívka "ssh"
const ALIAS = { sshd: 'ssh', syslog: 'rsyslog', journald: 'systemd-journald', apache: 'apache2', httpd: 'apache2' };
export const findUnit = n => { const b = ALIAS[base(n)] ?? base(n); return Object.hasOwn(UNITS, b) ? b : null; };

export const isEnabled = (m, name) => (m.settings.units?.[name] ?? (UNITS[name].enabled ? 'enabled' : 'disabled')) === 'enabled';
export const procOf = (m, name) => m.procs.list().find(p => p.unit === name);
export const isActive = (m, name) => !!procOf(m, name);
export const setEnabled = (m, name, on) => { m.settings.units = { ...m.settings.units, [name]: on ? 'enabled' : 'disabled' }; };

export function startUnit(m, name, { boot = false } = {}) {
  if (procOf(m, name)) return procOf(m, name);
  const u = UNITS[name];
  const p = m.procs.add({ pid: u.pid ?? m.procs.next++, user: 'root', cmd: u.cmd, ppid: 1, unit: name, start: boot ? Date.now() - H : Date.now() });
  return p;
}
export function stopUnit(m, name) {
  const p = procOf(m, name);
  if (!p) return false;
  p.deliver(15);
  m.procs.end(p);
  return true;
}
// Po startu stroje: spustí zapnuté služby
export function bootUnits(m) {
  for (const name of Object.keys(UNITS)) if (isEnabled(m, name)) startUnit(m, name, { boot: true });
}

// Řádek do /var/log/syslog (jako systemd)
export function logLine(m, text, tag = 'systemd[1]') {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  try { m.fs.write('/var/log/syslog', `${ts} ${m.hostname} ${tag}: ${text}\n`, null, true); } catch { /* log nemusí existovat */ }
}
