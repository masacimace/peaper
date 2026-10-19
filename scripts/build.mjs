import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const dist = resolve(root, 'dist');
const workspaceEntries = {
  '@peaper/core': resolve(root, 'packages/core/src/index.ts'),
  '@peaper/shared': resolve(root, 'packages/shared/src/index.ts'),
  '@peaper/server': resolve(root, 'apps/server/src/index.ts'),
};
export const buildOptions = {
  absWorkingDir: root,
  entryPoints: {
    cli: 'apps/cli/src/index.ts',
    'terminal-worker': 'packages/core/src/terminal/worker.ts',
  },
  outdir: dist,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  plugins: [
    {
      name: 'workspace',
      setup(builder) {
        builder.onResolve({ filter: /^@peaper\// }, ({ path }) => ({
          path: workspaceEntries[path],
        }));
      },
    },
  ],
};

export function run(command, args, cwd = root) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? done() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

export async function prepare() {
  // dist is fixed relative to this script, never a CLI-supplied deletion target.
  if (dist !== resolve(root, 'dist')) throw new Error('Invalid distribution path');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(resolve(root, 'packages/core/migrations'), resolve(dist, 'migrations'), {
    recursive: true,
  });
}

export async function buildAll() {
  await prepare();
  await build(buildOptions);
  await run(
    process.execPath,
    [resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), 'build'],
    resolve(root, 'apps/web'),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildAll();
export { context };
