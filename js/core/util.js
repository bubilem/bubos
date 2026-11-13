// Společné pomocné třídy a funkce (bez závislosti na DOM)

export class CmdError extends Error {
  constructor(msg, code = 1, hint = false) { super(msg); this.code = code; this.hint = hint; }
}
export class Interrupt extends Error { constructor() { super('interrupt'); } }
export class BrokenPipe extends Error { constructor() { super('broken pipe'); } }
export class Logout extends Error { constructor() { super('logout'); } }
export class ScriptExit extends Error { constructor(code = 0) { super('exit'); this.code = code; } }
export class Restart extends Error { constructor() { super('restart'); } }

export const tick = () => new Promise(r => setTimeout(r, 0));

export function sleep(ms, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(new Interrupt());
    const onAbort = () => { clearTimeout(id); rej(new Interrupt()); };
    const id = setTimeout(() => { signal?.removeEventListener('abort', onAbort); res(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const byteLen = s => new TextEncoder().encode(s).length;
export const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

// Rozloží položky [{text, len}] do sloupců (po sloupcích, jako ls)
export function columns(items, width = 80) {
  const n = items.length;
  if (!n) return '';
  for (let cols = Math.min(n, Math.max(1, Math.floor(width / 3))); cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    const widths = [];
    for (let c = 0; c < cols; c++) {
      let w = 0;
      for (let r = 0; r < rows; r++) { const it = items[c * rows + r]; if (it) w = Math.max(w, it.len); }
      widths.push(w);
    }
    const total = widths.reduce((a, b) => a + b, 0) + 2 * (cols - 1);
    if (total <= width || cols === 1) {
      const lines = [];
      for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < cols; c++) {
          const it = items[c * rows + r];
          if (!it) continue;
          const last = c === cols - 1 || !items[(c + 1) * rows + r];
          line += it.text + (last ? '' : ' '.repeat(widths[c] - it.len + 2));
        }
        lines.push(line);
      }
      return lines.join('\n');
    }
  }
}
