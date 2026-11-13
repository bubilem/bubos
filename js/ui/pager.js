// Prohlížeč textu (less / man): q = konec, mezerník / b = stránky, šipky a j/k = řádky
import { t } from '../core/i18n.js';
import { renderAnsi } from './ansi.js';

export function pager(term, text, { title = '' } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'overlay pager';
    el.innerHTML = '<div class="bar"><span class="ttl"></span><button type="button" class="x"></button></div><pre class="body" tabindex="0"></pre><div class="bar hint"></div>';
    el.querySelector('.ttl').textContent = title;
    el.querySelector('.x').textContent = t('pager.close');
    el.querySelector('.hint').textContent = t('pager.hint');
    const body = el.querySelector('.body');
    renderAnsi(text, body);
    const close = term.overlay(el);
    const done = () => { close(); resolve(); };
    el.querySelector('.x').addEventListener('click', done);
    const line = () => parseFloat(getComputedStyle(body).lineHeight) || 18;
    body.addEventListener('keydown', e => {
      const page = body.clientHeight - line();
      let handled = true;
      switch (e.key) {
        case 'q': case 'Q': case 'Escape': done(); break;
        case ' ': case 'PageDown': case 'f': body.scrollBy(0, page); break;
        case 'b': case 'PageUp': body.scrollBy(0, -page); break;
        case 'j': case 'ArrowDown': case 'Enter': body.scrollBy(0, line()); break;
        case 'k': case 'ArrowUp': body.scrollBy(0, -line()); break;
        case 'g': case 'Home': body.scrollTo(0, 0); break;
        case 'G': case 'End': body.scrollTo(0, body.scrollHeight); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    });
    body.focus();
  });
}
