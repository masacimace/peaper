import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentRun } from '../packages/shared/src/index.js';
import { agentRunSchema, providerResponseSchema } from '../packages/shared/src/index.js';
import { createPeaperServer } from '../apps/server/src/index.js';
import { ProviderStore } from '../packages/core/src/providers/store.js';
import { WorkspaceEdits } from '../packages/core/src/workspace/edits.js';
import { runCommand } from '../packages/core/src/agent/commands.js';
import { AgentStore } from '../packages/core/src/agent/store.js';
import {
  modelFixture,
  codingScenario,
  type FixtureReply,
  type FixtureRequest,
} from './helpers/model-fixture.js';

async function fixture(respond: (request: FixtureRequest) => FixtureReply = codingScenario) {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-agent-'));
  const workspace = join(directory, 'workspace');
  const data = join(workspace, 'runtime-data');
  await mkdir(workspace);
  await writeFile(join(workspace, 'math.mjs'), 'export const add = (a, b) => a - b;\n');
  await writeFile(
    join(workspace, 'check.mjs'),
    "import { add } from './math.mjs';\nif (add(2, 3) !== 5) { console.error('ADDITION_FAILED'); process.exit(1); }\nconsole.log('ADDITION_OK');\n",
  );
  const model = await modelFixture(respond);
  const runtime = await createPeaperServer({
    workspace,
    dataDirectory: data,
    distributionDirectory: resolve('dist'),
    version: 'test',
  }).catch(async (error) => {
    await model.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  });
  const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' }).catch(async (error) => {
    await runtime.app.close();
    await model.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  });
  const headers = { authorization: `Bearer ${runtime.token}` };
  const request = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: object) =>
    runtime.app.inject({ method, url: path, headers, ...(payload ? { payload } : {}) });
  const session = runtime.database.createSession(runtime.workspace.id, 'Fix addition').session;
  return {
    ...runtime,
    directory,
    workspacePath: workspace,
    data,
    model,
    url,
    request,
    session,
    async configure() {
      assert.equal(
        (
          await request('PUT', '/api/provider', {
            kind: 'compatible',
            baseURL: model.url,
            model: 'fixture-model',
            apiKey: 'test-key-never-log',
          })
        ).statusCode,
        200,
      );
      const tested = await request('POST', '/api/provider/test');
      assert.equal(tested.statusCode, 200, tested.body);
      assert.ok(providerResponseSchema.parse(tested.json()).provider?.toolCalling);
    },
    async close() {
      await runtime.app.close();
      await model.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function until(get: () => AgentRun, predicate: (run: AgentRun) => boolean, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const run = get();
    if (predicate(run)) return run;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error(`Timed out: ${JSON.stringify(get())}`);
}

test('provider credentials persist encrypted, are redacted, and never transfer to another endpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-credentials-'));
  try {
    const store = new ProviderStore(directory);
    const input = {
      kind: 'compatible' as const,
      baseURL: 'https://example.test/v1',
      model: 'model',
      apiKey: 'a-local-test-secret',
      maxOutputTokens: 4096,
      temperature: null,
    };
    store.save(input);
    assert.equal(new ProviderStore(directory).credentials().apiKey, input.apiKey);
    assert.ok(!JSON.stringify(store.get()).includes(input.apiKey));
    assert.ok(!(await readFile(join(directory, 'provider.json'), 'utf8')).includes(input.apiKey));
    store.save({ ...input, apiKey: undefined, baseURL: 'https://other.test/v1' });
    assert.equal(store.credentials().apiKey, undefined);
    assert.throws(() => store.save({ ...input, baseURL: 'http://external.test/v1' }), /HTTPS/);
    assert.throws(() => store.save({ ...input, kind: 'openrouter' }), /OpenRouter uses/);
    store.clear();
    assert.equal(store.get(), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'coding loop reads, obtains approval, sees a real failing test, edits, retests, streams and persists without duplicate execution',
  { timeout: 30000 },
  async () => {
    const runtime = await fixture();
    try {
      assert.equal(
        (
          await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
            message: 'Fix addition',
          })
        ).statusCode,
        409,
      );
      await runtime.configure();
      const response = await runtime.request(
        'POST',
        `/api/sessions/${runtime.session.id}/messages`,
        { message: 'Fix addition' },
      );
      assert.equal(response.statusCode, 202, response.body);
      const initial = agentRunSchema.parse(response.json());
      const get = () => runtime.agent.store.get(initial.id);
      assert.equal(
        (
          await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
            message: 'Duplicate',
          })
        ).statusCode,
        409,
      );
      const approved = new Set<string>();
      const finished = await until(get, (run) => {
        for (const permission of run.permissions)
          if (permission.status === 'pending' && !approved.has(permission.id)) {
            approved.add(permission.id);
            if (permission.kind === 'write') {
              assert.match(permission.change!.before!, /a - b/);
              assert.match(permission.change!.after, /a \+ b/);
            }
            runtime.agent.decide(run.id, permission.id, true);
          }
        return ['completed', 'failed'].includes(run.status);
      });
      assert.equal(finished.status, 'completed', JSON.stringify(finished));
      assert.equal(approved.size, 3);
      assert.match(await readFile(join(runtime.workspacePath, 'math.mjs'), 'utf8'), /a \+ b/);
      const commands = finished.activities
        .filter((activity) => activity.name === 'run_command')
        .map((activity) => JSON.parse(activity.output!) as { exitCode: number; output: string });
      assert.equal(commands[0]!.exitCode, 1);
      assert.match(commands[0]!.output, /ADDITION_FAILED/);
      assert.equal(commands[1]!.exitCode, 0);
      assert.match(commands[1]!.output, /ADDITION_OK/);
      assert.equal(finished.changes.length, 1);
      assert.ok(finished.todos.every((todo) => todo.status === 'completed'));
      assert.match(finished.text, /ADDITION_OK/);
      assert.ok(
        runtime.model.requests.some((request) =>
          request.messages.some(
            (message) => message.role === 'tool' && message.content?.includes('ADDITION_FAILED'),
          ),
        ),
      );
      assert.ok(
        runtime.database
          .eventsAfter(runtime.workspace.id, 0)
          .some((event) => event.type === 'agent.updated'),
      );
      const count = runtime.model.requests.length;
      const runs = await runtime.request('GET', `/api/sessions/${runtime.session.id}/runs`);
      assert.equal(runs.json().runs[0].text, finished.text);
      await runtime.request('GET', `/api/sessions/${runtime.session.id}/runs`);
      assert.equal(runtime.model.requests.length, count);
      assert.equal(
        (
          await runtime.request('POST', `/api/runs/${initial.id}/permissions/${[...approved][0]}`, {
            allow: true,
          })
        ).statusCode,
        409,
      );
      const publicConfig = await runtime.request('GET', '/api/provider');
      assert.ok(!publicConfig.body.includes('test-key-never-log'));
      assert.equal(
        (await runtime.request('GET', '/api/file?path=runtime-data/provider.key')).statusCode,
        403,
      );
      const other = runtime.database.workspace(runtime.directory);
      const foreign = runtime.database.createSession(other.id, 'Foreign').session;
      assert.equal(
        (await runtime.request('GET', `/api/sessions/${foreign.id}/runs`)).statusCode,
        404,
      );
      assert.equal(
        (
          await runtime.request('PUT', '/api/provider', {
            kind: 'compatible',
            baseURL: runtime.model.url,
            model: 'fixture-model',
          })
        ).json().provider.verifiedAt,
        null,
      );
    } finally {
      await runtime.close();
    }
  },
);

