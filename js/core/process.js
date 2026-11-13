// Tabulka procesů (jen simulovaná, neukládá se do exportu)
export class ProcTable {
  constructor() { this.next = 2000 + Math.floor(Math.random() * 900); this.map = new Map(); }
  // systémové procesy s pevným PID (init, cron, …)
  system(list) {
    for (const [pid, user, cmd, ppid = 1] of list)
      this.map.set(pid, { pid, ppid, user, cmd, start: Date.now() - 3600e3, ac: new AbortController(), sys: true });
  }
  spawn({ user, cmd, ppid = 1 }) {
    const p = { pid: this.next++, ppid, user, cmd, start: Date.now(), ac: new AbortController() };
    this.map.set(p.pid, p);
    return p;
  }
  end(p) { this.map.delete(p.pid); }
  get(pid) { return this.map.get(pid); }
  list() { return [...this.map.values()].sort((a, b) => a.pid - b.pid); }
}
