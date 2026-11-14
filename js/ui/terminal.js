// Lehký terminál v DOM: výstup (pre), řádek se vstupem (input), historie, Tab, Ctrl+zkratky.
// Vstup řeší nativní <input> – funguje tak diakritika, vkládání i klávesnice na mobilech.
import { Interrupt, columns } from '../core/util.js';
import { renderAnsi } from './ansi.js';
import { pager } from './pager.js';
import { editor } from './editor.js';

const MAX_NODES = 6000;

export class Terminal {
  constructor(root) {
    this.root = root;
    root.classList.add('term');
    root.innerHTML = `
      <div class="screen">
        <pre class="out"></pre>
        <div class="row" hidden><span class="prompt"></span><input class="in" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" aria-label="terminal"></div>
        <span class="probe" aria-hidden="true">0000000000</span>
      </div>
      <div class="keys" aria-hidden="true">
        <button data-k="tab">Tab</button><button data-k="up">↑</button><button data-k="down">↓</button>
        <button data-k="int">Ctrl+C</button><button data-k="eof">Ctrl+D</button>
        <button data-c="|">|</button><button data-c="~">~</button><button data-c="/">/</button><button data-c="-">-</button><button data-c=">">&gt;</button>
      </div>`;
    this.screen = root.querySelector('.screen');
    this.out = root.querySelector('.out');
    this.row = root.querySelector('.row');
    this.promptEl = root.querySelector('.prompt');
    this.inp = root.querySelector('.in');
    this.probe = root.querySelector('.probe');
    this._read = null;
    this._overlay = null;
    this._raf = 0;
    this.isTTY = true;
    this.onInterrupt = null;

    this.inp.addEventListener('keydown', e => this._onKey(e));
    this.inp.addEventListener('input', () => { if (this._read) this._read.tab = 0; });
    this.screen.addEventListener('click', () => { if (!getSelection().toString()) this.focus(); });
    // Ctrl+C během běhu příkazu (když se zrovna nečte řádek)
    document.addEventListener('keydown', e => {
      if (this._read || this._overlay || !(e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'c')) return;
      if (getSelection().toString()) return;
      e.preventDefault();
      this._interruptRunning();
    });
    root.querySelector('.keys').addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault(); // nechá fokus ve vstupu (neschová klávesnici)
      if (b.dataset.c) this._insert(b.dataset.c);
      else this._action(b.dataset.k);
    });
  }

  focus() { if (this._read) this.inp.focus({ preventScroll: true }); }
  get cols() {
    const w = this.probe.getBoundingClientRect().width / 10;
    return w > 0 ? Math.max(20, Math.floor((this.screen.clientWidth - 16) / w)) : 80;
  }

  // --- výstup ---
  write(text, cls = '') {
    if (!text) return;
    renderAnsi(text, this.out, cls);
    while (this.out.childNodes.length > MAX_NODES) this.out.removeChild(this.out.firstChild);
    this._scroll();
  }
  clear() { this.out.replaceChildren(); }
  _scroll() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.screen.scrollTop = this.screen.scrollHeight; });
  }

  // --- vstup ---
  // Přečte řádek. Vrací text, null při Ctrl+D na prázdném řádku; Ctrl+C odmítne s Interrupt.
  readLine({ prompt = '', history = [], complete = null, password = false } = {}) {
    return new Promise((resolve, reject) => {
      this._read?.reject(new Interrupt());
      this.inp.type = password ? 'password' : 'text';
      this.inp.value = '';
      this.promptEl.replaceChildren();
      renderAnsi(prompt, this.promptEl);
      this.row.hidden = false;
      this._read = { prompt, history, complete, password, resolve, reject, hIdx: history.length, draft: '', tab: 0 };
      this._scroll();
      this.inp.focus({ preventScroll: true });
    });
  }
  ask(prompt, { silent = false } = {}) { return this.readLine({ prompt, password: silent }); }
  cancelRead(err) {
    const r = this._read;
    if (!r) return;
    this._read = null; this.row.hidden = true;
    r.reject(err);
  }
  _end() { const r = this._read; this._read = null; this.row.hidden = true; return r; }
  _finish(value) {
    const r = this._end();
    this.write(r.prompt + (r.password ? '' : value) + '\n');
    r.resolve(value);
  }
  _interruptRead() {
    const r = this._end();
    this.write(r.prompt + (r.password ? '' : this.inp.value) + '^C\n');
    r.reject(new Interrupt());
  }
  _interruptRunning() { this.write('^C\n'); this.onInterrupt?.(); }
  _eof() {
    if (this.inp.value) return;
    const r = this._end();
    this.write(r.prompt);
    r.resolve(null);
  }

  _setValue(v) { this.inp.value = v; this.inp.setSelectionRange(v.length, v.length); }
  _insert(s) {
    if (!this._read) return;
    const i = this.inp, a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? a;
    i.value = i.value.slice(0, a) + s + i.value.slice(b);
    i.setSelectionRange(a + s.length, a + s.length);
    this._read.tab = 0;
    i.focus({ preventScroll: true });
  }
  _hist(dir) {
    const r = this._read;
    if (dir < 0 && r.hIdx > 0) {
      if (r.hIdx === r.history.length) r.draft = this.inp.value;
      this._setValue(r.history[--r.hIdx]);
    } else if (dir > 0 && r.hIdx < r.history.length) {
      r.hIdx++;
      this._setValue(r.hIdx === r.history.length ? r.draft : r.history[r.hIdx]);
    }
  }
  _action(k) {
    if (k === 'int') { if (this._read) this._interruptRead(); else this._interruptRunning(); return; }
    if (!this._read) return;
    if (k === 'tab') this._tab();
    else if (k === 'up') this._hist(-1);
    else if (k === 'down') this._hist(1);
    else if (k === 'eof') this._eof();
    this.inp.focus({ preventScroll: true });
  }

  // Ctrl+R: zpětné hledání v historii (reverse-i-search)
  _rsShow() {
    const r = this._read, s = r.rs;
    this.promptEl.replaceChildren(`(${s.found ? '' : 'failed '}reverse-i-search)'${s.q}': `);
    if (s.found) this._setValue(r.history[s.idx]);
  }
  _rsFind(from) {
    const s = this._read.rs, h = this._read.history;
    for (let i = from; i >= 0; i--) if (s.q && h[i].includes(s.q)) { s.idx = i; s.found = true; return; }
    s.found = false;
  }
  _rsEnd(keep) {
    const r = this._read, s = r.rs;
    r.rs = null;
    this.promptEl.replaceChildren();
    renderAnsi(r.prompt, this.promptEl);
    if (!keep) this._setValue(s.draft);
  }
  // Vrací true, když klávesu spotřebovalo hledání
  _rsKey(e) {
    const r = this._read, s = r.rs, k = e.key, ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const eat = fn => { e.preventDefault(); fn(); return true; };
    if (ctrl && k.toLowerCase() === 'r') return eat(() => { this._rsFind(s.found ? s.idx - 1 : r.history.length - 1); this._rsShow(); });
    if (k === 'Backspace') return eat(() => { s.q = s.q.slice(0, -1); this._rsFind(r.history.length - 1); this._rsShow(); });
    if (k === 'Escape' || (ctrl && ['g', 'c'].includes(k.toLowerCase()))) return eat(() => this._rsEnd(false));
    if (k === 'Enter') return eat(() => { const v = s.found ? r.history[s.idx] : s.draft; this._rsEnd(true); this._finish(v); });
    if (k.length === 1 && !ctrl && !e.altKey && !e.metaKey) return eat(() => { s.q += k; this._rsFind(r.history.length - 1); this._rsShow(); });
    this._rsEnd(s.found); // ostatní klávesy hledání ukončí a pak se provedou jako obvykle
    return false;
  }

  _onKey(e) {
    const r = this._read;
    if (!r || e.isComposing) return;
    const k = e.key;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return;
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const inp = this.inp;
    if (r.rs && this._rsKey(e)) return;
    if (k === 'Enter') { e.preventDefault(); this._finish(inp.value); return; }
    if (k === 'Tab') { e.preventDefault(); this._tab(); return; }
    r.tab = 0;
    if (k === 'ArrowUp') { e.preventDefault(); this._hist(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); this._hist(1); }
    else if (ctrl) {
      const pos = inp.selectionStart ?? 0;
      switch (k.toLowerCase()) {
        case 'c': if (inp.selectionStart !== inp.selectionEnd) return; e.preventDefault(); this._interruptRead(); break;
        case 'd': if (!inp.value) { e.preventDefault(); this._eof(); } break;
        case 'l': e.preventDefault(); this.clear(); break;
        case 'a': e.preventDefault(); inp.setSelectionRange(0, 0); break;
        case 'e': e.preventDefault(); inp.setSelectionRange(inp.value.length, inp.value.length); break;
        case 'u': e.preventDefault(); inp.value = inp.value.slice(pos); inp.setSelectionRange(0, 0); break;
        case 'k': e.preventDefault(); inp.value = inp.value.slice(0, pos); break;
        case 'r': if (r.password) break; e.preventDefault(); r.rs = { q: '', idx: r.history.length, found: false, draft: inp.value }; this._rsShow(); break;
        default: break;
      }
    }
  }

  async _tab() {
    const r = this._read;
    if (!r?.complete) return;
    const inp = this.inp, line = inp.value, pos = inp.selectionStart ?? line.length;
    const res = await r.complete(line, pos);
    if (this._read !== r || inp.value !== line) return;
    const c = res?.cands ?? [];
    if (!c.length) return;
    const replace = text => {
      inp.value = line.slice(0, res.start) + text + line.slice(pos);
      const p = res.start + text.length;
      inp.setSelectionRange(p, p);
    };
    const cur = line.slice(res.start, pos);
    let lcp = c[0].text;
    for (const x of c) { let i = 0; while (i < lcp.length && x.text[i] === lcp[i]) i++; lcp = lcp.slice(0, i); }
    if (c.length === 1) { replace(c[0].text + c[0].end); r.tab = 0; }
    else if (lcp.length > cur.length) { replace(lcp); r.tab = 0; }
    else if (++r.tab >= 2) {
      this.write(r.prompt + line + '\n');
      this.write(columns(c.map(x => ({ text: x.label, len: [...x.label].length })), this.cols) + '\n');
      r.tab = 0;
    }
  }

  // --- celoobrazovkové části ---
  overlay(el) {
    this.root.appendChild(el);
    this._overlay = el;
    return () => { el.remove(); this._overlay = null; this.focus(); };
  }
  pager(text, opts) { return pager(this, text, opts); }
  edit(opts) { return editor(this, opts); }
}