test(
  'denied writes and cancelled pending commands do not run; provider error bodies stay private',
  { timeout: 20000 },
  async (context) => {
    const log = context.mock.method(console, 'error', () => {});
    let mode: 'write' | 'command' | 'error' = 'write';
    const runtime = await fixture((request) => {
      if (mode === 'error') return { status: 401, error: 'secret-do-not-echo' };
      if (request.messages.at(-1)?.role === 'tool')
        return { text: 'Action denied. No changes made.' };
      return mode === 'write'
        ? {
            tool: 'write_file',
            input: { path: 'denied.txt', content: 'not allowed', expectedContent: null },
          }
        : {
            tool: 'run_command',
            input: { command: "node -e \"require('fs').writeFileSync('never.txt','wrong')\"" },
          };
    });
    try {
      await runtime.configure();
      const start = async () =>
        agentRunSchema.parse(
          (
            await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
              message: 'Test permission',
            })
          ).json(),
        );
      const first = await start();
      const waiting = await until(
        () => runtime.agent.store.get(first.id),
        (run) => run.status === 'waiting',
      );
      await assert.rejects(readFile(join(runtime.workspacePath, 'denied.txt')), /ENOENT/);
      const denied = await runtime.request(
        'POST',
        `/api/runs/${first.id}/permissions/${waiting.permissions[0]!.id}`,
        { allow: false },
      );
      assert.equal(denied.statusCode, 200);
      await until(
        () => runtime.agent.store.get(first.id),
        (run) => run.status === 'completed',
      );
      await assert.rejects(readFile(join(runtime.workspacePath, 'denied.txt')), /ENOENT/);
      mode = 'command';
      const second = await start();
      await until(
        () => runtime.agent.store.get(second.id),
        (run) => run.status === 'waiting',
      );
      const cancelled = agentRunSchema.parse(
        (await runtime.request('POST', `/api/runs/${second.id}/cancel`)).json(),
      );
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.permissions[0]!.status, 'cancelled');
      await assert.rejects(readFile(join(runtime.workspacePath, 'never.txt')), /ENOENT/);
      mode = 'error';
      const third = await start();
      const failed = await until(
        () => runtime.agent.store.get(third.id),
        (run) => run.status === 'failed',
      );
      assert.match(failed.error!, /authentication/);
      assert.ok(!JSON.stringify(failed).includes('secret-do-not-echo'));
      assert.equal(
        log.mock.calls.length,
        0,
        'SDK errors must not print provider bodies or request details',
      );
    } finally {
      await runtime.close();
    }
  },
);

