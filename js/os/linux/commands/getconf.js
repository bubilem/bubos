import { CmdError } from '../../../core/util.js';

// Simulované hodnoty, jaké by vrátil běžný 64bitový Linux
const VALUES = {
  _POSIX_VERSION: '200809', _POSIX2_VERSION: '200809', _XOPEN_VERSION: '700', ARG_MAX: '2097152', CHILD_MAX: '4096',
  CLK_TCK: '100', LINE_MAX: '2048', LONG_BIT: '64', NAME_MAX: '255', OPEN_MAX: '1024', PAGE_SIZE: '4096', PAGESIZE: '4096',
  PATH_MAX: '4096', PIPE_BUF: '4096', _NPROCESSORS_ONLN: '1', PATH: '/bin:/usr/bin',
};

export default {
  async run(ctx) {
    const [name] = ctx.args;
    if (name === undefined) throw new CmdError('usage: getconf VARIABLE | getconf -a', 2);
    if (name === '-a') {
      for (const [k, v] of Object.entries(VALUES)) await ctx.stdout.write(`${k.padEnd(34)}${v}\n`);
      return 0;
    }
    if (!Object.hasOwn(VALUES, name)) throw new CmdError(`Unrecognized variable \`${name}'`);
    await ctx.stdout.write(VALUES[name] + '\n');
    return 0;
  },
};
