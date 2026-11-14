import { parseArgs } from '../../../core/args.js';

// Kráva (nebo tučňák) říká, co jí pošlete: cowsay Ahoj  /  fortune | cowsay
const COW = [
  '        \\   ^__^',
  '         \\  (oo)\\_______',
  '            (__)\\       )\\/\\',
  '                ||----w |',
  '                ||     ||',
];
const TUX = [
  '   \\',
  '    \\   .--.',
  '       |o_o |',
  '       |:_/ |',
  '      //   \\ \\',
  '     (|     | )',
  "    /'\\_   _/`\\",
  '    \\___)=(___/',
];

function wrap(text, width) {
  const out = [];
  for (const para of text.replace(/\n+$/, '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (line && [...line].length + 1 + [...w].length > width) { out.push(line); line = w; }
      else line = line ? line + ' ' + w : w;
    }
    out.push(line);
  }
  return out;
}

export default {
  async run(ctx) {
    const { o, rest } = parseArgs(ctx.args, { bool: 'e', val: 'fW', long: { file: 'f' } });
    const text = rest.length ? rest.join(' ') : await ctx.stdin.readAll();
    const lines = wrap(text.trim() ? text : '...', Math.max(10, +o.W || 40));
    const w = Math.max(...lines.map(l => [...l].length));
    const box = lines.length === 1
      ? [`< ${lines[0]} >`]
      : lines.map((l, i) => {
        const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
        return `${a} ${l}${' '.repeat(w - [...l].length)} ${b}`;
      });
    const art = (o.f === 'tux' ? TUX : COW).map(l => l.replace(/\s+$/, ''));
    await ctx.stdout.write([' ' + '_'.repeat(w + 2), ...box, ' ' + '-'.repeat(w + 2), ...art].join('\n') + '\n');
    return 0;
  },
};
