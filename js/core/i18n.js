// Překlady (cs / en). Slovníky jsou ploché JSON soubory v i18n/. Chybějící klíč → angličtina → klíč.
const dicts = {};
let lang = 'cs';

export const getLang = () => lang;
export const setLang = l => { lang = l; };
export const setDict = (l, obj) => { dicts[l] = obj; };

export async function loadDict(l, base = 'i18n/') {
  if (dicts[l]) return;
  const r = await fetch(base + l + '.json');
  dicts[l] = await r.json();
}

export function t(key, vars) {
  let s = dicts[lang]?.[key] ?? dicts.en?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
