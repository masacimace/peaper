#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import open from 'open';
import { runDiagnostics } from '@peaper/core';
import { createPeaperServer } from '@peaper/server';
import { printBanner } from './banner.js';
import manifest from '../../../package.json';

const help = `Peaper — your local coding workspace

Usage: peaper [doctor] [options]

  --port <number>      Local HTTP port (default: 4317; 0 selects a free port)
  --no-open            Print the local URL without opening a browser
  --workspace <path>   Workspace directory (default: current directory)
  --data-dir <path>    Data directory (default: ~/.peaper)
  --version, -v        Print version
  --help, -h           Show this help

  doctor              Verify SQLite/FTS5 and the native terminal lifecycle
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      'no-open': { type: 'boolean' },
      workspace: { type: 'string' },
      'data-dir': { type: 'string' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.version) {
    console.log(manifest.version);
    return;
  }
  if (positionals.length > 1 || (positionals[0] && positionals[0] !== 'doctor'))
    throw new Error('Unknown command. Run peaper --help.');
  const workspace = resolve(values.workspace ?? process.cwd());
  if (!existsSync(workspace) || !statSync(workspace).isDirectory())
    throw new Error(`Workspace is not a directory: ${workspace}`);
  const bundled = dirname(fileURLToPath(import.meta.url));
  const distributionDirectory = existsSync(join(bundled, 'migrations'))
    ? bundled
    : resolve(bundled, '../../../dist');
  if (positionals[0] === 'doctor') {
    const result = await runDiagnostics(workspace, join(distributionDirectory, 'migrations'));
    console.log(`PEAPER doctor · ${manifest.version}`);
    for (const [name, value] of Object.entries(result)) console.log(`  OK  ${name}: ${value}`);
    console.log('  NOTE Terminal runs with host permissions; OS sandbox is not enabled.');
    return;
  }
  const rawPort = values.port ?? '4317';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535)
    throw new Error('--port must be an integer from 0 to 65535.');
  const port = Number(rawPort);
  const dataDirectory = resolve(
    values['data-dir'] ?? process.env.PEAPER_DATA_DIR ?? join(homedir(), '.peaper'),
  );
  const developmentFrontend = process.env.PEAPER_DEV_FRONTEND
    ? (await import(pathToFileURL(process.env.PEAPER_DEV_FRONTEND).href)).createDevelopmentFrontend
    : undefined;
  const runtime = await createPeaperServer({
    workspace,
    dataDirectory,
    distributionDirectory,
    version: manifest.version,
    createDevelopmentFrontend: developmentFrontend,
    token: developmentFrontend ? process.env.PEAPER_DEV_TOKEN : undefined,
  });
  let address: string;
  try {
    address = await runtime.app.listen({ host: '127.0.0.1', port });
  } catch (error) {
    await runtime.app.close();
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE')
      throw new Error(`Port ${port} is already in use. Choose --port <number> or --port 0.`);
    throw error;
  }
  const url = `${address}/#token=${runtime.token}`;
  printBanner({
    version: manifest.version,
    workspace: runtime.workspace.path,
    url,
    dataDirectory,
    sessions: runtime.database.listSessions(runtime.workspace.id).length,
  });
  if (developmentFrontend) console.log('  Development · Vite HMR + React Fast Refresh enabled\n');
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log('\nStopping Peaper…');
    await runtime.app.close();
    if (process.connected) process.disconnect?.();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  if (developmentFrontend && process.send) {
    process.on('message', (message) => {
      if (message === 'peaper:shutdown') void shutdown();
    });
    process.once('disconnect', () => void shutdown());
  }
  if (!values['no-open']) {
    try {
      await open(url);
    } catch {
      console.error('Could not open the browser. Use the local URL printed above.');
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Peaper: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
