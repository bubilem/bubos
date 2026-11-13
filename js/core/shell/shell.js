// Shell: stav relace (uživatel, cwd, proměnné, aliasy, historie) a spouštění příkazů.
import { parse, SyntaxErr } from './parse.js';
import { expandWord, expandString } from './expand.js';
import { complete } from './complete.js';
import { Pipe, Stdin, StringWriter, FileWriter } from '../streams.js';
import { CmdError, Interrupt, BrokenPipe, Logout, ScriptExit, Restart, tick } from '../util.js';
import { FsError, resolvePath, can, R, X } from '../vfs.js';
import { t, getLang } from '../i18n.js';

export class Shell {
  // user = objekt relace (viz users.sessionUser); tty = rozhraní terminálu (write, readLine, …)
  constructor(machine, user, { tty, parent = null } = {}) {
    this.m = machine; this.fs = machine.fs; this.os = machine.os;
    this.tty = tty; this.parent = parent;
    this.stack = []; this.fg = new Set();
    this.status = 0; this.jobN = 0; this.args = []; this.scriptName = 'bash';
    this.history = [];
    this._w = 0;
    const isTTY = tty?.isTTY ?? true;
    this.ttyOut = { isTTY, write: async s => { tty.write(s); if ((++this._w & 255) === 0) await tick(); }, end() {} };
    this.ttyErr = { isTTY, write: async s => { tty.write(s, 'err'); }, end() {} };
    this.base = { stdin: Stdin.fromString(''), stdout: this.ttyOut, stderr: this.ttyErr };
    if (parent) {
      this.aliases = { ...parent.aliases };
      this.user = user; this.cwd = parent.cwd; this.proc = parent.proc;
      this.vars = Object.assign(Object.create(null), parent.vars);
      this.exported = new Set(parent.exported);
    } else {
      this.aliases = {};
      this._init(user);
    }
  }

  _init(user, cwd) {
    this.user = user;
    this.vars = Object.assign(Object.create(null), {
      HOME: user.home, USER: user.name, LOGNAME: user.name, SHELL: user.shell, PATH: this.os.path,
      PWD: '', OLDPWD: '', HOSTNAME: this.m.hostname, TERM: 'xterm-256color',
      LANG: getLang() === 'cs' ? 'cs_CZ.UTF-8' : 'en_US.UTF-8',
    });
    this.exported = new Set(Object.keys(this.vars));
    this.cwd = cwd ?? (this.fs.exists(user.home, user) ? user.home : '/');
    this.vars.PWD = this.cwd;
    this.proc = this.m.procs.spawn({ user: user.name, cmd: '-bash', ppid: 1 });
  }

  async start() {
    this.history = this._readHistory();
    const rc = this.user.home + '/.bashrc';
    if (this.fs.exists(rc, this.user)) {
      try { await this.source(rc, this.base); } catch (e) { if (!(e instanceof Interrupt)) throw e; }
    }
  }
  end() {
    for (const s of [{ proc: this.proc }, ...this.stack]) this.m.procs.end(s.proc);
  }

  // --- uživatel / su ---
  async pushUser(user, login) {
    this.stack.push({ user: this.user, cwd: this.cwd, vars: this.vars, exported: this.exported, proc: this.proc, history: this.history, aliases: this.aliases });
    const keep = login ? undefined : this.cwd;
    this.aliases = {};
    this._init(user, keep);
    await this.start();
  }
  popUser() {
    const s = this.stack.pop();
    this.m.procs.end(this.proc);
    Object.assign(this, s);
  }

  // --- proměnné ---
  getVar(name) {
    if (name === '?') return String(this.status);
    if (name === '$') return String(this.proc.pid);
    if (/^\d$/.test(name)) return name === '0' ? this.scriptName : this.args[+name - 1];
    return this.vars[name];
  }
  setVar(k, v) { this.vars[k] = v; }
  envObject() {
    const o = {};
    for (const k of this.exported) if (k in this.vars) o[k] = this.vars[k];
    return o;
  }
  prompt() { return this.os.prompt(this); }
  complete(line, cursor) { return complete(this, line, cursor); }
  interrupt() { for (const p of this.fg) p.ac.abort(); }

