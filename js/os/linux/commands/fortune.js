import { getLang } from '../../../core/i18n.js';

// Náhodné moudro z IT světa
const CS = [
  'Odpověď na život, vesmír a vůbec je 42. Jen nikdo neví, jaká byla otázka.',
  'Funguje to? Nesahej na to.',
  'Na mém počítači to funguje.',
  'Existuje 10 druhů lidí: ti, kdo rozumí binárně, a ti, kdo ne.',
  'Neexistuje domov jako 127.0.0.1.',
  'Mazání souborů je jako smrt: pod sudo nevratné.',
  'Kdo čte manuál, ten nepotřebuje fórum. Kdo nečte, ten má o čem psát.',
  'Chyba není v kódu. Chyba je mezi klávesnicí a židlí.',
  'Zálohy dělají jen ti, kdo už o data přišli.',
  'Dobrý programátor se dívá na obě strany jednosměrné ulice.',
  'Předčasná optimalizace je kořenem všeho zla. (Donald Knuth)',
  'Nejdřív to zkus vypnout a zapnout.',
  'Pozor na pondělní nasazení do produkce. A na páteční.',
  'Kód se čte víckrát, než se píše.',
  'Hello, World! – každá cesta začíná jedním printf.',
  'rm -rf / je skvělý nápad. Pro někoho jiného.',
  'Tab je nejlepší kamarád shellu. Šipka nahoru druhý.',
  'Alan Turing by byl na tento simulátor pyšný. Možná.',
];
const EN = [
  'The answer to life, the universe and everything is 42. Nobody remembers the question.',
  "If it works, don't touch it.",
  'It works on my machine.',
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "There's no place like 127.0.0.1.",
  'Deleting files is like dying: irreversible under sudo.',
  'Those who read the manual need no forum. Those who do not have lots to post.',
  'The bug is not in the code. The bug is between the keyboard and the chair.',
  'Only people who have lost data make backups.',
  'A good programmer looks both ways before crossing a one-way street.',
  'Premature optimization is the root of all evil. (Donald Knuth)',
  'First try turning it off and on again.',
  'Beware of Monday deployments to production. And Friday ones.',
  'Code is read more often than it is written.',
  'Hello, World! – every journey starts with a single printf.',
  'rm -rf / is a great idea. For somebody else.',
  "Tab is the shell's best friend. Arrow-up is the second.",
  'Alan Turing would be proud of this simulator. Maybe.',
];

export default {
  async run(ctx) {
    const list = getLang() === 'cs' ? CS : EN;
    await ctx.stdout.write(list[Math.floor(Math.random() * list.length)] + '\n');
    return 0;
  },
};
