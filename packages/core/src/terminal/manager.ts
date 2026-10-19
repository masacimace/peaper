import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export function defaultShell() {
  if (process.platform === 'win32') {
    const windows = process.env.SystemRoot || 'C:\\Windows';
    const powershell = join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return existsSync(powershell) ? powershell : process.env.ComSpec || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

type Exit = { exitCode: number };
type WorkerMessage =
  | { type: 'ready' }
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string };

/** One native PTY per process keeps native handles and failures out of the runtime. */
class TerminalProcess {
  private readonly events = new EventEmitter();
  private readonly child: ChildProcess;
  private stopping?: Promise<void>;
  readonly ready: Promise<void>;
  readonly exited: Promise<void>;

  constructor(workspace: string, shell: string, cols: number, rows: number) {
    const here = dirname(fileURLToPath(import.meta.url));
    const bundled = join(here, 'terminal-worker.js');
    const entry = existsSync(bundled)
      ? bundled
      : resolve(here, '../../../../dist/terminal-worker.js');
    if (!existsSync(entry)) throw new Error('Terminal worker not built. Run pnpm build.');
    this.child = fork(entry, [], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    });
    this.child.stderr?.resume();
    this.exited = new Promise((done) => this.child.once('exit', () => done()));
    this.ready = new Promise((done, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Native terminal startup timed out.'));
        void this.stop();
      }, 12_000);
      this.child.on('message', (raw) => {
        const message = raw as WorkerMessage;
        if (message.type === 'ready') {
          clearTimeout(timeout);
          done();
        }
        if (message.type === 'output') this.events.emit('data', message.data);
        if (message.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(message.message));
        }
      });
      this.child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      this.child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error('Native terminal exited during startup.'));
        this.events.emit('exit', { exitCode: code ?? -1 });
      });
    });
    this.send({ type: 'start', workspace, shell, cols, rows });
  }

  private send(message: Record<string, unknown>) {
    if (this.child.connected)
      this.child.send(message, () => {
        /* A concurrent exit closes IPC. */
      });
  }
  write(data: string) {
    this.send({ type: 'input', data });
  }
  resize(cols: number, rows: number) {
    this.send({ type: 'resize', cols, rows });
  }
  onData(listener: (data: string) => void) {
    this.events.on('data', listener);
    return { dispose: () => this.events.off('data', listener) };
  }
  onExit(listener: (event: Exit) => void) {
    this.events.on('exit', listener);
    return { dispose: () => this.events.off('exit', listener) };
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) return;
      if (process.platform === 'win32' && this.child.pid) {
        // Target only this dedicated worker tree. This releases ConPTY handles without
        // node-pty 1.1's console-list race or its bundled-DLL worker leak.
        const taskkill = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
        await new Promise<void>((done) =>
          execFile(
            taskkill,
            ['/PID', String(this.child.pid), '/T', '/F'],
            { windowsHide: true },
            () => done(),
          ),
        );
      } else {
        this.send({ type: 'stop' });
      }
      const fallback = setTimeout(() => this.child.kill(), 3_000);
      await this.exited;
      clearTimeout(fallback);
    })();
    return this.stopping;
  }
}

export class TerminalManager {
  private readonly terminals = new Map<string, TerminalProcess>();
  readonly shell = defaultShell();
  constructor(readonly workspace: string) {}
  get active() {
    return this.terminals.size;
  }

  async create(cols = 100, rows = 24) {
    if (this.active >= 4)
      throw new Error('Terminal limit reached. Close an existing terminal first.');
    const id = randomUUID();
    const terminal = new TerminalProcess(this.workspace, this.shell, cols, rows);
    this.terminals.set(id, terminal);
    terminal.onExit(() => this.terminals.delete(id));
    try {
      await terminal.ready;
      return { id, terminal };
    } catch (error) {
      await terminal.stop();
      this.terminals.delete(id);
      throw error;
    }
  }

  async stop(id: string) {
    const terminal = this.terminals.get(id);
    if (!terminal) return;
    await terminal.stop();
    this.terminals.delete(id);
  }
  async close() {
    await Promise.all([...this.terminals.keys()].map((id) => this.stop(id)));
  }
}