test('approved edits reject outside paths, junctions, runtime data and concurrent user changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-edits-'));
  const workspace = join(directory, 'workspace');
  const data = join(workspace, 'data');
  await mkdir(data, { recursive: true });
  const edits = new WorkspaceEdits(workspace, data);
  try {
    await writeFile(join(workspace, 'file.txt'), 'original');
    const change = await edits.prepare('file.txt', 'agent', 'original');
    await writeFile(join(workspace, 'file.txt'), 'manual');
    await assert.rejects(edits.apply(change), /changed while approval/);
    assert.equal(await readFile(join(workspace, 'file.txt'), 'utf8'), 'manual');
    for (const path of ['../outside.txt', '.git/config', '.env', 'data/provider.key'])
      await assert.rejects(edits.prepare(path, 'bad'));
    await symlink(
      directory,
      join(workspace, 'junction'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(edits.prepare('junction/outside.txt', 'bad'), /junction/);
    const create = await edits.prepare('src/new.txt', 'new file', null);
    await edits.apply(create);
    assert.equal(await readFile(join(workspace, 'src/new.txt'), 'utf8'), 'new file');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'structured user questions wait, validate an answer, resume with the real response, and support cancellation',
  { timeout: 15000 },
  async () => {
    const runtime = await fixture((request) =>
      request.messages.at(-1)?.role === 'tool'
        ? { text: 'Thanks. I will use the answer provided.' }
        : {
            tool: 'ask_user',
            input: { question: 'Which runtime should I use?', options: ['Node.js', 'Bun'] },
          },
    );
    try {
      await runtime.configure();
      const initial = agentRunSchema.parse(
        (
          await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
            message: 'Ask a question',
          })
        ).json(),
      );
      const waiting = await until(
        () => runtime.agent.store.get(initial.id),
        (run) => run.status === 'waiting',
      );
      const question = waiting.questions[0]!;
      assert.equal(
        (
          await runtime.request('POST', `/api/runs/${initial.id}/questions/${question.id}`, {
            answer: ' ',
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await runtime.request('POST', `/api/runs/${initial.id}/questions/${question.id}`, {
            answer: 'Node.js',
          })
        ).statusCode,
        200,
      );
      const completed = await until(
        () => runtime.agent.store.get(initial.id),
        (run) => run.status === 'completed',
      );
      assert.equal(completed.questions[0]!.answer, 'Node.js');
      assert.ok(
        runtime.model.requests.some((request) =>
          request.messages.some(
            (message) => message.role === 'tool' && message.content?.includes('Node.js'),
          ),
        ),
      );
      assert.equal(
        (
          await runtime.request('POST', `/api/runs/${initial.id}/questions/${question.id}`, {
            answer: 'Bun',
          })
        ).statusCode,
        409,
      );
      const again = agentRunSchema.parse(
        (
          await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
            message: 'Ask again',
          })
        ).json(),
      );
      await until(
        () => runtime.agent.store.get(again.id),
        (run) => run.status === 'waiting',
      );
      assert.equal((await runtime.agent.cancel(again.id)).questions[0]!.status, 'cancelled');
      const shutdown = agentRunSchema.parse(
        (
          await runtime.request('POST', `/api/sessions/${runtime.session.id}/messages`, {
            message: 'Wait for shutdown',
          })
        ).json(),
      );
      await until(
        () => runtime.agent.store.get(shutdown.id),
        (run) => run.status === 'waiting',
      );
      await runtime.app.close();
      const reopened = await createPeaperServer({
        workspace: runtime.workspacePath,
        dataDirectory: runtime.data,
        distributionDirectory: resolve('dist'),
        version: 'test',
      });
      try {
        assert.equal(reopened.agent.store.get(shutdown.id).status, 'interrupted');
        assert.equal(reopened.agent.store.get(shutdown.id).questions[0]!.status, 'cancelled');
      } finally {
        await reopened.app.close();
      }
    } finally {
      await runtime.close();
    }
  },
);

