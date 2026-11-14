// Úkoly kampaně: kontroly cílů, hvězdy, nápovědy a postup žáka. Bez DOM, testovatelné v Node.
// Úkol je JSON (viz js/os/linux/missions/); stav je cíl – cíle se ověřují podle výsledného stavu souborového systému,
// příkazy (ran, pipeline…) se používají hlavně u bonusu.
import { resolvePath } from './vfs.js';
import { getUsers, getGroups, addUser, setPassword } from './users.js';

export const HOME = '/home/student';
export const CHECK_TYPES = ['all', 'any', 'not', 'fileExists', 'fileMissing', 'dirExists', 'isFile', 'fileContains', 'fileMatches',
  'fileEquals', 'fileLines', 'mode', 'executable', 'owner', 'symlink', 'userExists', 'inGroup', 'cwd', 'ran', 'line', 'pipeline',
  'redirect', 'output'];

// --- příkazy na řádku ---
export function commandsOf(line) {
  const out = [];
  for (const seg of line.split(/\|\||&&|[|;&\n`()]/)) {
    const w = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < w.length && /^\w+=/.test(w[i])) i++;
    if (i >= w.length) continue;
    out.push(w[i].split('/').pop());
    if (w[i] === 'sudo') {
      let j = i + 1;
      while (j < w.length && w[j].startsWith('-')) j += /^-[ug]$/.test(w[j]) ? 2 : 1; // volby sudo; -u/-g mají hodnotu
      if (j < w.length) out.push(w[j].split('/').pop());
    }
  }
  return out;
}

const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const P = (env, p) => resolvePath(env.home, p.replace(/^~(?=\/|$)/, env.home));

// Vyhodnotí jednu kontrolu: objekt s jediným klíčem (typ) a hodnotou (parametry)
export function evalCheck(c, env) {
  const [type] = Object.keys(c), a = c[type];
  const node = p => { try { return env.fs.lstat(P(env, p), null); } catch { return null; } };
  const text = p => { try { return env.fs.read(P(env, p), null); } catch { return null; } };
  const trim = s => s.replace(/\n+$/, '');
  switch (type) {
    case 'all': return a.every(x => evalCheck(x, env));
    case 'any': return a.some(x => evalCheck(x, env));
    case 'not': return !evalCheck(a, env);
    case 'fileExists': return !!node(a);
    case 'fileMissing': return !node(a);
    case 'dirExists': return node(a)?.type === 'dir';
    case 'isFile': return node(a)?.type === 'file';
    case 'fileContains': { const s = text(a[0]); return s !== null && s.includes(a[1]); }
    case 'fileMatches': { const s = text(a[0]); return s !== null && new RegExp(a[1], 'm').test(s); }
    case 'fileEquals': { const s = text(a[0]); return s !== null && trim(s) === trim(a[1]); }
    case 'fileLines': { const s = text(a[0]); return s !== null && (trim(s) === '' ? 0 : trim(s).split('\n').length) === a[1]; }
    case 'mode': { const n = node(a[0]); return !!n && (n.mode & 0o7777) === parseInt(a[1], 8); }
    case 'executable': { const n = node(a); return !!n && (n.mode & 0o111) !== 0; }
    case 'owner': {
      const n = node(a[0]);
      if (!n) return false;
      const u = getUsers(env.fs).find(x => x.uid === n.uid), g = getGroups(env.fs).find(x => x.gid === n.gid);
      return u?.name === a[1] && (a[2] === undefined || g?.name === a[2]);
    }
    case 'symlink': { const n = node(a[0]); return n?.type === 'link' && (a[1] === undefined || n.target === a[1]); }
    case 'userExists': return getUsers(env.fs).some(u => u.name === a);
    case 'inGroup': return !!getGroups(env.fs).find(g => g.name === a[1])?.members.includes(a[0]);
    case 'cwd': return env.cwd === P(env, a);
    case 'ran': return [].concat(a).every(n => env.lines.some(l => commandsOf(l).includes(n)));
    case 'line': { const re = new RegExp(a); return env.lines.some(l => re.test(l)); }
    case 'pipeline': return env.lines.some(l => /(^|[^|])\|([^|]|$)/.test(l));
    case 'redirect': return env.lines.some(l => />/.test(l));
    case 'output': return new RegExp(a, 'm').test(env.out);
    default: throw new Error('unknown check: ' + type);
  }
}

export const starsFor = (hints, bonusAll) => (hints > 0 ? 1 : bonusAll ? 3 : 2);

// --- běh úkolu (stav rozpracovaného úkolu) ---
export class MissionRun {
  constructor(mission, state = {}) {
    this.mission = mission;
    this.lines = state.lines ?? [];
    this.out = state.out ?? '';
    this.hints = state.hints ?? 0;                                   // kolik nápověd bylo odkryto
    this.bonusDone = mission.bonus.map((_, i) => !!state.bonus?.[i]); // bonus se pamatuje (jednou splněný zůstane)
    this.done = !!state.done;
    this.hintsAtDone = state.hintsAtDone ?? 0;
    this.stars = state.stars ?? 0;
    this.recorded = state.recorded ?? 0;                             // kolik hvězd už je zapsáno do postupu
    this.goals = mission.goals.map(() => false);
    this.hooks = {};                                                 // quit(), restart(), changed() – nastavuje main.js
  }
  toState() {
    return { id: this.mission.id, rev: this.mission.rev ?? 1, lines: this.lines.slice(-300), out: this.out.slice(-8000), hints: this.hints, bonus: this.bonusDone, done: this.done,
      hintsAtDone: this.hintsAtDone, stars: this.stars, recorded: this.recorded };
  }
  observe(line, out = '') {
    this.lines.push(line);
    if (this.lines.length > 300) this.lines.shift();
    this.out = (this.out + stripAnsi(out)).slice(-8000);
  }
  // Přepočítá cíle a bonus; vrací true, když přibyly hvězdy (výsledek je třeba zapsat do postupu)
  update(machine, cwd = HOME) {
    const env = { fs: machine.fs, home: HOME, lines: this.lines, out: this.out, cwd };
    this.goals = this.mission.goals.map(g => evalCheck(g.check, env));
    this.mission.bonus.forEach((b, i) => { if (!this.bonusDone[i] && evalCheck(b.check, env)) this.bonusDone[i] = true; });
    let gained = false;
    if (!this.done && this.goals.every(Boolean)) { this.done = true; this.hintsAtDone = this.hints; }
    if (this.done) {
      const s = starsFor(this.hintsAtDone, this.bonusDone.every(Boolean));
      if (s > this.stars) { this.stars = s; gained = s > this.recorded; }
    }
    this.hooks.changed?.();
    return gained;
  }
  result() { return { stars: this.stars, hints: this.hintsAtDone, rev: this.mission.rev ?? 1 }; }
  // Odkryje další nápovědu (nebo zopakuje poslední)
  hint(lang) {
    const list = this.mission.hints;
    if (this.hints < list.length) this.hints++;
    this.hooks.changed?.();
    return { n: this.hints, total: list.length, text: pick(list[this.hints - 1], lang) };
  }
  shownHints(lang) { return this.mission.hints.slice(0, this.hints).map(h => pick(h, lang)); }
}

// Výchozí adresář úkolu (setup.cwd, jinak domov)
export const startDir = setup => resolvePath(HOME, (setup?.cwd ?? '~').replace(/^~(?=\/|$)/, HOME));

export const pick = (v, lang) => (typeof v === 'string' ? v : v?.[lang] ?? v?.en ?? '');

// --- příprava stroje podle setup ---
// setup: { files: { cesta: "text" | { data, mode:"640", user, group } }, dirs: [cesta], links: { cesta: cíl },
//          remove: [cesta], users: [{ name, password, groups }], cwd }
export function applySetup(machine, setup = {}) {
  const fs = machine.fs;
  const abs = p => resolvePath(HOME, p.replace(/^~(?=\/|$)/, HOME));
  const owner = (p, o = {}) => {
    const u = getUsers(fs).find(x => x.name === (o.user ?? (p.startsWith(HOME) ? 'student' : 'root')));
    const g = getGroups(fs).find(x => x.name === (o.group ?? o.user ?? (p.startsWith(HOME) ? 'student' : 'root')));
    return { uid: u?.uid ?? 0, gid: g?.gid ?? u?.gid ?? 0 };
  };
  for (const u of setup.users ?? []) {
    addUser(fs, { name: u.name, createHome: true, groups: u.groups ?? [] });
    if (u.password !== undefined) setPassword(fs, u.name, u.password);
  }
  for (const p of setup.remove ?? []) {
    const path = abs(p);
    const rm = q => { const n = fs.lstat(q, null); if (n.type === 'dir') for (const c of fs.readdir(q, null)) rm(q + '/' + c); n.type === 'dir' ? fs.rmdir(q, null) : fs.unlink(q, null); };
    try { rm(path); } catch { /* už neexistuje */ }
  }
  for (const d of setup.dirs ?? []) {
    const path = abs(d);
    fs.mkdirp(path, { mode: 0o755, ...owner(path) });
  }
  for (const [p, v] of Object.entries(setup.files ?? {})) {
    const path = abs(p), o = typeof v === 'string' ? {} : v;
    const { uid, gid } = owner(path, o);
    fs.mkdirp(path.slice(0, path.lastIndexOf('/')) || '/', { mode: 0o755, uid, gid });
    fs.put(path, typeof v === 'string' ? v : v.data, { mode: o.mode ? parseInt(o.mode, 8) : 0o644, uid, gid });
  }
  for (const [p, target] of Object.entries(setup.links ?? {})) fs.putLink(abs(p), target);
}

// --- kontrola definice úkolu (používají testy) ---
function checkProblems(c, where, out) {
  if (!c || typeof c !== 'object' || Object.keys(c).length !== 1) return out.push(`${where}: kontrola musí mít právě jeden klíč`);
  const [type] = Object.keys(c);
  if (!CHECK_TYPES.includes(type)) return out.push(`${where}: neznámá kontrola ${type}`);
  if (type === 'all' || type === 'any') (Array.isArray(c[type]) ? c[type] : []).forEach((x, i) => checkProblems(x, `${where}.${type}[${i}]`, out));
  if (type === 'not') checkProblems(c.not, `${where}.not`, out);
}
export function validateMission(m) {
  const out = [], bi = v => v && typeof v.cs === 'string' && typeof v.en === 'string' && v.cs && v.en;
  if (!/^[a-z0-9-]{1,64}$/.test(m.id ?? '')) out.push('id');
  if (![1, 2, 3].includes(m.level)) out.push('level');
  if (!bi(m.title)) out.push('title cs/en');
  if (!bi(m.brief)) out.push('brief cs/en');
  for (const k of ['goals', 'bonus']) {
    if (!Array.isArray(m[k]) || !m[k].length) { out.push(k + ' prázdné'); continue; }
    m[k].forEach((g, i) => { if (!bi(g.text)) out.push(`${k}[${i}].text cs/en`); checkProblems(g.check, `${k}[${i}].check`, out); });
  }
  if (!Array.isArray(m.hints) || !m.hints.length || !m.hints.every(bi)) out.push('hints cs/en');
  for (const k of ['solution', 'best']) if (!Array.isArray(m[k]) || !m[k].length) out.push(`${k} (řešení pro test: solution = splní cíle, best = i bonus)`);
  return out;
}

// --- postup žáka (uložený odděleně od stroje) ---
export const emptyProgress = () => ({ format: 1, app: 'bubos', kind: 'progress', exportedAt: 0, missions: {} });
const ID = /^[a-z0-9-]{1,64}$/;

// Z libovolného (nedůvěryhodného) JSONu udělá čistý objekt postupu; kdo to není, vyhodí chybu
export function sanitizeProgress(x) {
  if (!x || x.app !== 'bubos' || x.format !== 1 || typeof x.missions !== 'object' || !x.missions) throw new Error('not a BubOS progress file');
  const p = emptyProgress();
  p.exportedAt = Number.isFinite(x.exportedAt) ? x.exportedAt : 0;
  for (const [id, r] of Object.entries(x.missions)) {
    if (!ID.test(id) || !r || typeof r !== 'object') continue;
    const stars = Math.trunc(r.stars), hints = Math.trunc(r.hints ?? 0), rev = Math.trunc(r.rev ?? 1);
    if (!(stars >= 0 && stars <= 3)) continue;
    p.missions[id] = { stars, hints: hints >= 0 ? hints : 0, rev: rev >= 1 ? rev : 1, at: Number.isFinite(r.at) ? r.at : 0 };
  }
  return p;
}
// Postup může být samostatný soubor, nebo část exportu celého systému (pole progress)
export const extractProgress = j => sanitizeProgress(j?.kind === 'progress' ? j : j?.progress);

const better = (a, b) => !b || a.stars > b.stars || (a.stars === b.stars && a.hints < b.hints);
export function recordResult(p, id, r) {
  if (!better(r, p.missions[id])) return false;
  p.missions[id] = { stars: r.stars, hints: r.hints, rev: r.rev, at: Date.now() };
  return true;
}
export function mergeProgress(a, b) {
  const out = sanitizeProgress(a);
  for (const [id, r] of Object.entries(sanitizeProgress(b).missions)) if (better(r, out.missions[id])) out.missions[id] = r;
  out.exportedAt = Math.max(a.exportedAt ?? 0, b.exportedAt ?? 0);
  return out;
}
export const totalStars = p => Object.values(p.missions).reduce((s, r) => s + r.stars, 0);
