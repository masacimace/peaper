import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createPeaperServer } from '../apps/server/src/index.js';
import { InstructionLoader } from '../packages/core/src/continuity/instructions.js';
import { WorkspaceEdits } from '../packages/core/src/workspace/edits.js';
import { PeaperDatabase } from '../packages/core/src/storage/database.js';
import { AgentStore } from '../packages/core/src/agent/store.js';
import { configuredSelection } from '../packages/core/src/providers/model.js';
import type { AgentRun, FileChange, RewindPreview } from '../packages/shared/src/index.js';
import { modelFixture, type FixtureReply, type FixtureRequest } from './helpers/model-fixture.js';

async function setup(
  respond: (request: FixtureRequest) => FixtureReply = () => ({ text: 'Done.' }),
) {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-continuity-'));
  const workspace = join(directory, 'workspace'),
    dataDirectory = join(directory, 'data');
  await mkdir(workspace);
  await writeFile(join(workspace, 'file.txt'), 'original\n');
  const model = await modelFixture(respond);
  const options = {
    workspace,
    dataDirectory,
    distributionDirectory: resolve('dist'),
    version: 'test',
  };
  let runtime = await createPeaperServer(options);
  const request = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
    runtime.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${runtime.token}` },
      ...(payload ? { payload } : {}),
    });
  assert.equal(
    (
      await request('PUT', '/api/provider', {
        kind: 'compatible',
        baseURL: model.url,
        model: 'fixture-model',
        apiKey: 'fixture-key',
      })
    ).statusCode,
    200,
  );
  assert.equal((await request('POST', '/api/provider/test')).statusCode, 200);
  const session = runtime.database.createSession(runtime.workspace.id, 'Continuity test').session;
  return {
    get runtime() {
      return runtime;
    },
    directory,
    workspace,
    dataDirectory,
    model,
    session,
    request,
    async reopen() {
      await runtime.app.close();
      runtime = await createPeaperServer(options);
    },
    async close() {
      await runtime.app.close();
      await model.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function until(get: () => AgentRun, done: (run: AgentRun) => boolean) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const run = get();
    if (done(run)) return run;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`Task did not reach expected state: ${JSON.stringify(get())}`);
}
function turn(f: Awaited<ReturnType<typeof setup>>, prompt: string, text = 'Completed.') {
  const run = f.runtime.agent.store.create(f.session.id, prompt, 'fixture-model');
  run.status = 'completed';
  run.text = text;
  f.runtime.agent.store.save(run, [
    { role: 'user', content: prompt },
    { role: 'assistant', content: text },
  ]);
  return run;
}
async function checkpoint(
  f: Awaited<ReturnType<typeof setup>>,
  run: AgentRun,
  path: string,
  before: string | null,
  after: string,
) {
  const change: FileChange = { id: randomUUID(), path, before, after };
  f.runtime.agent.store.stageChange(run, change);
  await writeFile(join(f.workspace, path), after);
  f.runtime.agent.store.finishChange(run, change, true);
}
const toolsAfterUser = (request: FixtureRequest) =>
  request.messages
    .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
    .filter((m) => m.role === 'tool').length;

test('draft, mode, renamed title, conversation search and exports persist across runtime restart with workspace isolation', async () => {
  const f = await setup();
  try {
    const id = f.session.id;
    assert.equal(
      (
        await f.request('PUT', `/api/sessions/${id}/draft`, {
          draft: 'Unsent design notes',
          mode: 'plan',
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.request('PATCH', `/api/sessions/${id}`, { title: 'Renamed task' })).statusCode,
      200,
    );
    const old = turn(f, 'Find the quasar', 'The cobalt mechanism is in file.txt.');
    assert.equal((await f.request('GET', '/api/sessions?q=cobalt')).json().sessions[0].id, id);
    assert.equal((await f.request('GET', '/api/sessions?q=Renamed')).json().sessions[0].id, id);
    await f.reopen();
    const saved = (await f.request('GET', `/api/sessions/${id}/draft`)).json();
    assert.equal(saved.draft, 'Unsent design notes');
    assert.equal(saved.mode, 'plan');
    assert.equal(f.runtime.agent.store.list(id)[0]!.id, old.id);
    const exported = (await f.request('GET', `/api/sessions/${id}/export?format=json`)).json();
    assert.equal(JSON.parse(exported.content).session.title, 'Renamed task');
    assert.match(exported.content, /cobalt/);
    assert.ok(!exported.content.includes('fixture-key'));
    const otherPath = join(f.directory, 'other');
    await mkdir(otherPath);
    const other = f.runtime.database.workspace(otherPath);
    const foreign = f.runtime.database.createSession(other.id, 'foreign cobalt').session;
    assert.equal((await f.request('GET', `/api/sessions/${foreign.id}/context`)).statusCode, 404);
    assert.equal(
      (await f.request('PATCH', `/api/sessions/${foreign.id}`, { title: 'Leaked' })).statusCode,
      404,
    );
    assert.equal((await f.request('GET', '/api/sessions?q=cobalt')).json().sessions.length, 1);
  } finally {
    await f.close();
  }
});

test('Plan blocks hallucinated writes and commands on the backend, revisions require review, implementation starts once in Build', async () => {
  const f = await setup((request) => {
    const plan = request.messages.some(
      (m) => m.role === 'system' && m.content?.includes('PLAN MODE:'),
    );
    const index = toolsAfterUser(request);
    if (plan)
      return (
        ([
          {
            tool: 'write_file',
            input: { path: 'file.txt', content: 'unreviewed', expectedContent: 'original\n' },
          },
          {
            tool: 'run_command',
            input: { command: "node -e \"require('fs').writeFileSync('command.txt','bad')\"" },
          },
          {
            tool: 'propose_plan',
            input: { plan: '# Plan\nChange file.txt after review.\nValidate the contents.' },
          },
          { text: 'Plan ready for review.' },
        ][index] as FixtureReply) ?? { text: 'Plan ready.' }
      );
    return index === 0
      ? { tool: 'edit_file', input: { path: 'file.txt', oldText: 'original', newText: 'reviewed' } }
      : { text: 'Implemented the reviewed plan.' };
  });
  try {
    const started = await f.request('POST', `/api/sessions/${f.session.id}/messages`, {
      message: 'Explore a change',
      mode: 'plan',
    });
    assert.equal(started.statusCode, 202, started.body);
    const run = await until(
      () => f.runtime.agent.store.get(started.json().id),
      (r) => !['running', 'waiting'].includes(r.status),
    );
    assert.equal(run.status, 'completed', JSON.stringify(run));
    assert.equal(run.mode, 'plan');
    assert.equal(f.runtime.agent.continuity.get(f.session.id).mode, 'plan');
    assert.equal(run.permissions.length, 0);
    assert.equal(run.changes.length, 0);
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'original\n');
    await assert.rejects(readFile(join(f.workspace, 'command.txt')), { code: 'ENOENT' });
    const plan = f.runtime.agent.continuity.get(f.session.id).plan!;
    assert.match(plan.text, /Change file.txt/);
    assert.equal(
      (
        await f.request('PUT', `/api/sessions/${f.session.id}/plan`, {
          text: 'Reviewed: update file.txt',
          revision: plan.revision,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.request('POST', `/api/sessions/${f.session.id}/plan/implement`, {
          revision: plan.revision,
        })
      ).statusCode,
      409,
    );
    const revision = f.runtime.agent.continuity.get(f.session.id).plan!.revision;
    const implementation = await f.request('POST', `/api/sessions/${f.session.id}/plan/implement`, {
      revision,
    });
    assert.equal(implementation.statusCode, 202, implementation.body);
    assert.equal(
      (await f.request('POST', `/api/sessions/${f.session.id}/plan/implement`, { revision })).json()
        .id,
      implementation.json().id,
    );
    const result = await until(
      () => f.runtime.agent.store.get(implementation.json().id),
      (r) => {
        for (const p of r.permissions)
          if (p.status === 'pending') f.runtime.agent.decide(r.id, p.id, true);
        return !['running', 'waiting'].includes(r.status);
      },
    );
    assert.equal(result.mode, 'build');
    assert.equal(result.status, 'completed');
    assert.equal(result.permissions.length, 1);
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'reviewed\n');
    f.runtime.agent.continuity.update(f.session.id, { draft: 'Keep my unsent follow-up' });
    const preview = await f.runtime.agent.continuity.preview(f.session.id, run.id);
    await f.runtime.agent.continuity.rewind(f.session.id, run.id, preview.revision, []);
    const restoredPlan = f.runtime.agent.continuity.get(f.session.id);
    assert.equal(restoredPlan.mode, 'plan');
    assert.equal(restoredPlan.plan!.text, 'Reviewed: update file.txt');
    assert.equal(restoredPlan.plan!.implementedBy, null);
    assert.ok(restoredPlan.plan!.revision > revision);
    assert.equal(restoredPlan.draft, 'Keep my unsent follow-up');
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'reviewed\n');
    const branch = f.runtime.agent.continuity.fork(f.session.id, run.id, 'Plan alternative');
    const branchState = f.runtime.agent.continuity.get(branch.id);
    assert.equal(branchState.mode, 'plan');
    assert.equal(branchState.plan!.text, 'Reviewed: update file.txt');
    assert.notEqual(branchState.plan!.runId, run.id);
    assert.equal(branchState.plan!.implementedBy, null);
  } finally {
    await f.close();
  }
});

test('scope instructions resolve global to directory, reject junctions and reveal new scope before tools execute', async () => {
  const f = await setup((request) => {
    const index = toolsAfterUser(request);
    return index < 4
      ? { tool: 'read_file', input: { path: index < 2 ? 'src/deep/code.ts' : 'file.txt' } }
      : { text: 'Inspected scoped files.' };
  });
  try {
    const global = join(f.directory, 'global.md');
    await writeFile(global, 'GLOBAL_RULE');
    await writeFile(join(f.workspace, 'PEAPER.md'), 'PROJECT_RULE');
    await mkdir(join(f.workspace, 'src/deep'), { recursive: true });
    await writeFile(join(f.workspace, 'src/PEAPER.md'), 'DIRECTORY_RULE');
    await writeFile(join(f.workspace, 'src/deep/code.ts'), 'FILE_CONTENT');
    const loader = new InstructionLoader(f.workspace, f.dataDirectory, global);
    const sources = await loader.load('src/deep/code.ts');
    assert.deepEqual(
      sources.map((s) => s.scope),
      ['global', 'project', 'directory'],
    );
    await assert.rejects(loader.load('../outside'), /inside the workspace/);
    await symlink(
      join(f.workspace, 'src'),
      join(f.workspace, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(loader.load('linked/deep/code.ts'), /junctions/);
    const run = f.runtime.agent.start(f.session.id, 'Inspect nested code', null, undefined, {
      mode: 'plan',
    });
    const result = await until(
      () => f.runtime.agent.store.get(run.id),
      (r) => !['running', 'waiting'].includes(r.status),
    );
    assert.equal(result.status, 'completed');
    assert.match(result.activities[0]!.output!, /action has not executed/);
    assert.ok(!result.activities[0]!.output!.includes('FILE_CONTENT'));
    assert.match(result.activities[1]!.output!, /FILE_CONTENT/);
    assert.ok(result.instructions.some((s) => s.content === 'DIRECTORY_RULE'));
    const requests = f.model.requests.filter(
      (r) => r.tool_choice?.function?.name !== 'peaper_connection_check',
    );
    assert.ok(
      requests.some((request) =>
        request.messages.some((m) => m.role === 'system' && m.content?.includes('DIRECTORY_RULE')),
      ),
    );
    assert.ok(
      requests
        .at(-1)!
        .messages.every((m) => m.role !== 'system' || !m.content?.includes('DIRECTORY_RULE')),
    );
    assert.match(result.activities[2]!.output!, /action has not executed/);
    assert.match(result.activities[3]!.output!, /original/);
  } finally {
    await f.close();
  }
});

test('interrupted tasks retain completed tool messages; resume creates one new run and asks for fresh approval', async () => {
  const f = await setup((request) => {
    const user = request.messages.findLast((m) => m.role === 'user')?.content ?? '';
    const index = toolsAfterUser(request);
    if (user.includes('Recovery context'))
      return index === 0
        ? {
            tool: 'edit_file',
            input: { path: 'file.txt', oldText: 'original', newText: 'resumed' },
          }
        : { text: 'Continued after inspection.' };
    return index === 0
      ? { tool: 'read_file', input: { path: 'file.txt' } }
      : { tool: 'run_command', input: { command: 'node -e "console.log(\'must-not-replay\')"' } };
  });
  try {
    const run = f.runtime.agent.start(f.session.id, 'Read then inspect command');
    await until(
      () => f.runtime.agent.store.get(run.id),
      (r) => r.permissions.some((p) => p.status === 'pending'),
    );
    await f.reopen();
    const stopped = f.runtime.agent.store.get(run.id);
    assert.equal(stopped.status, 'interrupted');
    assert.ok(stopped.permissions.every((p) => p.status === 'cancelled'));
    const beforeResume = f.model.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(f.model.requests.length, beforeResume);
    assert.match(JSON.stringify(f.runtime.agent.continuity.history(f.session.id)), /original/);
    const resumed = (await f.request('POST', `/api/runs/${run.id}/resume`, {})).json();
    assert.equal((await f.request('POST', `/api/runs/${run.id}/resume`, {})).json().id, resumed.id);
    const waiting = await until(
      () => f.runtime.agent.store.get(resumed.id),
      (r) => r.permissions.some((p) => p.status === 'pending'),
    );
    assert.notEqual(waiting.permissions[0]!.id, stopped.permissions[0]!.id);
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'original\n');
    const results = f.model.requests.slice(beforeResume);
    assert.ok(
      results.some((r) =>
        r.messages.some(
          (m) => m.role === 'user' && m.content?.includes('Completed tools must not be replayed'),
        ),
      ),
    );
    assert.equal(waiting.activities.filter((a) => a.name === 'run_command').length, 0);
    await f.runtime.agent.cancel(resumed.id);
  } finally {
    await f.close();
  }
});

test('manual compaction preserves full transcripts, includes a recap in future requests and forks without replaying tools or files', async () => {
  const f = await setup((request) =>
    request.messages.some((m) => m.content?.includes('PEAPER_COMPACTION'))
      ? {
          text: 'RECAP_VERIFIED: original task completed; file.txt unchanged; verify before editing.',
        }
      : { text: 'Continued from recap.' },
  );
  try {
    const runs = Array.from({ length: 5 }, (_, i) =>
      turn(f, `Question ${i}`, `Verified answer ${i}`),
    );
    const compacted = await f.request('POST', `/api/sessions/${f.session.id}/compact`, {});
    assert.equal(compacted.statusCode, 200, compacted.body);
    assert.equal(compacted.json().compactedTurns, 3);
    assert.equal(compacted.json().totalTurns, 5);
    assert.equal(f.runtime.agent.store.list(f.session.id).length, 5);
    const next = f.runtime.agent.start(f.session.id, 'Continue now');
    await until(
      () => f.runtime.agent.store.get(next.id),
      (r) => r.status === 'completed',
    );
    assert.ok(f.model.requests.at(-1)!.messages.some((m) => m.content?.includes('RECAP_VERIFIED')));
    const count = f.model.requests.length;
    const forked = await f.request('POST', `/api/sessions/${f.session.id}/fork`, {
      afterRunId: runs[3]!.id,
      title: 'Alternate branch',
    });
    assert.equal(forked.statusCode, 201, forked.body);
    const child = forked.json();
    const copied = f.runtime.agent.store.list(child.id);
    assert.equal(copied.length, 4);
    assert.ok(copied.every((r) => r.inheritedFrom));
    assert.deepEqual(
      f.runtime.agent.store.selection(child.id),
      f.runtime.agent.store.selection(f.session.id),
    );
    const childState = f.runtime.agent.continuity.get(child.id);
    assert.equal(childState.parent!.sessionId, f.session.id);
    assert.equal(childState.compaction!.throughRunId, copied[2]!.id);
    f.runtime.agent.continuity.update(child.id, { draft: 'Independent draft' });
    assert.equal(f.runtime.agent.continuity.get(f.session.id).draft, '');
    assert.equal(f.model.requests.length, count);
    assert.equal((await f.runtime.agent.continuity.preview(child.id, null)).files.length, 0);
    const exported = (
      await f.request('GET', `/api/sessions/${f.session.id}/export?format=markdown`)
    ).json().content;
    assert.match(exported, /Verified answer 0/);
  } finally {
    await f.close();
  }
});

test('automatic compaction budgets completed history and refuses a single oversized prompt before contacting the provider', async () => {
  const f = await setup((request) =>
    request.messages.some((m) => m.content?.includes('PEAPER_COMPACTION'))
      ? { text: 'Small historical recap.' }
      : { text: 'Context fits.' },
  );
  try {
    for (let i = 0; i < 8; i++) turn(f, `Historical ${i}`, 'verified '.repeat(1600));
    const run = f.runtime.agent.start(f.session.id, 'Continue');
    const result = await until(
      () => f.runtime.agent.store.get(run.id),
      (r) => !['running', 'waiting'].includes(r.status),
    );
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(result.context!.compacted, true);
    assert.ok(result.context!.estimatedTokens < result.context!.budget);
    const empty = f.runtime.database.createSession(f.runtime.workspace.id, 'Oversized').session;
    const count = f.model.requests.length;
    const huge = f.runtime.agent.start(empty.id, 'Z'.repeat(150000));
    const stopped = await until(
      () => f.runtime.agent.store.get(huge.id),
      (r) => r.status === 'failed',
    );
    assert.match(stopped.error!, /Context budget reached/);
    assert.equal(f.model.requests.length, count);
  } finally {
    await f.close();
  }
});

test('restore rejects manual edits and stale previews, restores only selected files without rewinding, and conversation rewind never alters files', async () => {
  const f = await setup();
  try {
    const first = turn(f, 'Keep this turn');
    const changed = turn(f, 'archiveword later task');
    await checkpoint(f, changed, 'file.txt', 'original\n', 'Peaper edit\n');
    await checkpoint(f, changed, 'new.txt', null, 'created by Peaper');
    let preview = await f.runtime.agent.continuity.preview(f.session.id, first.id);
    assert.equal(preview.files.length, 2);
    assert.ok(preview.files.every((file) => !file.conflict));
    await writeFile(join(f.workspace, 'file.txt'), 'Manual edit\n');
    const stale = await f.request('POST', `/api/sessions/${f.session.id}/restore`, {
      afterRunId: first.id,
      revision: preview.revision,
      paths: ['file.txt'],
    });
    assert.equal(stale.statusCode, 409);
    preview = await f.runtime.agent.continuity.preview(f.session.id, first.id);
    assert.match(
      preview.files.find((file) => file.path === 'file.txt')!.conflict!,
      /Manual or external/,
    );
    const blocked = await f.request('POST', `/api/sessions/${f.session.id}/restore`, {
      afterRunId: first.id,
      revision: preview.revision,
      paths: ['file.txt'],
    });
    assert.equal(blocked.statusCode, 400);
    const removed = await f.request('POST', `/api/sessions/${f.session.id}/restore`, {
      afterRunId: first.id,
      revision: preview.revision,
      paths: ['new.txt'],
    });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.deepEqual(removed.json(), { rewound: 0, restored: 1 });
    assert.equal(f.runtime.agent.store.list(f.session.id).length, 2);
    assert.match(
      JSON.stringify(f.runtime.agent.continuity.history(f.session.id)),
      /Workspace restore notice/,
    );
    await assert.rejects(readFile(join(f.workspace, 'new.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'Manual edit\n');
    preview = await f.runtime.agent.continuity.preview(f.session.id, first.id);
    assert.equal(
      (
        await f.request('POST', `/api/sessions/${f.session.id}/rewind`, {
          afterRunId: first.id,
          revision: preview.revision,
          paths: ['file.txt'],
        })
      ).statusCode,
      400,
    );
    const rewound = await f.request('POST', `/api/sessions/${f.session.id}/rewind`, {
      afterRunId: first.id,
      revision: preview.revision,
      paths: [],
    });
    assert.equal(rewound.statusCode, 200, rewound.body);
    assert.equal(rewound.json().rewound, 1);
    assert.equal(f.runtime.agent.store.list(f.session.id).length, 1);
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'Manual edit\n');
    assert.equal((await f.request('GET', '/api/sessions?q=archiveword')).json().sessions.length, 0);
    const exported = JSON.parse(
      (await f.request('GET', `/api/sessions/${f.session.id}/export?format=json`)).json().content,
    );
    assert.equal(exported.runs.length, 2);
    assert.equal(exported.runs[1].archived, true);
  } finally {
    await f.close();
  }
});

test('checkpoint chains block unconfirmed writes and edits between Peaper actions, and exact restoration guards a last-moment file change', async () => {
  const f = await setup();
  try {
    const run = turn(f, 'Change a file');
    await checkpoint(f, run, 'file.txt', 'original\n', 'first');
    await checkpoint(f, run, 'file.txt', 'external edit', 'second');
    let preview: RewindPreview = await f.runtime.agent.continuity.preview(f.session.id, null);
    assert.match(preview.files[0]!.conflict!, /between Peaper edits/);
    const pending = turn(f, 'Unconfirmed write');
    f.runtime.agent.store.stageChange(pending, {
      id: randomUUID(),
      path: 'uncertain.txt',
      before: null,
      after: 'maybe written',
    });
    await writeFile(join(f.workspace, 'uncertain.txt'), 'maybe written');
    preview = await f.runtime.agent.continuity.preview(f.session.id, run.id);
    assert.match(preview.files[0]!.conflict!, /interrupted before confirmation/);
    const edits = new WorkspaceEdits(f.workspace, f.dataDirectory);
    await assert.rejects(
      edits.restore('file.txt', 'outdated expectation', 'old contents'),
      /changed/,
    );
    assert.equal(await readFile(join(f.workspace, 'file.txt'), 'utf8'), 'second');
  } finally {
    await f.close();
  }
});

test('shutdown aborts in-flight compaction before closing persistence and leaves original history intact', async () => {
  const f = await setup(() => ({ status: 503, error: 'not available' }));
  try {
    for (let i = 0; i < 3; i++) turn(f, `Task ${i}`);
    const configured = configuredSelection(f.runtime.providers);
    await assert.rejects(
      f.runtime.agent.continuity.compact(f.session.id, configured),
      /Provider request failed/,
    );
    assert.equal(f.runtime.agent.continuity.get(f.session.id).compaction, null);
    assert.equal(f.runtime.agent.store.list(f.session.id).length, 3);
    const pending = f.runtime.agent.continuity.compact(f.session.id, configured);
    const closing = f.runtime.agent.close();
    await assert.rejects(pending);
    await closing;
    assert.equal(f.runtime.agent.continuity.get(f.session.id).compaction, null);
    assert.equal(f.runtime.agent.continuity.busy.size, 0);
  } finally {
    await f.close();
  }
});

test('M3 migration preserves M2 sessions and seeds historical file checkpoints and conversation search', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-m3-upgrade-'));
  const migrations = join(directory, 'm2-migrations'),
    workspace = join(directory, 'workspace');
  await mkdir(migrations);
  await mkdir(workspace);
  for (const name of ['0001_foundation.sql', '0002_agent.sql', '0003_model_selection.sql'])
    await copyFile(resolve('packages/core/migrations', name), join(migrations, name));
  const data = join(directory, 'data');
  let database = new PeaperDatabase(data, migrations);
  try {
    const project = database.workspace(workspace);
    const session = database.createSession(project.id, 'Existing M2 session').session;
    const store = new AgentStore(database, project.id, () => {});
    const run = store.create(session.id, 'migrationword task', 'fixture-model');
    run.status = 'completed';
    run.text = 'Existing answer';
    run.changes = [{ id: randomUUID(), path: 'old.txt', before: 'before', after: 'after' }];
    store.save(run, [
      { role: 'user', content: run.prompt },
      { role: 'assistant', content: run.text },
    ]);
    database.close();
    database = new PeaperDatabase(data, resolve('packages/core/migrations'));
    assert.equal(database.schemaVersion, 6);
    assert.equal(database.listSessions(project.id, 'migrationword')[0]!.id, session.id);
    const checkpoint = database.sqlite
      .prepare(
        'SELECT path,before_content,after_content,state FROM file_checkpoints WHERE run_id=?',
      )
      .get(run.id);
    assert.deepEqual(checkpoint, {
      path: 'old.txt',
      before_content: 'before',
      after_content: 'after',
      state: 'applied',
    });
    assert.equal(
      new AgentStore(database, project.id, () => {}).list(session.id)[0]!.text,
      'Existing answer',
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
