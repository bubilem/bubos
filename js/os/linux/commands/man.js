import { CmdError } from '../../../core/util.js';
import { getLang } from '../../../core/i18n.js';

const HEAD = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]*$/;

export default {
  async run(ctx) {
    const name = ctx.args[0];
    if (!name) throw new CmdError('What manual page do you want?');
    const pages = await ctx.os.loadMan(getLang());
    const page = pages[name];
    if (!page) throw new CmdError(`No manual entry for ${name}`);
    const text = `\x1b[1m${name.toUpperCase()}(1)\x1b[0m\n\n` + page.split('\n').map(l => (HEAD.test(l) ? `\x1b[1m${l}\x1b[0m` : l)).join('\n') + '\n';
    if (ctx.stdout.isTTY && ctx.tty?.pager) await ctx.tty.pager(text, { title: 'man ' + name });
    else await ctx.stdout.write(text);
  },
};
