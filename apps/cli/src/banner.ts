import pc from 'picocolors';

export function printBanner(details: {
  version: string;
  workspace: string;
  url: string;
  dataDirectory: string;
  sessions: number;
}) {
  const wide = Boolean(process.stdout.isTTY && (process.stdout.columns || 80) >= 72);
  console.log('');
  if (wide) console.log(pc.green('  █▀█ █▀▀ ▄▀█ █▀█ █▀▀ █▀█\n  █▀▀ ██▄ █▀█ █▀▀ ██▄ █▀▄'));
  else console.log(pc.bold(pc.green('  PEAPER')));
  console.log(`  Your local coding workspace  ${pc.dim(`v${details.version}`)}\n`);
  console.log(`  ${pc.green('●')} Ready on loopback`);
  console.log(`  Workspace  ${details.workspace}`);
  console.log(`  Open       ${pc.cyan(details.url)}`);
  console.log(`  Data       ${details.dataDirectory}`);
  console.log(`  Storage    SQLite · FTS5 · ${details.sessions} sessions`);
  console.log(`\n  ${pc.dim('Ctrl+C to stop the runtime and its terminals.')}\n`);
}
