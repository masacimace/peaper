import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderStore } from '../packages/core/src/providers/store.js';
import { testProvider } from '../packages/core/src/providers/model.js';
import { modelFixture } from './helpers/model-fixture.js';

test('OpenRouter adapter streams a tool response, uses backend credentials, and does not rely on gateway defaults', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-router-'));
  const local = await modelFixture(() => ({ text: 'ok' }));
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  context.mock.method(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer router-test-key');
    calls.push(url);
    return originalFetch(`${local.url}/chat/completions`, init);
  });
  try {
    const store = new ProviderStore(directory);
    store.save({
      kind: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'fixture/model',
      apiKey: 'router-test-key',
      maxOutputTokens: 4096,
      temperature: null,
    });
    const result = await testProvider(store);
    assert.ok(result.streaming && result.toolCalling && result.verifiedAt);
    assert.equal(calls.length, 1);
    assert.ok(
      local.requests.every((request) => request.stream && request.model === 'fixture/model'),
    );
  } finally {
    await local.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a compatible endpoint is not considered ready when it returns text instead of the requested tool', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-capabilities-'));
  const local = await modelFixture(() => ({ text: 'ok' }), { text: 'I cannot use tools.' });
  try {
    const store = new ProviderStore(directory);
    store.save({
      kind: 'compatible',
      baseURL: local.url,
      model: 'no-tools',
      maxOutputTokens: 4096,
      temperature: null,
    });
    await assert.rejects(testProvider(store), /streaming\/tool support/);
    assert.equal(store.get()?.verifiedAt, null);
    assert.equal(store.get()?.toolCalling, false);
  } finally {
    await local.close();
    await rm(directory, { recursive: true, force: true });
  }
});
