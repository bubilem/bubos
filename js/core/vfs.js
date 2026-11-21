// Virtuální souborový systém (bez závislosti na DOM).
// Uzly jsou čisté JSON objekty, takže se dají snadno uložit/exportovat.
// Cesty předávané do metod musí být absolutní a normalizované (viz resolvePath).

export class FsError extends Error {
  constructor(code, path) { super(code); this.code = code; this.path = path; }
}

export const R = 4, W = 2, X = 1;
const MAX_FILE = 1 << 20;

export const split = p => p.split('/').filter(Boolean);

export function resolvePath(cwd, p) {
  const parts = p.startsWith('/') ? [] : split(cwd);
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') parts.pop(); else parts.push(s);
  }
  return '/' + parts.join('/');
}
export const dirname = p => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
export const basename = p => p.slice(p.lastIndexOf('/') + 1);

// Má uživatel všechna práva z masky bits (R/W/X) k uzlu?
export function can(n, u, bits) {
  if (!u) return true;
  if (u.uid === 0) return !(bits & X) || n.type === 'dir' || !!(n.mode & 0o111);
  const sh = n.uid === u.uid ? 6 : (n.gid === u.gid || u.gids?.includes(n.gid)) ? 3 : 0;
  return ((n.mode >> sh) & bits) === bits;
}

export const newDir = (mode = 0o755, uid = 0, gid = 0) => ({ type: 'dir', mode, uid, gid, mtime: Date.now(), children: {} });
export const newFile = (data = '', mode = 0o644, uid = 0, gid = 0) => ({ type: 'file', mode, uid, gid, mtime: Date.now(), data });

export function modeString(n) {
  const a = [n.type === 'dir' ? 'd' : n.type === 'link' ? 'l' : n.dev ? 'c' : '-'];
  for (let sh = 6; sh >= 0; sh -= 3) {
    const b = (n.mode >> sh) & 7;
    a.push(b & 4 ? 'r' : '-', b & 2 ? 'w' : '-', b & 1 ? 'x' : '-');
  }
  if (n.mode & 0o4000) a[3] = a[3] === 'x' ? 's' : 'S';
  if (n.mode & 0o2000) a[6] = a[6] === 'x' ? 's' : 'S';
  if (n.mode & 0o1000) a[9] = a[9] === 'x' ? 't' : 'T';
  return a.join('');
}

// Kontrola struktury při importu (soubor je jen data, ničemu nevěříme)
export function validateNode(n, depth = 0) {
  const bad = () => { throw new Error('invalid filesystem'); };
  if (!n || typeof n !== 'object' || depth > 64) bad();
  if (!['dir', 'file', 'link'].includes(n.type)) bad();
  for (const k of ['mode', 'uid', 'gid', 'mtime']) if (!Number.isFinite(n[k])) bad();
  if (n.type === 'file' && typeof n.data !== 'string') bad();
  if (n.type === 'link' && typeof n.target !== 'string') bad();
  if (n.type === 'dir') {
    if (!n.children || typeof n.children !== 'object') bad();
    for (const [k, c] of Object.entries(n.children)) {
      if (!k || k.includes('/') || k === '__proto__') bad();
      validateNode(c, depth + 1);
    }
  }
}

export class VFS {
  constructor(root = newDir()) { this.root = root; this.umask = 0o022; this.onChange = null; this.gen = null; }
  _changed() { this.onChange?.(); }
  child(d, name) { return Object.hasOwn(d.children, name) ? d.children[name] : undefined; }

  // Najde uzel. user=null → bez kontroly práv. follow=false → neprochází poslední symlink.
  stat(path, user = null, follow = true, depth = 0) {
    const parts = split(path);
    let n = this.root;
    for (let i = 0; i < parts.length; i++) {
      if (n.type !== 'dir') throw new FsError('ENOTDIR', path);
      if (!can(n, user, X)) throw new FsError('EACCES', path);
      const c = this.child(n, parts[i]);
      if (!c) throw new FsError('ENOENT', path);
      if (c.type === 'link' && (follow || i < parts.length - 1)) {
        if (depth > 20) throw new FsError('ELOOP', path);
        const target = resolvePath('/' + parts.slice(0, i).join('/'), c.target);
        try { return this.stat(target + '/' + parts.slice(i + 1).join('/'), user, follow, depth + 1); }
        catch (e) { if (e instanceof FsError) e.path = path; throw e; }
      }
      n = c;
    }
    return n;
  }
  lstat(path, user) { return this.stat(path, user, false); }
  exists(path, user = null) { try { this.stat(path, user); return true; } catch { return false; } }

  _parent(path, user) {
    const name = basename(path);
    if (!name) throw new FsError('EEXIST', path);
    if (name === '__proto__') throw new FsError('EINVAL', path);
    const dir = this.stat(dirname(path), user);
    if (dir.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!can(dir, user, W | X)) throw new FsError('EACCES', path);
    return { dir, name };
  }
  _sticky(dir, c, user) {
    if ((dir.mode & 0o1000) && user && user.uid !== 0 && user.uid !== c.uid && user.uid !== dir.uid) throw new FsError('EPERM');
  }
  _limit(data, path) { if (data.length > MAX_FILE) throw new FsError('ENOSPC', path); }

