import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { createPeaperServer } from '../apps/server/src/index.js';

test(
  'development serves nonce-protected modules and HMR alongside authenticated API and PTY',
  {
    timeout: 30_000,
  },
  async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'peaper-development-')));
    const root = join(directory, 'web');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, 'index.html'),
      '<html><script type="module" src="/src/main.js"></script></html>',
    );
    const main = "import './style.css'; if (import.meta.hot) import.meta.hot.accept();";
    await writeFile(join(root, 'src/main.js'), main);
    await writeFile(join(root, 'src/style.css'), 'body { color: red; }');
    const { createDevelopmentFrontend } = await import(
      pathToFileURL(resolve('apps/web/dev-server.mjs')).href
    );
    const runtime = await createPeaperServer({
      workspace: directory,
      dataDirectory: join(directory, 'data'),
      distributionDirectory: resolve('dist'),
      version: 'development-test',
      createDevelopmentFrontend: (options) => createDevelopmentFrontend({ ...options, root }),
    });
    const sockets: WebSocket[] = [];
    try {
      const url = await runtime.app.listen({ host: '127.0.0.1', port: 0 });
      const html = await fetch(url);
      const document = await html.text();
      const policy = html.headers.get('content-security-policy') || '';
      assert.equal(html.status, 200);
      assert.match(document, /\/@vite\/client/);
      const nonce = /script-src 'self' 'nonce-([^']+)'/.exec(policy)?.[1];
      assert.ok(nonce);
      assert.ok(document.includes(`nonce="${nonce}"`));
      assert.equal((await fetch(`${url}/api/health`)).status, 401);
      const headers = { Authorization: `Bearer ${runtime.token}` };
      assert.equal((await fetch(`${url}/api/health`, { headers })).status, 200);
      assert.equal((await fetch(`${url}/api/missing`, { headers })).status, 404);
      assert.equal(
        (await fetch(url, { headers: { Origin: 'https://untrusted.example' } })).status,
        403,
      );
      assert.equal(
        (await runtime.app.inject({ url: '/', headers: { host: 'untrusted.example' } })).statusCode,
        403,
      );

      const module = await fetch(`${url}/src/main.js`);
      assert.equal(module.status, 200);
      assert.match(await module.text(), /createHotContext/);
      assert.equal((await fetch(`${url}/src/style.css`)).status, 200);
      const hmr = new WebSocket(`${url.replace('http:', 'ws:')}/__peaper_hmr`, 'vite-hmr');
      sockets.push(hmr);
      await once(hmr, 'open');
      async function expectUpdate(path: string, content: string) {
        const received = new Promise<void>((done, reject) => {
          const timer = setTimeout(() => reject(new Error(`No HMR update for ${path}`)), 8_000);
          const listener = (raw: WebSocket.RawData) => {
            const message = JSON.parse(raw.toString());
            if (
              message.type !== 'update' ||
              !message.updates.some((update: { path: string }) => update.path === path)
            )
              return;
            clearTimeout(timer);
            hmr.off('message', listener);
            done();
          };
          hmr.on('message', listener);
        });
        await writeFile(join(root, path), content);
        await received;
      }
      await expectUpdate('/src/main.js', `${main}\nconsole.log('updated');`);
      await expectUpdate('/src/style.css', 'body { color: blue; }');

      const terminal = new WebSocket(`${url.replace('http:', 'ws:')}/api/terminal`);
      sockets.push(terminal);
      const ready = new Promise<void>((done, reject) =>
        terminal.on('message', (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.type === 'ready') done();
          if (message.type === 'error') reject(new Error(message.message));
        }),
      );
      await once(terminal, 'open');
      terminal.send(JSON.stringify({ type: 'auth', token: runtime.token, cols: 80, rows: 24 }));
      await ready;
      assert.equal(runtime.terminals.active, 1);
      assert.equal(hmr.readyState, WebSocket.OPEN);
    } finally {
      for (const socket of sockets) socket.terminate();
      await runtime.app.close();
      assert.equal(runtime.terminals.active, 0);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
