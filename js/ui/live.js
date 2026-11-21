// Živý výpis (top): text se obnovuje v pravidelném intervalu; q / Esc / Ctrl+C ukončí
import { t } from '../core/i18n.js';
import { renderAnsi } from './ansi.js';

export function live(term, render, { title = '', interval = 2000, signal = null } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'overlay pager';
    el.innerHTML = '<div class="bar"><span class="ttl"></span><button type="button" class="x"></button></div><pre class="body" tabindex="0"></pre><div class="bar hint"></div>';
    el.querySelector('.ttl').textContent = title;
    el.querySelector('.x').textContent = t('pager.close');
    el.querySelector('.hint').textContent = t('live.hint');
    const body = el.querySelector('.body');
    const draw = () => { body.replaceChildren(); renderAnsi(render(), body); };
    draw();
    const close = term.overlay(el);
    const id = setInterval(draw, interval);
    const done = () => { clearInterval(id); close(); resolve(); };
    signal?.addEventListener('abort', done, { once: true });
    el.querySelector('.x').addEventListener('click', done);
    body.addEventListener('keydown', e => {
      if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) { e.preventDefault(); done(); }
    });
    body.focus();
  });
}
