import { spawn } from 'node:child_process';

export type CommandResult = {
  exitCode: number | null;
  output: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
};
/** Noninteractive agent commands have a separate lifecycle from the user's interactive PTY. */
export async function runCommand(
  command: string,
  cwd: string,
  signal: AbortSignal,
  onOutput: (output: string) => void,
  timeoutMs = 60000,
): Promise<CommandResult> {
  const windows = process.platform === 'win32';
  return runProgram(
    windows ? 'powershell.exe' : '/bin/sh',
    windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command],
    cwd,
    signal,
    onOutput,
    timeoutMs,
  );
}
/** Structured script arguments bypass shell parsing while sharing the command lifecycle. */
export async function runProgram(
  program: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onOutput: (output: string) => void,
  timeoutMs = 60000,
): Promise<CommandResult> {
  signal.throwIfAborted();
  const windows = process.platform === 'win32';
  const child = spawn(program, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: !windows,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
  });
  let output = '';
  let truncated = false;
  let timedOut = false;
  let stopping: Promise<void> | undefined;
  const stop = () => {
    if (stopping) return stopping;
    stopping = new Promise<void>((done) => {
      if (!child.pid) return done();
      if (windows) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        killer.once('error', () => {
          child.kill();
          done();
        });
        killer.once('close', () => done());
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Already exited. */
        }
        done();
      }
    });
    return stopping;
  };
  const receive = (data: string) => {
    const remaining = 32000 - output.length;
    if (data.length > remaining) truncated = true;
    if (remaining > 0) {
      output += data.slice(0, remaining);
      onOutput(output);
    }
  };
  child.stdout.setEncoding('utf8').on('data', receive);
  child.stderr.setEncoding('utf8').on('data', receive);
  const cancel = () => {
    void stop();
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    void stop();
  }, timeoutMs);
  try {
    const exitCode = await new Promise<number | null>((done, reject) => {
      child.once('error', reject);
      child.once('close', (code) => done(code));
    });
    await stopping;
    return { exitCode, output, truncated, timedOut, cancelled: signal.aborted };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