test('restart marks unfinished runs and pending permissions interrupted without replaying tools; other workspaces cannot read the run', async () => {
  const runtime = await fixture();
  let reopened: Awaited<ReturnType<typeof createPeaperServer>> | undefined;
  try {
    const run = runtime.agent.store.create(runtime.session.id, 'Pending before crash', 'fixture');
    run.status = 'waiting';
    run.permissions.push({
      id: 'pending',
      activityId: 'command',
      kind: 'command',
      status: 'pending',
      command: 'node check.mjs',
      description: 'Test',
    });
    runtime.agent.store.save(run);
    const other = runtime.database.workspace(runtime.directory);
    const session = runtime.database.createSession(other.id, 'Other workspace').session;
    const foreign = new AgentStore(runtime.database, other.id, () => {}).create(
      session.id,
      'Foreign task',
      'fixture',
    );
    assert.equal((await runtime.request('POST', `/api/runs/${foreign.id}/cancel`)).statusCode, 404);
    await runtime.app.close();
    reopened = await createPeaperServer({
      workspace: runtime.workspacePath,
      dataDirectory: runtime.data,
      distributionDirectory: resolve('dist'),
      version: 'test',
    });
    const recovered = reopened.agent.store.get(run.id);
    assert.equal(recovered.status, 'interrupted');
    assert.equal(recovered.permissions[0]!.status, 'cancelled');
    assert.equal(runtime.model.requests.length, 0);
  } finally {
    await reopened?.app.close();
    await runtime.close();
  }
});

test(
  'command cancellation stops a running process tree and timeout reports the real state',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'peaper-command-'));
    try {
      await writeFile(
        join(directory, 'slow.cjs'),
        "console.log('RUNNING'); setTimeout(() => require('fs').writeFileSync('escaped.txt','bad'), 3500); setInterval(() => {},1000);",
      );
      const abort = new AbortController();
      const result = await runCommand('node slow.cjs', directory, abort.signal, (output) => {
        if (output.includes('RUNNING')) abort.abort();
      });
      assert.equal(result.cancelled, true);
      assert.match(result.output, /RUNNING/);
      await new Promise((done) => setTimeout(done, 3700));
      await assert.rejects(readFile(join(directory, 'escaped.txt')), /ENOENT/);
      const timed = await runCommand(
        'node slow.cjs',
        directory,
        new AbortController().signal,
        () => {},
        500,
      );
      assert.equal(timed.timedOut, true);
      assert.notEqual(timed.exitCode, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
