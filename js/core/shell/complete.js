// Doplňování klávesou Tab: příkazy, cesty, proměnné, uživatelé
import { resolvePath } from '../vfs.js';
import { getUsers } from '../users.js';

const escName = s => s.replace(/[ "'\\$&;|<>()*?[\]#!{}]/g, '\\$&');

export async function complete(sh, line, cursor) {
  const pre = line.slice(0, cursor);
  let i = 0, wordStart = 0, q = null, redir = false;
  let cmdWords = [];
  const endWord = () => {
    if (i > wordStart) { if (redir) redir = false; else cmdWords.push(pre.slice(wordStart, i)); }
  };
  while (i < pre.length) {
    const c = pre[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') i++; i++; continue; }
    if (c === "'" || c === '"') { q = c; i++; continue; }
    if (c === '\\') { i += 2; continue; }
    if (/\s/.test(c)) { endWord(); wordStart = ++i; continue; }
    if ('|&;'.includes(c)) { endWord(); cmdWords = []; redir = false; wordStart = ++i; continue; }
    if ('<>'.includes(c)) { endWord(); redir = true; wordStart = ++i; continue; }
    i++;
  }
  const word = pre.slice(wordStart);
  let real = cmdWords.filter((w, k, a) => !(/^\w+=/.test(w) && a.slice(0, k).every(x => /^\w+=/.test(x))));
  while (real[0] === 'sudo') real = real.slice(1);

  let kind;
  if (word.startsWith('$') && !word.startsWith('$(')) kind = 'var';
  else if (redir) kind = 'path';
  else if (!real.length) kind = 'cmd';
  else kind = sh.os.completions[real[0]] ?? 'path';

  let cands = [];
  if (kind === 'cmd') cands = word.includes('/') ? pathCands(sh, word, {}) : cmdCands(sh, word);
  else if (kind === 'dir') cands = pathCands(sh, word, { dirsOnly: true });
  else if (kind === 'path') cands = pathCands(sh, word, {});
  else if (kind === 'var') cands = Object.keys(sh.vars).filter(k => k.startsWith(word.slice(1))).map(k => ({ text: '$' + k, label: k, end: ' ' }));
  else if (kind === 'varname') cands = Object.keys(sh.vars).filter(k => k.startsWith(word)).map(k => ({ text: k, label: k, end: ' ' }));
  else if (kind === 'user') cands = getUsers(sh.fs).filter(u => u.name.startsWith(word)).map(u => ({ text: u.name, label: u.name, end: ' ' }));
  else if (kind === 'alias') cands = Object.keys(sh.aliases).filter(k => k.startsWith(word)).map(k => ({ text: k, label: k, end: ' ' }));
  if (kind === 'cmd' && !word) cands = [];

  const seen = new Set();
  cands = cands.filter(c => !seen.has(c.text) && seen.add(c.text)).sort((a, b) => a.text.localeCompare(b.text));
  return { start: wordStart, cands };
}

function cmdCands(sh, word) {
  const names = new Set([...Object.keys(sh.aliases), ...sh.os.builtins]);
  for (const d of (sh.vars.PATH || '').split(':').filter(Boolean)) {
    try { for (const nm of sh.fs.readdir(resolvePath(sh.cwd, d), sh.user)) names.add(nm); } catch { /* nic */ }
  }
  return [...names].filter(n => n.startsWith(word)).map(n => ({ text: n, label: n, end: ' ' }));
}

function pathCands(sh, word, opts) {
  let quote = null, raw = word;
  if (raw[0] === '"' || raw[0] === "'") { quote = raw[0]; raw = raw.slice(1); }
  else raw = raw.replace(/\\(.)/g, '$1');
  if (raw === '~') return [{ text: '~/', label: '~/', end: '' }];
  const slash = raw.lastIndexOf('/');
  const dirPart = raw.slice(0, slash + 1), base = raw.slice(slash + 1);
  const typed = word.slice(0, word.lastIndexOf('/') + 1);
  const prefix = quote && !typed ? quote : typed;
  const dirReal = resolvePath(sh.cwd, dirPart === '' ? '.' : dirPart.startsWith('~') ? (sh.vars.HOME ?? '/') + dirPart.slice(1) : dirPart);
  let names;
  try { names = sh.fs.readdir(dirReal, sh.user); } catch { return []; }
  const out = [];
  for (const nm of names) {
    if (!nm.startsWith(base) || (nm[0] === '.' && base[0] !== '.')) continue;
    let n = null;
    try { n = sh.fs.stat(resolvePath(dirReal, nm), sh.user); } catch { /* visací odkaz */ }
    const isDir = n?.type === 'dir';
    if (opts.dirsOnly && !isDir) continue;
    out.push({
      text: prefix + (quote ? nm : escName(nm)) + (isDir ? '/' : ''),
      label: nm + (isDir ? '/' : ''),
      end: isDir ? '' : (quote ? quote + ' ' : ' '),
    });
  }
  return out;
}
