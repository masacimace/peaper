import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildOptions, context, root } from './build.mjs';

const directory = resolve(root, 'node_modules/.cache/peaper/dev');
await mkdir(directory, { recursive: true });
await cp(resolve(root, 'packages/core/migrations'), resolve(directory, 'migrations'), {
  recursive: true,
});
const token = randomBytes(32).toString('hex');
let runtime;
let closing = false;

async function stopRuntime() {
  const child = runtime;
  runtime = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once('exit', done));
  const timeout = setTimeout(() => child.kill(), 8_000);
  if (child.connected) child.send('peaper:shutdown', () => {});
  else child.kill();
  await exited;
  clearTimeout(timeout);
}

const builder = await context({
  ...buildOptions,
  outdir: directory,
  plugins: [
    ...buildOptions.plugins,
    {
      name: 'development-runtime',
      setup(build) {
        build.onEnd(async (result) => {
          if (closing || result.errors.length) return;
          await stopRuntime();
          if (closing) return;
          const child = fork(resolve(directory, 'cli.js'), process.argv.slice(2), {
            cwd: root,
            execArgv: [],
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            windowsHide: true,
            env: {
              ...process.env,
              PEAPER_DEV_FRONTEND: resolve(root, 'apps/web/dev-server.mjs'),
              PEAPER_DEV_TOKEN: token,
            },
          });
          runtime = child;
          child.once('error', (error) => {
            console.error(error.message);
            process.exitCode = 1;
            void stop();
          });
          child.once('exit', (code) => {
            if (runtime !== child || closing) return;
            process.exitCode = code ?? 1;
            void stop();
          });
        });
      },
    },
  ],
});

async function stop() {
  if (closing) return;
  closing = true;
  await builder.dispose();
  await stopRuntime();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
await builder.watch();
