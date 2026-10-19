import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProviderStore } from '../packages/core/src/providers/store.js';
import { parseCatalog } from '../packages/core/src/providers/adapters.js';
import { refreshCatalog } from '../packages/core/src/providers/catalog.js';
import { testManagedModel } from '../packages/core/src/providers/model.js';
import { availableEfforts, type AgentRun, type ModelState } from '../packages/shared/src/index.js';
import { createPeaperServer } from '../apps/server/src/index.js';
import { modelFixture } from './helpers/model-fixture.js';

const catalog = {
  data: [
    {
      id: 'coding',
      name: 'Coding',
      context_length: 128000,
      supported_parameters: ['tools', 'reasoning', 'temperature'],
      pricing: { prompt: '0.000001', completion: '0.000002' },
      top_provider: { max_completion_tokens: 8192 },
      reasoning: {
        supported_efforts: ['none', 'high', 'low', 'unknown'],
        mandatory: true,
        supports_max_tokens: true,
      },
    },
    { id: 'fast', supported_parameters: ['tools'] },
    { id: 'chat', supported_parameters: ['temperature'] },
    { id: 'unknown' },
  ],
};

test('legacy encrypted connection migrates once without losing credentials or verification', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-model-migration-'));
  try {
    const key = randomBytes(32),
      iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update('legacy-test-key', 'utf8'), cipher.final()]);
    const verifiedAt = '2026-10-18T00:00:00.000Z';
    await writeFile(join(directory, 'provider.key'), key);
    await writeFile(
      join(directory, 'provider.json'),
      JSON.stringify({
        kind: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        model: 'legacy/model',
        maxOutputTokens: 4096,
        temperature: null,
        hasKey: true,
        verifiedAt,
        toolCalling: true,
        streaming: true,
        secret: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'),
      }),
    );
    const store = new ProviderStore(directory);
    const first = store.snapshot();
    assert.equal(first.models[0]!.verifiedAt, verifiedAt);
    assert.equal(first.defaults.modelId, first.models[0]!.id);
    assert.equal(store.resolve().apiKey, 'legacy-test-key');
    assert.deepEqual(new ProviderStore(directory).snapshot(), first);
    assert.equal(JSON.stringify(first).includes('secret'), false);
    assert.equal(
      (await readFile(join(directory, 'provider.json'), 'utf8')).includes('legacy-test-key'),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('catalog normalizes capabilities and preserves per-connection preferences across refresh and failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-catalog-'));
  const provider = await modelFixture(() => ({ text: 'ok' }), undefined, catalog);
  try {
    const store = new ProviderStore(directory);
    const first = store.saveConnection({
      name: 'Personal',
      kind: 'compatible',
      baseURL: provider.url,
      apiKey: 'personal-test-key',
      enabled: true,
    });
    const second = store.saveConnection({
      name: 'Work',
      kind: 'compatible',
      baseURL: provider.url,
      apiKey: 'work-test-key',
      enabled: true,
    });
    await refreshCatalog(store, first.id);
    await refreshCatalog(store, second.id);
    const model = store
      .snapshot()
      .models.find((item) => item.connectionId === first.id && item.modelId === 'coding')!;
    assert.deepEqual(availableEfforts(model), ['default', 'high', 'low']);
    assert.deepEqual(model.pricing, { input: 1, output: 2 });
    assert.equal(
      store.snapshot().models.find((item) => item.modelId === 'unknown')!.toolCalling,
      null,
    );
    store.updateModel(model.id, {
      favorite: true,
      showInChat: true,
      options: { ...model.options, effort: 'high', maxOutputTokens: 8192 },
    });
    store.setDefaults({ modelId: model.id, effort: 'high' });
    assert.throws(() => store.resolve({ modelId: model.id, effort: 'none' }), /not supported/);
    await refreshCatalog(store, first.id);
    assert.equal(store.snapshot().models.find((item) => item.id === model.id)!.favorite, true);
    assert.equal(store.resolve().options.effort, 'high');
    assert.equal(store.connectionCredentials(first.id).apiKey, 'personal-test-key');
    assert.equal(store.connectionCredentials(second.id).apiKey, 'work-test-key');
    assert.equal(store.snapshot().models.filter((item) => item.modelId === 'coding').length, 2);
    const revision = store.connectionCredentials(first.id).revision;
    store.saveCatalog(
      first.id,
      revision,
      parseCatalog({
        data: [
          {
            id: 'coding',
            supported_parameters: ['tools'],
            top_provider: { max_completion_tokens: 512 },
          },
        ],
      }),
    );
    assert.equal(store.resolve().options.maxOutputTokens, 512);
    assert.equal(store.snapshot().defaults.effort, 'default');
    const cached = store.snapshot().models;
    await provider.close();
    await assert.rejects(refreshCatalog(store, first.id), /cached|catalog|network/i);
    assert.deepEqual(store.snapshot().models, cached);
    assert.ok(store.snapshot().connections.find((item) => item.id === first.id)!.error);
    store.saveConnection({ ...first, baseURL: 'https://other.test/v1' }, first.id);
    assert.equal(store.connectionCredentials(first.id).apiKey, undefined);
    assert.equal(store.snapshot().models.find((item) => item.id === model.id)!.available, false);
    assert.throws(() => store.saveCatalog(first.id, revision, parseCatalog(catalog)), /changed/);
  } finally {
    await provider.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('explicit effort reaches each adapter while Default omits the parameter', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-effort-'));
  const local = await modelFixture(() => ({ text: 'ok' }));
  const originalFetch = globalThis.fetch;
  context.mock.method(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    originalFetch(
      String(input).startsWith('https://openrouter.ai/') ? `${local.url}/chat/completions` : input,
      init,
    ),
  );
  try {
    const store = new ProviderStore(directory);
    for (const kind of ['compatible', 'openrouter'] as const) {
      const connection = store.saveConnection({
        name: kind,
        kind,
        baseURL: kind === 'openrouter' ? 'https://openrouter.ai/api/v1' : local.url,
        apiKey: 'fixture-key',
        enabled: true,
      });
      store.saveCatalog(
        connection.id,
        store.connectionCredentials(connection.id).revision,
        parseCatalog(catalog),
      );
      const model = store
        .snapshot()
        .models.find((item) => item.connectionId === connection.id && item.modelId === 'coding')!;
      store.updateModel(model.id, { options: { ...model.options, effort: 'high' } });
      await testManagedModel(store, model.id);
      const request = local.requests.at(-1)!;
      if (kind === 'openrouter') assert.equal(request.reasoning?.effort, 'high');
      else assert.equal(request.reasoning_effort, 'high');
      store.updateModel(model.id, { options: { ...model.options, effort: 'default' } });
      await testManagedModel(store, model.id);
      assert.equal(local.requests.at(-1)!.reasoning, undefined);
      assert.equal(local.requests.at(-1)!.reasoning_effort, undefined);
    }
  } finally {
    await local.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'session selection persists and a running task retains its captured model, effort, and credentials',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'peaper-model-api-'));
    const workspace = join(directory, 'workspace');
    await mkdir(workspace);
    const provider = await modelFixture(
      (request) =>
        request.messages.at(-1)?.role === 'tool'
          ? { text: 'Finished' }
          : { tool: 'ask_user', input: { question: 'Continue?', options: ['Yes', 'No'] } },
      undefined,
      catalog,
    );
    const runtime = await createPeaperServer({
      workspace,
      dataDirectory: join(directory, 'data'),
      distributionDirectory: resolve('dist'),
      version: 'test',
    });
    const headers = { authorization: `Bearer ${runtime.token}` };
    const call = (method: 'POST' | 'GET' | 'PUT' | 'PATCH', url: string, payload?: object) =>
      runtime.app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    async function wait(id: string, status: string): Promise<AgentRun> {
      for (let i = 0; i < 400; i++) {
        const run = runtime.agent.store.get(id);
        if (run.status === status) return run;
        if (run.status === 'failed') throw new Error(run.error ?? 'Failed');
        await new Promise((done) => setTimeout(done, 20));
      }
      throw new Error('Timed out');
    }
    try {
      assert.equal(
        (await runtime.app.inject({ method: 'GET', url: '/api/models' })).statusCode,
        401,
      );
      const created = await call('POST', '/api/model-connections', {
        name: 'Local',
        kind: 'compatible',
        baseURL: provider.url,
        apiKey: 'private-fixture-key',
      });
      assert.equal(created.statusCode, 200, created.body);
      assert.equal(created.body.includes('private-fixture-key'), false);
      const connection = (created.json() as ModelState).connections[0]!;
      const refresh = await call('POST', `/api/model-connections/${connection.id}/refresh`);
      assert.equal(refresh.statusCode, 200, refresh.body);
      const models = (refresh.json() as ModelState).models;
      const coding = models.find((model) => model.modelId === 'coding')!,
        fast = models.find((model) => model.modelId === 'fast')!;
      for (const model of [coding, fast])
        assert.equal((await call('POST', `/api/models/${model.id}/test`)).statusCode, 200);
      assert.equal(
        (await call('PUT', '/api/model-defaults', { modelId: coding.id, effort: 'high' }))
          .statusCode,
        200,
      );
      const session = (await call('POST', '/api/sessions', { title: 'First' })).json();
      assert.deepEqual((await call('GET', `/api/sessions/${session.id}/model`)).json().selection, {
        modelId: coding.id,
        effort: 'high',
      });
      await call('PUT', '/api/model-defaults', { modelId: fast.id, effort: 'default' });
      assert.equal(
        (await call('GET', `/api/sessions/${session.id}/model`)).json().selection.modelId,
        coding.id,
      );
      const other = runtime.database.workspace(directory);
      const foreign = runtime.database.createSession(other.id, 'Foreign').session;
      assert.equal((await call('GET', `/api/sessions/${foreign.id}/model`)).statusCode, 404);
      assert.equal(
        (await call('PUT', `/api/sessions/${foreign.id}/model`, { modelId: fast.id })).statusCode,
        404,
      );
      assert.equal(
        (
          await call('PUT', `/api/sessions/${session.id}/model`, {
            modelId: coding.id,
            effort: 'none',
          })
        ).statusCode,
        400,
      );
      const start = await call('POST', `/api/sessions/${session.id}/messages`, {
        message: 'First task',
      });
      assert.equal(start.statusCode, 202, start.body);
      const initial = start.json() as AgentRun;
      const waiting = await wait(initial.id, 'waiting');
      assert.equal(waiting.effort, 'high');
      await call('PUT', `/api/sessions/${session.id}/model`, {
        modelId: fast.id,
        effort: 'default',
      });
      // Editing the endpoint mid-task must never move its captured credential to that endpoint.
      await call('PUT', `/api/model-connections/${connection.id}`, {
        ...connection,
        baseURL: 'http://127.0.0.1:1/v1',
      });
      const before = provider.requests.length;
      runtime.agent.answer(initial.id, waiting.questions[0]!.id, 'Yes');
      assert.equal((await wait(initial.id, 'completed')).model, 'coding');
      assert.equal(provider.requests.length, before + 1);
      assert.equal(provider.requests.at(-1)!.model, 'coding');
      assert.equal(provider.requests.at(-1)!.reasoning_effort, 'high');
      assert.equal(provider.authorizations.at(-1), 'Bearer private-fixture-key');
      assert.deepEqual(runtime.agent.store.selection(session.id), {
        modelId: fast.id,
        effort: 'default',
      });
      await call('PUT', `/api/model-connections/${connection.id}`, {
        ...connection,
        apiKey: 'replacement-fixture-key',
      });
      await call('POST', `/api/model-connections/${connection.id}/refresh`);
      await call('POST', `/api/models/${fast.id}/test`);
      const next = await call('POST', `/api/sessions/${session.id}/messages`, {
        message: 'Next task',
      });
      assert.equal(next.statusCode, 202, next.body);
      assert.equal((next.json() as AgentRun).model, 'fast');
      const pending = await wait(next.json().id, 'waiting');
      assert.equal(pending.effort, 'default');
      assert.equal(provider.requests.at(-1)!.reasoning_effort, undefined);
      assert.equal(provider.authorizations.at(-1), 'Bearer replacement-fixture-key');
      await runtime.agent.cancel(pending.id);
    } finally {
      await runtime.app.close();
      await provider.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
