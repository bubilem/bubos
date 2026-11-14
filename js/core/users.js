// Uživatelé a skupiny uložené (jako ve skutečném Linuxu) v /etc/passwd, /etc/group, /etc/shadow.
// Hesla se hashují jen symbolicky – jde o výukovou simulaci, ne o bezpečnost.

const PASSWD = '/etc/passwd', GROUP = '/etc/group', SHADOW = '/etc/shadow';

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const hashPw = (name, pw) => (pw === '' ? '' : '$b$' + cyrb53(name + ':' + pw).toString(36));

const rd = (fs, p) => { try { return fs.read(p, null); } catch { return ''; } };
const append = (fs, p, s) => fs.write(p, s, null, true);

export function getUsers(fs) {
  return rd(fs, PASSWD).split('\n').filter(Boolean).map(l => {
    const [name, , uid, gid, gecos, home, shell] = l.split(':');
    return { name, uid: +uid, gid: +gid, gecos, home, shell };
  });
}
export function getGroups(fs) {
  return rd(fs, GROUP).split('\n').filter(Boolean).map(l => {
    const [name, , gid, members] = l.split(':');
    return { name, gid: +gid, members: members ? members.split(',') : [] };
  });
}
export const findUser = (fs, who) => getUsers(fs).find(u => u.name === who || String(u.uid) === String(who));

// Uživatel jako objekt relace (včetně všech skupin)
export function sessionUser(fs, who) {
  const u = findUser(fs, who);
  if (!u) return null;
  const gids = getGroups(fs).filter(g => g.gid === u.gid || g.members.includes(u.name)).map(g => g.gid);
  return { ...u, gids };
}

const shadowLines = fs => rd(fs, SHADOW).split('\n').filter(Boolean).map(l => l.split(':'));
const writeShadow = (fs, rows) => fs.write(SHADOW, rows.map(r => r.join(':')).join('\n') + '\n', null);

export function needsPassword(fs, name) {
  const row = shadowLines(fs).find(r => r[0] === name);
  return !!row && row[1] !== '';
}
export function checkPassword(fs, name, pw) {
  const row = shadowLines(fs).find(r => r[0] === name);
  if (!row) return false;
  if (row[1] === '') return true;
  if (row[1][0] === '*' || row[1][0] === '!') return false;
  return row[1] === hashPw(name, pw);
}
export function setPassword(fs, name, pw) {
  const rows = shadowLines(fs);
  const row = rows.find(r => r[0] === name);
  if (row) row[1] = hashPw(name, pw); else rows.push([name, hashPw(name, pw), '']);
  writeShadow(fs, rows);
}

export function addToGroup(fs, user, group) {
  const lines = rd(fs, GROUP).split('\n').filter(Boolean);
  let found = false;
  const out = lines.map(l => {
    const p = l.split(':');
    if (p[0] !== group) return l;
    found = true;
    const m = p[3] ? p[3].split(',') : [];
    if (!m.includes(user)) m.push(user);
    p[3] = m.join(',');
    return p.join(':');
  });
  if (!found) throw new Error('group does not exist');
  fs.write(GROUP, out.join('\n') + '\n', null);
}

export function addUser(fs, { name, shell = '/bin/bash', home = '/home/' + name, createHome = false, groups = [], gecos = '' }) {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(name)) throw new Error('invalid user name');
  if (findUser(fs, name)) throw new Error('user exists');
  const users = getUsers(fs), grp = getGroups(fs);
  if (grp.some(g => g.name === name)) throw new Error('group exists');
  const uid = Math.max(999, ...users.filter(u => u.uid < 60000).map(u => u.uid)) + 1;
  const gid = Math.max(999, ...grp.filter(g => g.gid < 60000).map(g => g.gid)) + 1;
  append(fs, PASSWD, `${name}:x:${uid}:${gid}:${gecos}:${home}:${shell}\n`);
  append(fs, GROUP, `${name}:x:${gid}:\n`);
  append(fs, SHADOW, `${name}:!:\n`);
  for (const g of groups) addToGroup(fs, name, g);
  if (createHome) {
    fs.mkdirp(home, { mode: 0o755, uid, gid });
    try {
      for (const nm of fs.readdir('/etc/skel', null)) {
        const n = fs.stat('/etc/skel/' + nm);
        if (n.type === 'file') fs.put(home + '/' + nm, n.data, { mode: n.mode, uid, gid });
      }
    } catch { /* bez /etc/skel */ }
  }
  return { uid, gid };
}

