// Tabulka procesů (jen simulovaná, neukládá se do exportu)
import { Interrupt } from './util.js';

// Signály, které simulátor zná (číslo → název)
export const SIGNALS = { 1: 'HUP', 2: 'INT', 3: 'QUIT', 9: 'KILL', 15: 'TERM', 18: 'CONT', 19: 'STOP', 20: 'TSTP' };
export const sigNumber = s => {
  if (/^\d+$/.test(s)) return SIGNALS[+s] ? +s : null;
  const name = s.toUpperCase().replace(/^SIG/, '');
  const hit = Object.entries(SIGNALS).find(([, v]) => v === name);
  return hit ? +hit[0] : null;
};

// Proces: ac = zrušení (kill, Ctrl+C), stopped = pozastaven (Ctrl+Z, SIGSTOP)
class Proc {
  constructor(o) {
    Object.assign(this, { ppid: 1, ac: new AbortController(), stopped: false, sig: 0, ...o });
    this._wake = [];
  }
  // Čeká na změnu stavu (pozastaveno/pokračuje/zrušeno)
  change() { return new Promise(r => this._wake.push(r)); }
  _notify() { const w = this._wake; this._wake = []; for (const f of w) f(); }
  // Pozastaveným příkazům: čeká, dokud proces nepokračuje (nebo nedostane kill)
  async pause() {
    while (this.stopped && !this.ac.signal.aborted) await this.change();
    if (this.ac.signal.aborted) throw new Interrupt();
  }
  stop() { if (!this.stopped) { this.stopped = true; this._notify(); } }
  cont() { if (this.stopped) { this.stopped = false; this._notify(); } }
  // Doručí signál; vrací false, když ho proces ignoruje
  deliver(sig) {
    if (sig === 18) { this.cont(); return true; }
    if (sig === 19 || sig === 20) { this.stop(); return true; }
    if (this.immune && sig !== 9) return false; // interaktivní shell ignoruje TERM/INT/HUP
    this.sig = sig;
    this.stopped = false;
    this.ac.abort();
    this._notify();
    return true;
  }
}

export class ProcTable {
  constructor() { this.next = 2000 + Math.floor(Math.random() * 900); this.map = new Map(); this.onChange = null; }
  _changed() { this.onChange?.(); }
  // systémové procesy s pevným PID (init, cron, …); pid obsazený → přidělí se nové
  system(list) {
    for (const [pid, user, cmd, ppid = 1, extra = {}] of list) this.add({ pid, user, cmd, ppid, ...extra });
  }
  add({ pid, ...o }) {
    if (this.map.has(pid)) pid = this.next++;
    const p = new Proc({ pid, start: Date.now() - 3600e3, sys: true, ...o });
    this.map.set(pid, p);
    this._changed();
    return p;
  }
  spawn({ user, cmd, ppid = 1 }) {
    const p = new Proc({ pid: this.next++, ppid, user, cmd, start: Date.now() });
    this.map.set(p.pid, p);
    this._changed();
    return p;
  }
  end(p) { if (this.map.delete(p.pid)) this._changed(); }
  get(pid) { return this.map.get(pid); }
  list() { return [...this.map.values()].sort((a, b) => a.pid - b.pid); }
}
