// Vzorová řešení úloh z kampaně: uklizená v /root/.reseni (skrytá složka v domově správce), aby je šlo najít,
// ale nebila do očí. Zdroj je pole solution/best v JSON úkolů – nic se nepíše dvakrát.
import { pick } from '../../core/mission.js';

export const SOLUTIONS_DIR = '/root/.reseni';

export async function installSolutions(m, os) {
  const lang = m.settings.lang === 'en' ? 'en' : 'cs';
  const S = (cs, en) => (lang === 'cs' ? cs : en);
  const index = await os.loadMissionIndex();
  const ids = index.chapters.flatMap(c => c.missions);
  const defs = (await Promise.all(ids.map(id => os.loadMission(id).catch(() => null)))).filter(Boolean);
  const put = (p, data, mode = 0o644) => m.fs.put(p, data, { mode, uid: 0, gid: 0 });

  m.fs.mkdirp(SOLUTIONS_DIR, { mode: 0o755, uid: 0, gid: 0 });
  put(SOLUTIONS_DIR + '/README.txt', S(
    'Vzorová řešení úloh z kampaně – jeden skript na úlohu.\n\nNajdeš tu jen jednu z možných cest. Úlohy se dají vyřešit i jinak a to je v pořádku.\nSkripty slouží k nahlédnutí, ne vždy se dají pustit vcelku (třeba příkazy,\nkteré se ptají na heslo). Zkus si je opsat po částech.\n\nNejdřív to ale zkus sám/sama – hledání je půlka zábavy.\n',
    'Sample solutions of the campaign missions – one script per mission.\n\nThis is only one of the possible ways. Missions can be solved differently and that is fine.\nThe scripts are for reading; not all can be run as a whole (e.g. commands that\nask for a password). Try copying them piece by piece.\n\nTry it yourself first though – the search is half the fun.\n'));

  for (const d of defs) {
    const body = [
      '#!/bin/bash',
      '# ' + pick(d.title, lang),
      '# ' + pick(d.brief, lang),
      '#',
      S('# Základní řešení:', '# Basic solution:'),
      ...d.solution.map(l => '#   ' + l),
      '#',
      S('# Nejlepší řešení (splní i bonus):', '# Best solution (also meets the bonus):'),
      ...d.best,
      '',
    ];
    put(`${SOLUTIONS_DIR}/${d.id}.sh`, body.join('\n'), 0o755);
  }
}
