import { CmdError } from '../../../core/util.js';
import { getGroups, sessionUser } from '../../../core/users.js';

export default {
  async run(ctx) {
    const who = ctx.args[0];
    const u = who ? sessionUser(ctx.fs, who) : ctx.user;
    if (!u) throw new CmdError(`'${who}': no such user`);
    const groups = getGroups(ctx.fs);
    const names = [u.gid, ...u.gids.filter(g => g !== u.gid)].map(g => groups.find(x => x.gid === g)?.name ?? g);
    await ctx.stdout.write((who ? `${u.name} : ` : '') + names.join(' ') + '\n');
  },
};
