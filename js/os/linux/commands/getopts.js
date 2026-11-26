import { CmdError } from '../../../core/util.js';

// getopts SEZNAM proměnná [argumenty] – po jedné zpracuje volby; stav drží $OPTIND a sh.optPos
export default {
  async run(ctx) {
    const sh = ctx.sh;
    const [spec, name, ...given] = ctx.args;
    if (name === undefined) throw new CmdError('usage: getopts optstring name [arg ...]', 2);
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new CmdError(`\`${name}': not a valid identifier`, 2);
    const args = given.length ? given : sh.args;
    const silent = spec.startsWith(':');
    let ind = Math.max(1, parseInt(sh.vars.OPTIND, 10) || 1);
    let pos = ind === sh.optPos.ind ? sh.optPos.pos : 1; // po ručním OPTIND=1 se začíná znovu
    const word = args[ind - 1];

    const save = () => { sh.setVar('OPTIND', String(ind)); sh.optPos = { ind, pos }; };
    const nextWord = () => { ind++; pos = 1; };
    delete sh.vars.OPTARG;

    if (word === undefined || pos >= word.length || (pos === 1 && (word[0] !== '-' || word === '-' || word === '--'))) {
      if (word === '--') nextWord();
      sh.setVar(name, '?');
      save();
      return 1;
    }

    const c = word[pos++];
    const k = c === ':' ? -1 : spec.indexOf(c);
    let value = c, error = null;
    if (k < 0) {
      value = '?';
      error = 'illegal option';
      if (pos >= word.length) nextWord();
    } else if (spec[k + 1] === ':') {
      if (pos < word.length) { sh.setVar('OPTARG', word.slice(pos)); nextWord(); }
      else if (args[ind] !== undefined) { sh.setVar('OPTARG', args[ind]); nextWord(); ind++; }
      else {
        nextWord();
        value = silent ? ':' : '?';
        error = 'option requires an argument';
      }
    } else if (pos >= word.length) nextWord();

    if (error) {
      if (silent) sh.setVar('OPTARG', c);
      else await ctx.stderr.write(`${sh.scriptName}: ${error} -- ${c}\n`);
    }
    sh.setVar(name, value);
    save();
    return 0;
  },
};
