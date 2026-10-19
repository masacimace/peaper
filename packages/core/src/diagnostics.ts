import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PeaperDatabase } from './storage/database.js';
import { TerminalManager } from './terminal/manager.js';

export async function probeTerminal(workspace: string): Promise<string> {
  const manager = new TerminalManager(workspace);
  try {
    const { terminal } = await manager.create(80, 24);
    return await new Promise<string>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error('PTY input/output timed out after 12 seconds.')),
        12_000,
      );
      // The marker never appears in the input itself, so shell echo cannot pass this probe.
      const marker = 'PEAPER_PTY_OK';
      terminal.onData((data) => {
        output += data;
        if (output.includes(marker)) {
          clearTimeout(timeout);
          resolve(manager.shell);
        }
      });
      terminal.onExit(({ exitCode }) => {
        clearTimeout(timeout);
        if (!output.includes(marker))
          reject(new Error(`Shell exited before PTY probe completed (${exitCode}).`));
      });
      terminal.resize(100, 30);
      const command = /powershell(?:\.exe)?$/i.test(manager.shell)
        ? "[Console]::WriteLine(('PEAPER_' + 'PTY_OK'))"
        : /cmd(?:\.exe)?$/i.test(manager.shell)
          ? 'set "PEAPER_PROBE=PEAPER_"\r\necho %PEAPER_PROBE%PTY_OK'
          : "printf 'PEAPER_%s\\n' 'PTY_OK'";
      terminal.write(`${command}\r`);
    });
  } finally {
    await manager.close();
  }
}

export async function runDiagnostics(workspace: string, migrationsDirectory: string) {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-doctor-'));
  let database: PeaperDatabase | undefined;
  try {
    database = new PeaperDatabase(directory, migrationsDirectory);
    const current = database.workspace(workspace);
    database.createSession(current.id, 'Foundation search probe');
    if (database.listSessions(current.id, 'Foundation').length !== 1)
      throw new Error('FTS5 search probe failed.');
    const shell = await probeTerminal(workspace);
    return {
      node: process.version,
      database: 'SQLite + FTS5 OK',
      schemaVersion: database.schemaVersion,
      shell,
      terminal: 'spawn / input / output / resize / cleanup OK',
    };
  } finally {
    database?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
