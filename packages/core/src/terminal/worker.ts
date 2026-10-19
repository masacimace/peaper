import * as pty from 'node-pty';

type Message =
  | { type: 'start'; workspace: string; shell: string; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'stop' };
let terminal: pty.IPty | undefined;
function send(message: Record<string, unknown>) {
  if (process.connected)
    process.send?.(message, () => {
      /* Parent may have closed IPC. */
    });
}
process.on('message', (raw: Message) => {
  try {
    if (raw.type === 'start' && !terminal) {
      terminal = pty.spawn(
        raw.shell,
        /powershell(?:\.exe)?$/i.test(raw.shell) ? ['-NoLogo', '-NoProfile'] : [],
        {
          cwd: raw.workspace,
          cols: raw.cols,
          rows: raw.rows,
          name: 'xterm-256color',
          useConptyDll: process.platform === 'win32',
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );
      terminal.onData((data) => send({ type: 'output', data }));
      terminal.onExit(({ exitCode }) => {
        if (process.connected)
          process.send?.({ type: 'exit', exitCode }, () => process.exit(exitCode));
        else process.exit(exitCode);
      });
      send({ type: 'ready' });
    }
    if (raw.type === 'input') terminal?.write(raw.data);
    if (raw.type === 'resize') terminal?.resize(raw.cols, raw.rows);
    if (raw.type === 'stop') {
      terminal?.kill();
      setTimeout(() => process.exit(0), 1_500).unref();
    }
  } catch {
    send({ type: 'error', message: 'Native terminal failed. Run peaper doctor for diagnostics.' });
    setTimeout(() => process.exit(1), 20);
  }
});
process.on('disconnect', () => {
  terminal?.kill();
  setTimeout(() => process.exit(0), 1_500).unref();
});
