import { CmdError } from '../../../core/util.js';
import { getGroups, sessionUser } from '../../../core/users.js';

export default {
  async run(ctx) {
    const who = ctx.args[0];
    const u = who ? sessionUser(ctx.fs, who) : ctx.user;
    if (!u) throw new CmdError(`'${who}': no such user`);
    const groups = getGroups(ctx.fs);
    const nm = gid => groups.find(g => g.gid === gid)?.name ?? gid;
    const gids = [u.gid, ...u.gids.filter(g => g !== u.gid)];
    await ctx.stdout.write(`uid=${u.uid}(${u.name}) gid=${u.gid}(${nm(u.gid)}) groups=${gids.map(g => `${g}(${nm(g)})`).join(',')}\n`);
  },
};
