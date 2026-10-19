import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createPeaperServer } from '../apps/server/src/index.js';
import {
  healthSchema,
  sessionSchema,
  type TerminalServerMessage,
} from '../packages/shared/src/index.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-server-'));
  const runtime = await createPeaperServer({
    workspace: directory,
    dataDirectory: join(directory, 'data'),
    distributionDirectory: resolve('dist'),
    version: 'test',
  });
  const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' });
  return {
    ...runtime,
    url,
    headers: { Authorization: `Bearer ${runtime.token}` },
    async close() {
      await runtime.app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('API requires local authorization and origin; real sessions persist through the contract', async () => {
  const runtime = await fixture();
  try {
    assert.equal((await fetch(`${runtime.url}/api/workspace`)).status, 401);
    assert.equal(
      (
        await fetch(`${runtime.url}/api/workspace`, {
          headers: { ...runtime.headers, Origin: 'https://untrusted.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await runtime.app.inject({
          url: '/api/health',
          headers: { host: 'untrusted.example', ...runtime.headers },
        })
      ).statusCode,
      403,
    );
    const health = healthSchema.parse(
      await (await fetch(`${runtime.url}/api/health`, { headers: runtime.headers })).json(),
    );
    assert.equal(health.database.fts5, true);
    const invalid = await fetch(`${runtime.url}/api/sessions`, {
      method: 'POST',
      headers: { ...runtime.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    });
    assert.equal(invalid.status, 400);
    const created = await fetch(`${runtime.url}/api/sessions`, {
      method: 'POST',
      headers: { ...runtime.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Build the launcher' }),
    });
    assert.equal(created.status, 201);
    const session = sessionSchema.parse(await created.json());
    const found = (await (
      await fetch(`${runtime.url}/api/sessions?q=launch`, { headers: runtime.headers })
    ).json()) as { sessions: { id: string }[] };
    assert.equal(found.sessions[0]?.id, session.id);
    const html = await fetch(runtime.url);
    const document = await html.text();
    assert.match(document, /<title>Peaper/);
    assert.ok(!document.includes('/@vite/client'));
    assert.ok(!html.headers.get('content-security-policy')?.includes('nonce-'));
    assert.match(html.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    assert.equal(
      (await fetch(`${runtime.url}/api/missing`, { headers: runtime.headers })).status,
      404,
    );
  } finally {
    await runtime.close();
  }
});

test('SSE replays persisted events after a cursor and survives subscriber disconnect', async () => {
  const runtime = await fixture();
  const abort = new AbortController();
  try {
    const first = runtime.database.createSession(runtime.workspace.id, 'First event');
    const second = runtime.database.createSession(runtime.workspace.id, 'Second event');
    const response = await fetch(`${runtime.url}/api/events`, {
      headers: { ...runtime.headers, 'Last-Event-ID': String(first.event.id) },
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    let data = '';
    while (!data.includes(`id: ${second.event.id}\n`)) {
      const { value, done } = await reader.read();
      if (done) break;
      data += new TextDecoder().decode(value);
    }
    assert.ok(data.includes('Second event'));
    assert.ok(!data.includes('First event'));
    abort.abort();
    await reader.cancel().catch(() => undefined);
    const invalid = await fetch(`${runtime.url}/api/events?after=invalid`, {
      headers: runtime.headers,
    });
    assert.equal(invalid.status, 400);
  } finally {
    abort.abort();
    await runtime.close();
  }
});

test(
  'WebSocket rejects bad credentials, then drives and cleans up a real PTY',
  { timeout: 25_000 },
  async () => {
    const runtime = await fixture();
    let socket: WebSocket | undefined;
    try {
      const denied = new WebSocket(`${runtime.url.replace('http:', 'ws:')}/api/terminal`);
      await once(denied, 'open');
      const deniedClose = once(denied, 'close');
      denied.send(JSON.stringify({ type: 'auth', token: 'wrong', cols: 80, rows: 24 }));
      assert.equal((await deniedClose)[0], 1008);
      assert.equal(runtime.terminals.active, 0);

      socket = new WebSocket(`${runtime.url.replace('http:', 'ws:')}/api/terminal`);
      const active = socket;
      const output = new Promise<void>((done, reject) => {
        let text = '';
        active.on('message', (raw) => {
          const message = JSON.parse(raw.toString()) as TerminalServerMessage;
          if (message.type === 'error') reject(new Error(message.message));
          if (message.type === 'ready') {
            active.send(JSON.stringify({ type: 'resize', cols: 110, rows: 32 }));
            const command =
              process.platform === 'win32'
                ? "[Console]::WriteLine(('PEAPER_' + 'WS_OK'))"
                : "printf 'PEAPER_%s\\n' 'WS_OK'";
            active.send(JSON.stringify({ type: 'input', data: `${command}\r` }));
          }
          if (message.type === 'output') {
            text += message.data;
            if (text.includes('PEAPER_WS_OK')) done();
          }
        });
        active.once('error', reject);
      });
      await once(active, 'open');
      active.send(JSON.stringify({ type: 'auth', token: runtime.token, cols: 80, rows: 24 }));
      await output;
      assert.equal(runtime.terminals.active, 1);
      const closed = once(active, 'close');
      active.close();
      await closed;
      for (let tries = 0; tries < 30 && runtime.terminals.active; tries++)
        await new Promise((done) => setTimeout(done, 20));
      assert.equal(runtime.terminals.active, 0);
    } finally {
      socket?.terminate();
      await runtime.close();
    }
  },
);