  // --- historie (ukládá se do ~/.bash_history, tedy i do exportu) ---
  _histPath() { return this.user.home + '/.bash_history'; }
  _readHistory() {
    try { return this.fs.read(this._histPath(), this.user).split('\n').filter(Boolean); } catch { return []; }
  }
  addHistory(line) {
    if (line.startsWith(' ') || this.history.at(-1) === line) return;
    this.history.push(line);
    try {
      if (this.history.length > 1000) {
        this.history = this.history.slice(-500);
        this.fs.write(this._histPath(), this.history.join('\n') + '\n', this.user);
      } else this.fs.write(this._histPath(), line + '\n', this.user, true);
    } catch { /* domovský adresář nemusí být zapisovatelný */ }
  }
  clearHistory() {
    this.history = [];
    try { this.fs.write(this._histPath(), '', this.user); } catch { /* nic */ }
  }
  _histExpand(line) {
    const m = /^!(!|\d+|[^\s!].*)$/.exec(line.trim());
    if (!m) return line;
    const h = this.history;
    const found = m[1] === '!' ? h.at(-1) : /^\d+$/.test(m[1]) ? h[+m[1] - 1] : [...h].reverse().find(x => x.startsWith(m[1]));
    if (!found) throw new CmdError(`${line.trim()}: event not found`);
    return found;
  }

  // --- spouštění ---
  // Interaktivní řádek z terminálu
  async run(line) {
    let expanded;
    try { expanded = this._histExpand(line); }
    catch (e) { if (e instanceof CmdError) { await this.ttyErr.write(`bash: ${e.message}\n`); return (this.status = 1); } throw e; }
    if (expanded !== line) await this.ttyOut.write(expanded + '\n');
    if (!expanded.trim()) return this.status;
    this.addHistory(expanded);
    const io = {
      stdin: new Stdin(async () => {
        const l = await this.tty.readLine({ prompt: '' });
        return l === null ? null : l + '\n';
      }, () => {}, { sticky: false }),
      stdout: this.ttyOut, stderr: this.ttyErr,
    };
    this.base = io;
    return this.runLine(expanded, io);
  }

  async runLine(line, io) {
    let ast;
    try { ast = parse(line, { aliases: this.aliases }); }
    catch (e) {
      if (e instanceof SyntaxErr) { await io.stderr.write(`bash: ${e.message}\n`); return (this.status = 2); }
      throw e;
    }
    return (this.status = await this.runAst(ast, io));
  }

