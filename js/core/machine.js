// Virtuální počítač: souborový systém + procesy + nastavení + OS profil
import { VFS } from './vfs.js';
import { ProcTable } from './process.js';
import { validateState } from './storage.js';

export class Machine {
  constructor(os, fs, settings = {}) {
    this.os = os;
    this.fs = fs;
    this.settings = { lang: 'cs', theme: 'dark', ...settings };
    this.procs = new ProcTable();
    this.sudoUntil = new Map();
    this.onSettings = null;
    os.boot?.(this);
  }
  static fresh(os, settings = {}) {
    const lang = settings.lang ?? 'cs';
    return new Machine(os, os.buildFs(lang), settings);
  }
  static fromState(os, st) {
    validateState(st);
    if (st.os !== os.id) throw new Error('unknown os');
    return new Machine(os, new VFS(st.fs), st.settings);
  }
  get hostname() {
    try { return this.fs.read('/etc/hostname', null).trim() || 'bubos'; } catch { return 'bubos'; }
  }
  setSetting(k, v) { this.settings[k] = v; this.onSettings?.(k, v); }
  snapshot() {
    return { format: 1, app: 'bubos', os: this.os.id, savedAt: new Date().toISOString(), settings: this.settings, fs: this.fs.root };
  }
}
