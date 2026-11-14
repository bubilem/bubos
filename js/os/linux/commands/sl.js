import { getLang } from '../../../core/i18n.js';

// Vlak, který se objeví, když si splete ls a sl
export default {
  async run(ctx) {
    const train = [
      '      ====        ________                ___________',
      '  _D _|  |_______/        \\__I_I_____===__|_________|',
      '   |(_)---  |   H\\________/ |   |        =|___ ___|',
      '   /     |  |   H  |  |     |   |         ||_| |_||',
      '  |      |  |   H  |__--------------------| [___] |',
      '  | ________|___H__/__|_____/[][]~\\_______|       |',
      '  |/ |   |-----------I_____I [][] []  D   |=======|__',
      ' __/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__',
      '  |/-=|___|=    ||    ||    ||    |_____/~\\___/',
      '   \\_/      \\_O=====O=====O=====O/      \\_/',
    ];
    await ctx.stdout.write(train.join('\n') + '\n');
    await ctx.stdout.write((getLang() === 'cs' ? 'Překlep? Chtěl(a) jsi napsat „ls“.' : 'A typo? You meant "ls".') + '\n');
    return 0;
  },
};
