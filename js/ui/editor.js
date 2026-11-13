// Jednoduchý textový editor ve stylu nano (nad <textarea>)
// Ctrl+O / Ctrl+S = uložit, Ctrl+X = konec, Ctrl+K = vyjmout řádek, Ctrl+U = vložit
import { t } from '../core/i18n.js';

export function editor(term, { name, text, isNew, readOnly, save }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'overlay editor';
    el.innerHTML = `<div class="bar hdr"><span class="ttl"></span><span class="flag"></span></div>
      <textarea spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off"></textarea>
      <div class="msg"></div>
      <div class="bar chips">
        <button type="button" data-a="save"><b>^O</b> ${t('editor.save')}</button>
        <button type="button" data-a="exit"><b>^X</b> ${t('editor.exit')}</button>
        <button type="button" data-a="cut"><b>^K</b> ${t('editor.cut')}</button>
        <button type="button" data-a="paste"><b>^U</b> ${t('editor.paste')}</button>
      </div>`;
    const ta = el.querySelector('textarea'), msg = el.querySelector('.msg');
    ta.value = text;
    let modified = false, asking = false, cutBuf = '';
    const status = s => { msg.textContent = s; };
    const header = () => {
      el.querySelector('.ttl').textContent = `${t('editor.title')}   ${name || '—'}`;
      el.querySelector('.flag').textContent = [isNew && t('editor.new'), readOnly && t('editor.readonly'), modified && t('editor.modified')].filter(Boolean).join(' · ');
    };
    header();
    if (isNew) status(`[ ${t('editor.new')} ]`);

    const close = term.overlay(el);
    const finish = () => { close(); resolve(); };
    const doSave = async () => {
      try {
        const n = await save(ta.value);
        modified = false; isNew = false;
        status(`[ ${t('editor.saved', { n })} ]`);
        header();
        return true;
      } catch (e) {
        status(`[ ${t('editor.error', { msg: e.message })} ]`);
        return false;
      }
    };
    const exit = async () => {
      if (!modified) return finish();
      asking = true; status(t('editor.ask'));
    };
    const cut = () => {
      const v = ta.value, pos = ta.selectionStart;
      const s = v.lastIndexOf('\n', pos - 1) + 1;
      let e = v.indexOf('\n', pos);
      e = e < 0 ? v.length : e + 1;
      cutBuf = v.slice(s, e);
      ta.value = v.slice(0, s) + v.slice(e);
      ta.setSelectionRange(s, s);
      modified = true; header();
    };
    const paste = () => {
      const p = ta.selectionStart;
      ta.value = ta.value.slice(0, p) + cutBuf + ta.value.slice(p);
      ta.setSelectionRange(p + cutBuf.length, p + cutBuf.length);
      modified = true; header();
    };

    ta.addEventListener('input', () => { if (!modified) { modified = true; header(); } });
    ta.addEventListener('keydown', async e => {
      if (asking) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === 'y' || k === 'a') { asking = false; if (await doSave()) finish(); }
        else if (k === 'n') finish();
        else if (k === 'escape' || (e.ctrlKey && k === 'c')) { asking = false; status(''); }
        return;
      }
      if (e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'o' || k === 's') { e.preventDefault(); doSave(); }
        else if (k === 'x') { e.preventDefault(); exit(); }
        else if (k === 'k') { e.preventDefault(); cut(); }
        else if (k === 'u') { e.preventDefault(); paste(); }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const p = ta.selectionStart;
        ta.setRangeText('\t', p, ta.selectionEnd, 'end');
        if (!modified) { modified = true; header(); }
      }
    });
    el.querySelector('.chips').addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      ({ save: doSave, exit, cut, paste })[b.dataset.a]();
      ta.focus();
    });
    ta.focus();
    ta.setSelectionRange(0, 0);
  });
}
