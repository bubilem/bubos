// Ukládání stavu v prohlížeči (IndexedDB, záloha localStorage) + export/import do souboru.
import { validateNode } from './vfs.js';

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

export async function save(state) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch {
    try { localStorage.setItem(DB, JSON.stringify(state)); return true; } catch { return false; }
  }
}

export async function load() {
  try {
    const db = await openDb();
    const v = await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error);
    });
    db.close();
    return v;
  } catch {
    try { return JSON.parse(localStorage.getItem(DB)); } catch { return null; }
  }
}

export async function wipe() {
  try { localStorage.removeItem(DB); } catch { /* nic */ }
  try {
    const db = await openDb();
    await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch { /* nic */ }
}

export function requestPersist() { try { navigator.storage?.persist?.(); } catch { /* nic */ } }

export function exportFile(state) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `bubos-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
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

export async function readImportFile(file) {
  if (file.size > MAX_IMPORT) throw new Error('file too large');
  return validateState(JSON.parse(await file.text()));
}
