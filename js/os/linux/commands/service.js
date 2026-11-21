import { CmdError } from '../../../core/util.js';
import { UNITS, isActive } from '../services.js';

// service NAME start|stop|restart|status|reload   (starší rozhraní, volá systemctl)
export default {
  async run(ctx) {
    if (ctx.args[0] === '--status-all') {
      for (const n of Object.keys(UNITS)) await ctx.stdout.write(` [ ${isActive(ctx.m, n) ? '+' : '-'} ]  ${n}\n`);
      return 0;
    }
    if (ctx.args.length < 2) throw new CmdError('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]', 1);
    const [name, verb] = ctx.args;
    if (!['start', 'stop', 'restart', 'reload', 'status', 'force-reload'].includes(verb)) throw new CmdError(`Usage: ${name} {start|stop|restart|reload|status}`, 1);
    return ctx.exec(['systemctl', verb === 'force-reload' ? 'reload' : verb, name]);
  },
};
