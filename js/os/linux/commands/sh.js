import { parse, SyntaxErr, IncompleteErr } from '../../../core/shell/parse.js';
import { CmdError, Interrupt, ScriptExit } from '../../../core/util.js';
import { FsError } from '../../../core/vfs.js';

// Vnořený interaktivní shell: čte řádky, dokud nepřijde exit nebo Ctrl+D
async function interactive(ctx, sh, io) {
  let st = 0;
  for (;;) {
    try {
      let text = await ctx.tty.readLine({ prompt: '$ ' });
      if (text === null) return st;
      for (;;) {
        try { parse(text); break; }
        catch (e) {
          if (!(e instanceof IncompleteErr)) break; // chybu vypíše runLine
          const more = await ctx.tty.readLine({ prompt: '> ' });
          if (more === null) break;
          text += '\n' + more;
        }
      }
      st = await sh.runLine(text, io);
    } catch (e) {
      if (e instanceof ScriptExit) return e.code;
      if (e instanceof Interrupt) st = sh.status = 130;
      else if (e instanceof SyntaxErr) st = sh.status = 2;
      else throw e;
    }
  }
}

// sh / bash [-e] [-c PŘÍKAZY [jméno arg…] | soubor arg…]
export default {
  async run(ctx) {
    const args = [...ctx.args];
    let errexit = false, command = false, fromStdin = false;
    while (args.length && /^[-+]./.test(args[0])) {
      const a = args.shift();
      if (a === '--') break;
      for (const f of a.slice(1)) {
        if (f === 'e') errexit = a[0] === '-';
        else if (f === 'c') command = true;
        else if (f === 's') fromStdin = true;
        else throw new CmdError(`${a[0]}${f}: invalid option`, 2);
      }
    }

    const io = { stdin: ctx.stdin, stdout: ctx.stdout, stderr: ctx.stderr };
    const sh = ctx.sh.newShell(io, { user: ctx.user, env: ctx.env, proc: ctx.proc });
    sh.opts.e = errexit;
    sh.scriptName = ctx.argv[0];
    let text;
    if (command) {
      if (!args.length) throw new CmdError('-c: option requires an argument', 2);
      text = args.shift();
      if (args.length) sh.scriptName = args.shift();
      sh.args = args;
    } else if (args.length && !fromStdin) {
      const file = args.shift();
      try { text = ctx.fs.read(ctx.path(file), ctx.user); }
      catch (e) {
        if (!(e instanceof FsError)) throw e;
        throw new CmdError(`${file}: ${ctx.fsMsg(e)}`, e.code === 'ENOENT' ? 127 : 126);
      }
      sh.scriptName = file;
      sh.args = args;
    } else {
      sh.args = args;
      // vstup z terminálu (ne z roury ani souboru)
      if (ctx.stdin.sticky === false) return sh.runToEnd(() => interactive(ctx, sh, io), io);
      text = await ctx.stdin.readAll();
    }
    return sh.runToEnd(() => sh.runLine(text, io), io);
  },
};