  readdir(path, user) {
    const n = this.stat(path, user);
    if (n.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!can(n, user, R)) throw new FsError('EACCES', path);
    return Object.keys(n.children).sort();
  }
  read(path, user) {
    const n = this.stat(path, user);
    if (n.type === 'dir') throw new FsError('EISDIR', path);
    if (!can(n, user, R)) throw new FsError('EACCES', path);
    if (n.gen) return this.gen?.(n.gen) ?? ''; // obsah generovaný za běhu (/proc)
    return n.dev ? '' : n.data;
  }
  write(path, data, user, append = false) {
    let n = null;
    try { n = this.stat(path, user); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (n) {
      if (n.type === 'dir') throw new FsError('EISDIR', path);
      if (!can(n, user, W)) throw new FsError('EACCES', path);
      if (n.dev) return;
      const nd = append ? n.data + data : data;
      this._limit(nd, path);
      n.data = nd; n.mtime = Date.now();
    } else {
      const { dir, name } = this._parent(path, user);
      this._limit(data, path);
      dir.children[name] = newFile(data, 0o666 & ~this.umask, user?.uid ?? 0, user?.gid ?? 0);
      dir.mtime = Date.now();
    }
    this._changed();
  }
  touch(path, user) {
    let n = null;
    try { n = this.stat(path, user); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!n) return this.write(path, '', user);
    if (!can(n, user, W)) throw new FsError('EACCES', path);
    n.mtime = Date.now();
    this._changed();
  }
  mkdir(path, user, mode = 0o777 & ~this.umask) {
    const { dir, name } = this._parent(path, user);
    if (this.child(dir, name)) throw new FsError('EEXIST', path);
    dir.children[name] = newDir(mode, user?.uid ?? 0, user?.gid ?? 0);
    dir.mtime = Date.now();
    this._changed();
  }
  unlink(path, user) {
    const { dir, name } = this._parent(path, user);
    const c = this.child(dir, name);
    if (!c) throw new FsError('ENOENT', path);
    if (c.type === 'dir') throw new FsError('EISDIR', path);
    this._sticky(dir, c, user);
    delete dir.children[name];
    dir.mtime = Date.now();
    this._changed();
  }
  rmdir(path, user) {
    const { dir, name } = this._parent(path, user);
    const c = this.child(dir, name);
    if (!c) throw new FsError('ENOENT', path);
    if (c.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (Object.keys(c.children).length) throw new FsError('ENOTEMPTY', path);
    this._sticky(dir, c, user);
    delete dir.children[name];
    dir.mtime = Date.now();
    this._changed();
  }
  rename(from, to, user) {
    const a = this._parent(from, user), b = this._parent(to, user);
    const node = this.child(a.dir, a.name);
    if (!node) throw new FsError('ENOENT', from);
    if (to === from) return;
    if (to.startsWith(from + '/')) throw new FsError('EINVAL', to);
    const ex = this.child(b.dir, b.name);
    if (ex) {
      if (ex.type === 'dir' && node.type !== 'dir') throw new FsError('EISDIR', to);
      if (node.type === 'dir' && ex.type !== 'dir') throw new FsError('ENOTDIR', to);
      if (ex.type === 'dir' && Object.keys(ex.children).length) throw new FsError('ENOTEMPTY', to);
      this._sticky(b.dir, ex, user);
    }
    this._sticky(a.dir, node, user);
    delete a.dir.children[a.name];
    b.dir.children[b.name] = node;
    a.dir.mtime = b.dir.mtime = Date.now();
    this._changed();
  }
  chmod(path, mode, user) {
    const n = this.stat(path, user);
    if (user && user.uid !== 0 && user.uid !== n.uid) throw new FsError('EPERM', path);
    n.mode = mode & 0o7777;
    this._changed();
  }
  chown(path, uid, gid, user) {
    const n = this.stat(path, user);
    if (user && user.uid !== 0) throw new FsError('EPERM', path);
    if (uid != null) n.uid = uid;
    if (gid != null) n.gid = gid;
    this._changed();
  }
  symlink(target, path, user) {
    const { dir, name } = this._parent(path, user);
    if (this.child(dir, name)) throw new FsError('EEXIST', path);
    dir.children[name] = { type: 'link', mode: 0o777, uid: user?.uid ?? 0, gid: user?.gid ?? 0, mtime: Date.now(), target };
    this._changed();
  }

  // --- Inicializace (bez kontroly práv) ---
  mkdirp(path, { mode = 0o755, uid = 0, gid = 0 } = {}) {
    let n = this.root;
    for (const p of split(path)) {
      let c = this.child(n, p);
      if (!c) c = n.children[p] = newDir(mode, uid, gid);
      n = c;
    }
    return n;
  }
  put(path, data, { mode = 0o644, uid = 0, gid = 0 } = {}) {
    this.mkdirp(dirname(path));
    const dir = this.stat(dirname(path));
    dir.children[basename(path)] = newFile(data, mode, uid, gid);
  }
  putLink(path, target) {
    this.mkdirp(dirname(path));
    this.stat(dirname(path)).children[basename(path)] = { type: 'link', mode: 0o777, uid: 0, gid: 0, mtime: Date.now(), target };
  }
}
