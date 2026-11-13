// Textové proudy: roura (Pipe), vstup (Stdin) a zapisovače
import { BrokenPipe, tick } from './util.js';

// Roura s omezeným bufferem. Zapisovatel čeká, když je plná; čtenář čeká na data.
export class Pipe {
  constructor(limit = 1 << 16) {
    this.chunks = []; this.size = 0; this.limit = limit;
    this.ended = false; this.closed = false; this.waitR = null; this.waitW = null; this.n = 0;
  }
  _wakeR() { const f = this.waitR; this.waitR = null; f?.(); }
  _wakeW() { const f = this.waitW; this.waitW = null; f?.(); }
  async write(s) {
    if (this.closed) throw new BrokenPipe();
    if (!s) return;
    this.chunks.push(s); this.size += s.length;
    this._wakeR();
    if ((++this.n & 127) === 0) await tick(); // aby se nezablokovalo UI
    while (this.size > this.limit && !this.closed) await new Promise(r => (this.waitW = r));
    if (this.closed) throw new BrokenPipe();
  }
  end() { this.ended = true; this._wakeR(); }
  async read() {
    while (!this.chunks.length) {
      if (this.ended) return null;
      await new Promise(r => (this.waitR = r));
    }
    const s = this.chunks.shift();
    this.size -= s.length;
    this._wakeW();
    return s;
  }
  close() { this.closed = true; this.ended = true; this.chunks = []; this._wakeW(); this._wakeR(); }
}

// Vstup pro příkazy: čtení po kouscích, po řádcích, celé najednou
export class Stdin {
  constructor(read, close = () => {}, { sticky = true } = {}) {
    this._read = read; this._close = close; this.sticky = sticky; this.buf = ''; this.eof = false;
  }
  static fromString(s) {
    let done = false;
    return new Stdin(async () => { if (done || !s) return null; done = true; return s; });
  }
  async read() {
    if (this.buf) { const s = this.buf; this.buf = ''; return s; }
    if (this.eof) return null;
    const s = await this._read();
    if (s === null && this.sticky) this.eof = true;
    return s;
  }
  async readAll() {
    let out = '', s;
    while ((s = await this.read()) !== null) out += s;
    return out;
  }
  async readLine() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i >= 0) { const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1); return l; }
      if (this.eof) { if (this.buf) { const l = this.buf; this.buf = ''; return l; } return null; }
      const s = await this._read();
      if (s === null) { if (this.sticky) this.eof = true; else { const l = this.buf; this.buf = ''; return l || null; } }
      else this.buf += s;
    }
  }
  close() { this._close(); }
}

export class StringWriter {
  constructor() { this.text = ''; }
  async write(s) { this.text += s; }
  end() {}
}

// Zápis do souboru přes VFS (kontrola práv při otevření i zápisu)
export class FileWriter {
  constructor(fs, path, user, append) { this.fs = fs; this.path = path; this.user = user; this.append = append; }
  open() { this.fs.write(this.path, '', this.user, this.append); }
  async write(s) { this.fs.write(this.path, s, this.user, true); }
  end() {}
}

export const nullWriter = { async write() {}, end() {} };
