// Panel úkolu vedle terminálu: zadání, cíle (odškrtávají se samy), bonus, nápovědy, tlačítka. Texty jen přes textContent.
import { t, getLang } from '../core/i18n.js';
import { pick } from '../core/mission.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export class MissionPanel {
  constructor(root, { onRestart, onQuit }) {
    this.root = root; this.run = null;
    this.onRestart = onRestart; this.onQuit = onQuit;
  }
  // Připojí běžící úkol (MissionRun); překreslení při změně zajišťuje main.js (run.hooks.changed → render)
  attach(run) {
    this.run = run;
    this.root.hidden = false;
    this.render();
  }
  render() {
    const run = this.run;
    if (!run) return;
    const lang = getLang(), m = run.mission, root = this.root;
    const list = (items, flags, cls) => el('ul', { className: cls }, ...items.map((g, i) =>
      el('li', { className: flags[i] ? 'ok' : '' }, el('span', { className: 'chk', textContent: flags[i] ? '✔' : '○' }), el('span', { textContent: pick(g.text, lang) }))));

    const head = el('div', { className: 'mhead' },
      el('h2', { textContent: pick(m.title, lang) }),
      el('span', { className: 'mstars', title: t('panel.hint.none') }, el('span', { className: 'on', textContent: '★'.repeat(run.stars) }), '☆'.repeat(3 - run.stars)));
    const brief = el('details', { open: !run.done }, el('summary', { textContent: t('panel.toggle') }), el('p', { textContent: pick(m.brief, lang) }));

    const goals = el('section', {}, el('h3', { textContent: t('panel.goals') }), list(m.goals, run.goals));
    const bonus = el('section', {}, el('h3', { textContent: t('panel.bonus') }), list(m.bonus, run.bonusDone, 'bonus'));

    const shown = run.shownHints(lang);
    const hintBtn = el('button', { textContent: `${t('panel.hint')} (${run.hints}/${m.hints.length})`, type: 'button' });
    hintBtn.addEventListener('click', () => { run.hint(lang); });
    const hints = el('section', { className: 'hints' }, hintBtn,
      ...shown.map((h, i) => el('p', { className: 'hint' }, el('b', { textContent: `${i + 1}. ` }), el('span', { textContent: h }))));
    if (!shown.length) hints.append(el('p', { className: 'dim', textContent: t('panel.hint.none') }));

    const restart = el('button', { textContent: t('panel.restart'), type: 'button' });
    restart.addEventListener('click', () => { if (confirm(t('panel.restart.confirm'))) this.onRestart(); });
    const back = el('button', { textContent: t('panel.back'), type: 'button', className: 'primary' });
    back.addEventListener('click', () => this.onQuit());
    const bar = el('div', { className: 'mbar' }, restart, back);

    const kids = [head, brief];
    if (run.done) {
      const msg = run.stars >= 3 ? t('panel.done.max') : run.hintsAtDone > 0 ? t('panel.done.hint') : t('panel.done.more');
      kids.push(el('div', { className: 'mdone' }, el('b', { textContent: t('panel.done', { stars: run.stars }) }), el('p', { textContent: msg })));
    }
    kids.push(goals, bonus, hints, bar);
    root.replaceChildren(...kids);
  }
}
