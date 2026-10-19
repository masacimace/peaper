import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'peaper-package-'));
// Use npm's JS entry point rather than a Windows .cmd shim or a shell.
const npmEntry = process.env.npm_execpath?.replace(/[\\/]pnpm(?:\.c?js)?$/, '/npm') || '';
const nodeDirectory = dirname(process.execPath);
const candidates = [join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js')];
let npm;
for (const candidate of candidates) {
  try {
    await readFile(candidate);
    npm = candidate;
    break;
  } catch {
    /* Try the next known location. */
  }
}
if (!npm)
  throw new Error(`npm-cli.js not found beside Node.js. npm runner: ${npmEntry || 'unknown'}`);

function capture(args, cwd, timeout = 120_000) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out: ${args.join(' ')}`));
    }, timeout);
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.stderr.on('data', (value) => {
      stderr += value;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) done(stdout);
      else reject(new Error(`${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

let runtime;
async function startInstalled(launcher, consumer) {
  runtime = spawn(
    process.execPath,
    [launcher, '--no-open', '--port', '0', '--data-dir', join(temporaryRoot, 'user-data')],
    { cwd: consumer, windowsHide: true },
  );
  let stdout = '';
  let stderr = '';
  return await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Installed runtime did not start. ${stderr}`)),
      20_000,
    );
    runtime.stdout.on('data', (data) => {
      stdout += data;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]+/);
      if (match) {
        clearTimeout(timer);
        done(match[0]);
      }
    });
    runtime.stderr.on('data', (data) => {
      stderr += data;
    });
    runtime.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    runtime.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Runtime exited ${code}: ${stderr}`));
    });
  });
}
async function stopInstalled() {
  if (runtime && runtime.exitCode === null) {
    const exited = new Promise((done) => runtime.once('exit', done));
    runtime.kill();
    await exited;
  }
}
try {
  console.log('Packing the distribution…');
  const packOutput = await capture(
    [npm, 'pack', '--json', '--pack-destination', temporaryRoot],
    root,
  );
  const packed = JSON.parse(packOutput.slice(packOutput.indexOf('[\n')))[0];
  const files = packed.files.map((file) => file.path);
  assert.ok(files.includes('dist/cli.js'));
  assert.ok(files.includes('dist/terminal-worker.js'));
  assert.ok(files.includes('dist/web/index.html'));
  assert.ok(files.includes('dist/migrations/0001_foundation.sql'));
  assert.ok(
    !files.some(
      (file) => file.includes('node_modules') || file.startsWith('docs/') || file.includes('.env'),
    ),
  );
  const consumer = join(temporaryRoot, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'peaper-install-probe', private: true }),
  );
  console.log('Installing tarball in a clean directory outside the repository…');
  await capture(
    [npm, 'install', '--no-audit', '--no-fund', join(temporaryRoot, packed.filename)],
    consumer,
    240_000,
  );
  const launcher = join(consumer, 'node_modules/@peaper/local/dist/cli.js');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal((await capture([launcher, '--version'], consumer)).trim(), manifest.version);
  const bin = await readFile(
    join(consumer, 'node_modules/.bin', process.platform === 'win32' ? 'peaper.cmd' : 'peaper'),
    'utf8',
  );
  assert.match(bin, /cli\.js/);
  assert.equal(
    (await capture([npm, 'exec', '--offline', '--', 'peaper', '--version'], consumer)).trim(),
    manifest.version,
  );
  console.log((await capture([launcher, 'doctor'], consumer)).trim());
  console.log('Starting the installed package and checking its HTTP assets and persistence…');
  const url = await startInstalled(launcher, consumer);
  const address = new URL(url);
  const token = new URLSearchParams(address.hash.slice(1)).get('token');
  const headers = { Authorization: `Bearer ${token}` };
  const health = await (await fetch(`${address.origin}/api/health`, { headers })).json();
  assert.equal(health.database.fts5, true);
  const workspace = await (await fetch(`${address.origin}/api/workspace`, { headers })).json();
  assert.equal(workspace.path.toLowerCase(), consumer.toLowerCase());
  const html = await (await fetch(address.origin)).text();
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+)"/g))
    assert.equal(
      (await fetch(new URL(asset, address.origin))).status,
      200,
      `Missing asset: ${asset}`,
    );
  const created = await fetch(`${address.origin}/api/sessions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Installed package proof' }),
  });
  assert.equal(created.status, 201);
  const persistedSession = await created.json();
  const conflict = await capture(
    [
      launcher,
      '--no-open',
      '--port',
      address.port,
      '--data-dir',
      join(temporaryRoot, 'conflict-data'),
    ],
    consumer,
  ).then(
    () => '',
    (error) => error.message,
  );
  assert.match(conflict, /already in use/);
  const invalid = await capture([launcher, '--port', 'wrong'], consumer).then(
    () => '',
    (error) => error.message,
  );
  assert.match(invalid, /integer from 0 to 65535/);
  await stopInstalled();
  const reopened = new URL(await startInstalled(launcher, consumer));
  const nextToken = new URLSearchParams(reopened.hash.slice(1)).get('token');
  assert.notEqual(nextToken, token);
  const saved = await (
    await fetch(reopened.origin + '/api/sessions', {
      headers: { Authorization: 'Bearer ' + nextToken },
    })
  ).json();
  assert.equal(saved.sessions.length, 1);
  assert.equal(saved.sessions[0].id, persistedSession.id);
  const artifacts = join(root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  await copyFile(join(temporaryRoot, packed.filename), join(artifacts, packed.filename));
  await writeFile(
    join(artifacts, 'package-validation.json'),
    JSON.stringify(
      {
        status: 'passed',
        version: manifest.version,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        validatedAt: new Date().toISOString(),
        tarball: packed.filename,
        packagedFiles: files.length,
        checks: [
          'tarball-install',
          'executable',
          'native-diagnostics',
          'assets',
          'workspace',
          'sessions',
          'restart-persistence',
          'port-conflict',
          'invalid-options',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `PASS: tarball installation, executable shim, native diagnostics, assets, workspace, sessions, restart persistence, port conflict, and invalid options (${files.length} packaged files).`,
  );
  console.log(`Artifacts: ${join(artifacts, packed.filename)}`);
} finally {
  await stopInstalled();
  const checked = resolve(temporaryRoot);
  if (
    dirname(checked) !== resolve(tmpdir()) ||
    !checked.split(/[\\/]/).pop().startsWith('peaper-package-')
  )
    throw new Error('Refusing to clean an unexpected directory');
  await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