// --- správa skupin a uživatelů (groupadd, groupdel, usermod, userdel) ---
const lines = (fs, p) => rd(fs, p).split('\n').filter(Boolean);
const store = (fs, p, ls) => fs.write(p, ls.length ? ls.join('\n') + '\n' : '', null);
const NAME = /^[a-z_][a-z0-9_-]{0,31}$/;

export function addGroup(fs, name, gid) {
  if (!NAME.test(name)) throw new Error('invalid group name');
  const grp = getGroups(fs);
  if (grp.some(g => g.name === name)) throw new Error('group exists');
  if (gid == null) gid = Math.max(999, ...grp.filter(g => g.gid < 60000).map(g => g.gid)) + 1;
  else if (grp.some(g => g.gid === gid)) throw new Error('gid exists');
  append(fs, GROUP, `${name}:x:${gid}:\n`);
  return gid;
}
export function delGroup(fs, name) {
  const g = getGroups(fs).find(x => x.name === name);
  if (!g) throw new Error('group does not exist');
  const owner = getUsers(fs).find(u => u.gid === g.gid);
  if (owner) throw new Error('primary group of ' + owner.name);
  store(fs, GROUP, lines(fs, GROUP).filter(l => l.split(':')[0] !== name));
}
export function delUser(fs, name) {
  const u = findUser(fs, name);
  if (!u) throw new Error('user does not exist');
  store(fs, PASSWD, lines(fs, PASSWD).filter(l => l.split(':')[0] !== name));
  store(fs, SHADOW, lines(fs, SHADOW).filter(l => l.split(':')[0] !== name));
  store(fs, GROUP, lines(fs, GROUP).map(l => {
    const p = l.split(':');
    p[3] = (p[3] ? p[3].split(',') : []).filter(x => x !== name).join(',');
    return p.join(':');
  }).filter(l => { const p = l.split(':'); return !(p[0] === name && +p[2] === u.gid && !p[3]); })); // soukromá skupina zaniká s uživatelem
  return u;
}
// patch: { shell, home, gecos, name, groups: [...], append, lock: true|false }
export function modUser(fs, name, patch) {
  const u = findUser(fs, name);
  if (!u) throw new Error('user does not exist');
  const newName = patch.name ?? name;
  if (patch.name) {
    if (!NAME.test(newName)) throw new Error('invalid user name');
    if (findUser(fs, newName)) throw new Error('user exists');
  }
  if (patch.groups) {
    const all = getGroups(fs);
    for (const g of patch.groups) if (!all.some(x => x.name === g)) throw new Error('group does not exist: ' + g);
  }
  store(fs, PASSWD, lines(fs, PASSWD).map(l => {
    const p = l.split(':');
    if (p[0] !== name) return l;
    p[0] = newName;
    if (patch.gecos !== undefined) p[4] = patch.gecos;
    if (patch.home !== undefined) p[5] = patch.home;
    if (patch.shell !== undefined) p[6] = patch.shell;
    return p.join(':');
  }));
  store(fs, SHADOW, lines(fs, SHADOW).map(l => {
    const p = l.split(':');
    if (p[0] !== name) return l;
    p[0] = newName;
    if (patch.lock === true && !p[1].startsWith('!')) p[1] = '!' + p[1];
    if (patch.lock === false) p[1] = p[1].replace(/^!/, '');
    return p.join(':');
  }));
  store(fs, GROUP, lines(fs, GROUP).map(l => {
    const p = l.split(':');
    let m = p[3] ? p[3].split(',') : [];
    if (patch.name) m = m.map(x => (x === name ? newName : x));
    if (patch.groups) {
      const was = m.includes(newName);
      m = m.filter(x => x !== newName);
      if (patch.groups.includes(p[0]) || (patch.append && was)) m.push(newName);
    }
    p[3] = [...new Set(m)].join(',');
    return p.join(':');
  }));
}