  async runLines(text, io) {
    let st = this.status;
    try {
      for (const line of text.split('\n')) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        st = await this.runLine(line, io);
        if (st === 130) break;
      }
    } catch (e) { if (e instanceof ScriptExit) return e.code; throw e; }
    return st;
  }

  async source(path, io = this.base) {
    return this.runLines(this.fs.read(resolvePath(this.cwd, path), this.user), io);
  }

  async runAst(ast, io) {
    let st = this.status;
    for (const it of ast.items) {
      if (it.op === '&&' && st !== 0) continue;
      if (it.op === '||' && st === 0) continue;
      if (it.bg) { this._background(it, io); st = 0; }
      else st = await this._startPipeline(it.pipe, io).promise;
      this.status = st;
      if (st === 130) break;
    }
    return st;
  }

  // Výstup příkazu pro $(...)
  async capture(src) {
    const out = new StringWriter();
    const ast = parse(src, { aliases: this.aliases });
    await this.runAst(ast, { stdin: Stdin.fromString(''), stdout: out, stderr: this.base.stderr });
    return out.text.replace(/\n+$/, '');
  }

  _background(it, io) {
    const n = ++this.jobN;
    const { procs, promise } = this._startPipeline(it.pipe, { ...io, stdin: Stdin.fromString('') }, { bg: true });
    const last = procs.at(-1);
    io.stderr.write(`[${n}] ${last.pid}\n`);
    promise.then(() => this.tty?.write(`[${n}]+  ${last.ac.signal.aborted ? 'Terminated' : 'Done'}                    ${last.cmd}\n`)).catch(() => {});
  }

  // Spustí všechny příkazy roury souběžně; procesy se zakládají hned (kvůli PID u &)
  _startPipeline(pipe, io, { bg = false } = {}) {
    const n = pipe.cmds.length;
    const procs = pipe.cmds.map(() => this.m.procs.spawn({ user: this.user.name, cmd: '', ppid: this.proc.pid }));
    if (!bg) procs.forEach(p => this.fg.add(p));
    const pipes = Array.from({ length: n - 1 }, () => new Pipe());
    const stages = pipe.cmds.map((cmd, k) => {
      const stdin = k === 0 ? io.stdin : new Stdin(() => pipes[k - 1].read(), () => pipes[k - 1].close());
      const stdout = k === n - 1 ? io.stdout : pipes[k];
      return this._runCommand(cmd, { stdin, stdout, stderr: io.stderr }, procs[k]).finally(() => {
        pipes[k]?.end();
        if (k > 0) stdin.close();
        this.fg.delete(procs[k]);
        this.m.procs.end(procs[k]);
      });
    });
    return { procs, promise: Promise.all(stages).then(r => r[n - 1]) };
  }

  async _runCommand(cmd, io, proc) {
    try {
      const assigns = [];
      for (const a of cmd.assigns) assigns.push([a.name, await expandString(a.parts, this)]);
      const argv = [];
      for (const w of cmd.words) argv.push(...await expandWord(w, this));
      io = await this._redirect(cmd.redirs, io);
      if (!argv.length) {
        for (const [k, v] of assigns) this.setVar(k, v);
        return 0;
      }
      proc.cmd = argv.join(' ');
      const env = this.envObject();
      for (const [k, v] of assigns) env[k] = v;
      return await this._invoke(argv, io, proc, { env });
    } catch (e) {
      return this._report(e, 'bash', io.stderr);
    }
  }

  async _redirect(redirs, io) {
    io = { ...io };
    const fdName = ['stdin', 'stdout', 'stderr'];
    for (const r of redirs) {
      const target = await expandString(r.target, this);
      if (r.op === '>&') {
        if (!/^[12]$/.test(target)) throw new CmdError(`${target}: ambiguous redirect`);
        io[fdName[r.fd]] = io[fdName[+target]];
        continue;
      }
      const path = resolvePath(this.cwd, target);
      try {
        if (r.op === '<') io.stdin = Stdin.fromString(this.fs.read(path, this.user));
        else {
          const w = new FileWriter(this.fs, path, this.user, r.op === '>>');
          w.open();
          if (r.op === '&>') io.stdout = io.stderr = w;
          else if (r.fd === 2) io.stderr = w;
          else io.stdout = w;
        }
      } catch (e) { if (e instanceof FsError) e.path = target; throw e; }
    }
    return io;
  }

  // Najde příkaz: vestavěný, soubor v PATH / zadané cestě (stub pro příkaz nebo skript)
  lookup(name, user = this.user) {
    if (this.os.builtins.includes(name)) return { kind: 'cmd', mod: name };
    const dirs = name.includes('/') ? [null] : (this.vars.PATH || '').split(':').filter(Boolean);
    for (const d of dirs) {
      const full = resolvePath(this.cwd, d === null ? name : d + '/' + name);
      let n;
      try { n = this.fs.stat(full, user); }
      catch (e) {
        if (d === null) return { error: e.code === 'ENOENT' ? 'nofile' : e.code };
        continue;
      }
      if (n.type === 'dir') { if (d === null) return { error: 'EISDIR' }; continue; }
      if (!can(n, user, X)) { if (d === null) return { error: 'EACCES' }; continue; }
      const m = /^#!bubos:(\S+)/.exec(n.data);
      if (m && this.os.commands.includes(m[1])) return { kind: 'cmd', mod: m[1] };
      if (!can(n, user, R)) return { error: 'EACCES' };
      return { kind: 'script', data: n.data };
    }
    return { error: 'notfound' };
  }

  async _invoke(argv, io, proc, { user = this.user, env = this.envObject() } = {}) {
    const name = argv[0];
    const hit = this.lookup(name, user);
    if (hit.error) {
      const msg = { notfound: t('sh.notfound'), nofile: t('err.ENOENT') }[hit.error] ?? t('err.' + hit.error);
      await io.stderr.write(`bash: ${name}: ${msg}\n`);
      return hit.error === 'notfound' || hit.error === 'nofile' ? 127 : 126;
    }
    if (hit.kind === 'script') return this._runScript(hit.data, argv, io, user, env);
    const isBuiltin = this.os.builtins.includes(name);
    const prog = isBuiltin ? 'bash: ' + name : name;
    if (!isBuiltin && argv[1] === '--help') {
      const page = (await this.os.loadMan(getLang()))[hit.mod];
      if (page) { await io.stdout.write(page.replace(/^\n+/, '') + '\n'); return 0; }
    }
    let mod;
    try { mod = (await this.os.loadCommand(hit.mod)).default; }
    catch (e) { console.error(e); await io.stderr.write(`bash: ${name}: ${t('sh.loadfail')}\n`); return 126; }

    const self = this, signal = proc.ac.signal;
    const ctx = {
      name: hit.mod, prog, argv, args: argv.slice(1), ...io,
      sh: this, fs: this.fs, m: this.m, os: this.os, user, env, tty: this.tty, signal, proc, t,
      get cwd() { return self.cwd; },
      path: p => resolvePath(self.cwd, p),
      fsMsg: e => t('err.' + e.code),
      check() { if (signal.aborted) throw new Interrupt(); },
      exec: (argv2, o = {}) => self._runDetached(argv2, { stdin: io.stdin, stdout: io.stdout, stderr: io.stderr }, o),
      // projde operandy; chyby souborového systému vypíše a pokračuje dalším (vrací 0/1)
      each: async (list, fn, verb) => {
        let st = 0;
        for (const a of list) {
          ctx.check();
          try { await fn(a); }
          catch (e) {
            if (!(e instanceof FsError || e instanceof CmdError)) throw e;
            const msg = e instanceof FsError ? `${verb ? `${verb} '${a}'` : a}: ${t('err.' + e.code)}` : e.message;
            await io.stderr.write(`${prog}: ${msg}\n`);
            st = 1;
          }
        }
        return st;
      },
    };
    try {
      const r = await mod.run(ctx);
      return typeof r === 'number' ? r : 0;
    } catch (e) {
      return this._report(e, prog, io.stderr);
    }
  }

  // Spuštění z jiného příkazu (sudo, find -exec) – vlastní proces
  async _runDetached(argv, io, o = {}) {
    const proc = this.m.procs.spawn({ user: (o.user ?? this.user).name, cmd: argv.join(' '), ppid: this.proc.pid });
    this.fg.add(proc);
    try { return await this._invoke(argv, io, proc, { user: o.user, env: o.env }); }
    finally { this.fg.delete(proc); this.m.procs.end(proc); }
  }

  async _runScript(text, argv, io, user, env) {
    const child = new Shell(this.m, user, { tty: this.tty, parent: this });
    child.args = argv.slice(1); child.scriptName = argv[0]; child.base = io;
    for (const [k, v] of Object.entries(env)) { child.vars[k] = v; child.exported.add(k); }
    return child.runLines(text, io);
  }

  async _report(e, prog, stderr) {
    if (e instanceof Logout || e instanceof ScriptExit || e instanceof Restart) throw e;
    if (e instanceof Interrupt) return 130;
    if (e instanceof BrokenPipe) return 141;
    const w = async s => { try { await stderr.write(s + '\n'); } catch { /* nic */ } };
    if (e instanceof CmdError) {
      await w(`${prog}: ${e.message}`);
      if (e.hint) await w(`Try '${prog.replace(/^bash: /, '')} --help' for more information.`);
      return e.code;
    }
    if (e instanceof FsError) { await w(`${prog}: ${e.path ? e.path + ': ' : ''}${t('err.' + e.code)}`); return 1; }
    if (e instanceof SyntaxErr) { await w(`bash: ${e.message}`); return 2; }
    console.error(e);
    await w(`${prog}: internal error: ${e.message}`);
    return 70;
  }
}
