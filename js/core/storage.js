// Ukládání stavu v prohlížeči (IndexedDB, záloha localStorage) + export/import do souboru.
import { validateNode } from './vfs.js';
import { emptyProgress, sanitizeProgress, extractProgress, mergeProgress } from './mission.js';

const DB = 'bubos', STORE = 'state', KEY = 'main';
const MAX_IMPORT = 20 * 1024 * 1024;

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// Klíče v úložišti: 'main' = pískoviště, 'progress' = postup v kampani, 'mission:<id>' = rozpracovaný úkol
const lsKey = key => (key === KEY ? DB : DB + ':' + key);

export async function save(state, key = KEY) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch {
    try { localStorage.setItem(lsKey(key), JSON.stringify(state)); return true; } catch { return false; }
  }
}

export async function load(key = KEY) {
  try {
    const db = await openDb();
    const v = await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error);
    });
    db.close();
    return v;
  } catch {
    try { return JSON.parse(localStorage.getItem(lsKey(key))); } catch { return null; }
  }
}

export async function wipe(key = KEY) {
  try { localStorage.removeItem(lsKey(key)); } catch { /* nic */ }
  try {
    const db = await openDb();
    await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch { /* nic */ }
}

export function requestPersist() { try { navigator.storage?.persist?.(); } catch { /* nic */ } }

// --- postup v kampani (oddělený od pískoviště) ---
export async function loadProgress() {
  try { return sanitizeProgress(await load('progress')); } catch { return emptyProgress(); }
}
export const saveProgress = p => save(p, 'progress');

// Přidá postup z importovaného souboru (lepší hvězdy vyhrají)
export async function mergeProgressFrom(json) {
  let inc;
  try { inc = extractProgress(json); } catch { return false; }
  await saveProgress(mergeProgress(await loadProgress(), inc));
  return true;
}
// Změna jazyka/vzhledu mimo pískoviště (kampaň, úkol) se zapíše do jeho nastavení
export async function patchSettings(patch) {
  const s = await load();
  if (s) { s.settings = { ...s.settings, ...patch }; await save(s); }
}
export async function loadSettings() { return (await load())?.settings ?? {}; }

// Export celého systému i s postupem; zapíše si čas poslední zálohy
export async function exportAll(snapshot) {
  const p = await loadProgress();
  p.exportedAt = Date.now();
  await saveProgress(p);
  exportFile({ ...snapshot, progress: p });
}
export async function exportProgress() {
  const p = await loadProgress();
  p.exportedAt = Date.now();
  await saveProgress(p);
  exportFile(p, 'bubos-postup');
}

export function exportFile(state, prefix = 'bubos') {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function validateState(st) {
  if (!st || st.format !== 1 || st.app !== 'bubos' || typeof st.os !== 'string') throw new Error('not a BubOS file');
  validateNode(st.fs);
  if (st.fs.type !== 'dir') throw new Error('invalid filesystem');
  return st;
}

export async function readJson(file) {
  if (file.size > MAX_IMPORT) throw new Error('file too large');
  return JSON.parse(await file.text());
}

export async function readImportFile(file) {
  if (file.size > MAX_IMPORT) throw new Error('file too large');
  return validateState(JSON.parse(await file.text()));
}
