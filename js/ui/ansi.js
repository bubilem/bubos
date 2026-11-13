// Převod textu s barevnými escape sekvencemi (SGR) na DOM uzly.
// Podporováno: 0 reset, 1 tučně, 2 tlumeně, 4 podtržení, 7 inverze, 30–37 / 90–97 barva textu.
const STRIP = /\x1b\[[0-9;?]*[A-Za-ln-z]/g;

export function renderAnsi(text, parent, baseCls = '') {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '').replace(STRIP, '');
  let fg = null, b = false, dim = false, u = false, rv = false, last = 0;
  const emit = s => {
    if (!s) return;
    const cls = [baseCls, fg && 'c' + fg, b && 'b', dim && 'dim', u && 'u', rv && 'rv'].filter(Boolean).join(' ');
    if (!cls) { parent.appendChild(document.createTextNode(s)); return; }
    const span = document.createElement('span');
    span.className = cls; span.textContent = s;
    parent.appendChild(span);
  };
  const re = /\x1b\[([0-9;]*)m/g;
  for (let m; (m = re.exec(text));) {
    emit(text.slice(last, m.index));
    last = re.lastIndex;
    for (const c of (m[1] || '0').split(';').map(Number)) {
      if (c === 0) { fg = null; b = dim = u = rv = false; }
      else if (c === 1) b = true;
      else if (c === 2) dim = true;
      else if (c === 4) u = true;
      else if (c === 7) rv = true;
      else if (c === 22) b = dim = false;
      else if (c === 24) u = false;
      else if (c === 27) rv = false;
      else if (c === 39) fg = null;
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) fg = c;
    }
  }
  emit(text.slice(last));
}
