import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPeaperServer } from '../apps/server/src/index.js';
import { AgentStore } from '../packages/core/src/agent/store.js';
import { KnowledgeStore } from '../packages/core/src/knowledge/store.js';
import { parseSkill } from '../packages/core/src/skills/service.js';
import type { AgentRun } from '../packages/shared/src/index.js';
import { modelFixture, type FixtureRequest, type FixtureReply } from './helpers/model-fixture.js';

const document = (
  name: string,
  body: string,
  description = 'Procedure metadata for project verification.',
) => `---\nname: ${name}\ndescription: ${description}\ncompatibility: Node.js 24\n---\n${body}\n`;
async function setup(
  respond: (request: FixtureRequest) => FixtureReply = () => ({ text: 'Task complete.' }),
) {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-knowledge-')),
    workspace = join(directory, 'workspace'),
    dataDirectory = join(directory, 'profile');
  await mkdir(workspace);
  await writeFile(join(workspace, 'code.mjs'), 'export const value = 1;\n');
  const model = await modelFixture(respond);
  const options = {
    workspace,
    dataDirectory,
    distributionDirectory: resolve('dist'),
    version: 'test',
  };
  let runtime = await createPeaperServer(options);
  const request = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    runtime.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${runtime.token}` },
      ...(payload ? { payload } : {}),
    });
  await request('PUT', '/api/provider', {
    kind: 'compatible',
    baseURL: model.url,
    model: 'fixture-model',
    apiKey: 'local-test-key',
  });
  assert.equal((await request('POST', '/api/provider/test')).statusCode, 200);
  const session = runtime.database.createSession(runtime.workspace.id, 'M4 verification').session;
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
type Fixture = Awaited<ReturnType<typeof setup>>;
const memoryDraft = (note: import('../packages/shared/src/knowledge.js').MemoryNote) => ({
  ...note,
  evidence: note.evidence.map((e) => e.reference),
});
async function until(f: Fixture, id: string, predicate: (run: AgentRun) => boolean) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const run = f.runtime.agent.store.get(id);
    if (predicate(run)) return run;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`Task timed out: ${JSON.stringify(f.runtime.agent.store.get(id))}`);
}
const finished = (r: AgentRun) => !['running', 'waiting'].includes(r.status);
const steps = (r: FixtureRequest) =>
  r.messages
    .slice(r.messages.findLastIndex((m) => m.role === 'user') + 1)
    .filter((m) => m.role === 'tool').length;

test('skill discovery keeps bodies out of model context, resolves explicit/manual names and honors enable/automatic settings', async () => {
  const f = await setup();
  try {
    const skills = f.runtime.agent.knowledge.skills;
    await skills.save('personal', document('code-review', 'PERSONAL_BODY_SECRET'), 'code-review');
    await skills.save('project', document('code-review', 'PROJECT_BODY_SECRET'), 'code-review');
    const catalog = await skills.catalog();
    assert.equal(catalog.skills.filter((s) => s.name === 'code-review').length, 3);
    assert.ok(!JSON.stringify(catalog).includes('BODY_SECRET'));
    assert.equal(await skills.resolveName('code-review'), 'project:code-review');
    assert.equal(await skills.resolveName('personal:code-review'), 'personal:code-review');
    const plain = f.runtime.agent.start(f.session.id, 'Explain the current export');
    const plainResult = await until(f, plain.id, finished);
    assert.equal(plainResult.knowledge.skills.length, 0);
    assert.ok(!JSON.stringify(f.model.requests.at(-1)).includes('BODY_SECRET'));
    await skills.preference('project:code-review', true, false);
    assert.ok(!(await f.runtime.agent.knowledge.available()).some((s) => s.name === 'code-review'));
    await assert.rejects(
      f.runtime.agent.knowledge.load('project:code-review', 'automatic'),
      /automatic invocation/,
    );
    const manual = f.runtime.agent.start(f.session.id, '/code-review inspect this file');
    const result = await until(f, manual.id, finished);
    assert.equal(result.status, 'completed');
    assert.equal(result.knowledge.skills[0]!.id, 'project:code-review');
    assert.equal(result.knowledge.skills[0]!.invocation, 'manual');
    assert.equal(
      result.knowledge.skills[0]!.activationReason,
      'Invoked by slash command in this task.',
    );
    assert.match(JSON.stringify(f.model.requests.at(-1)), /PROJECT_BODY_SECRET/);
    await skills.preference('project:code-review', false, false);
    assert.equal(await skills.resolveName('code-review'), 'personal:code-review');
    await assert.rejects(skills.detail('project:code-review'), /disabled/);
    const disabled = f.runtime.agent.start(f.session.id, 'Inspect', null, undefined, {
      context: { profileId: 'none', skillIds: ['project:code-review'] },
    });
    assert.match((await until(f, disabled.id, finished)).error!, /disabled/);
    f.runtime.agent.knowledge.store.select(f.session.id, { profileId: 'none', skillIds: [] });
    f.runtime.agent.continuity.update(f.session.id, {
      draft: '/remember project Keep the export stable',
    });
    assert.ok((await f.runtime.agent.continuity.info(f.session.id)).knowledge);
    f.runtime.agent.continuity.update(f.session.id, {
      draft: '/unfinished-command still being typed',
    });
    assert.ok((await f.runtime.agent.continuity.info(f.session.id)).knowledge);
  } finally {
    await f.close();
  }
});

test('local skill import copies bounded resources, excludes private files and rejects malformed metadata, junctions and conflicting edits', async () => {
  const f = await setup();
  try {
    const source = join(f.directory, 'local-check');
    await mkdir(join(source, 'references'), { recursive: true });
    await mkdir(join(source, 'scripts'));
    await writeFile(
      join(source, 'SKILL.md'),
      document('local-check', 'Read references/guide.md before scripts/check.mjs.'),
    );
    await writeFile(join(source, 'references/guide.md'), 'REFERENCE_EVIDENCE');
    await writeFile(join(source, 'scripts/check.mjs'), "console.log('SCRIPT_OK');\n");
    await writeFile(join(source, '.env'), 'SECRET_NOT_IMPORTED');
    const imported = await f.request('POST', '/api/skills/import', {
      path: source,
      scope: 'project',
    });
    assert.equal(imported.statusCode, 200, imported.body);
    const detail = imported.json();
    assert.equal(detail.resources.length, 2);
    await assert.rejects(readFile(join(f.workspace, '.peaper/skills/local-check/.env')), {
      code: 'ENOENT',
    });
    const resource = await f.request(
      'GET',
      '/api/skills/project%3Alocal-check/resource?path=references%2Fguide.md',
    );
    assert.equal(resource.statusCode, 200, resource.body);
    assert.equal(resource.json().content, 'REFERENCE_EVIDENCE');
    assert.equal(
      (await f.request('GET', '/api/skills/project%3Alocal-check/resource?path=..%2F..%2Fcode.mjs'))
        .statusCode,
      400,
    );
    const edited = await f.request('PUT', '/api/skills/project%3Alocal-check', {
      digest: detail.digest,
      document: document('local-check', 'Updated procedure'),
    });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(
      (
        await f.request('PUT', '/api/skills/project%3Alocal-check', {
          digest: detail.digest,
          document: document('local-check', 'Stale edit'),
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.request('POST', '/api/skills/import', { path: source, scope: 'project' }))
        .statusCode,
      409,
    );
    assert.throws(
      () => parseSkill(document('different-name', 'body'), 'local-check'),
      /parent directory/,
    );
    assert.throws(
      () => parseSkill('---\nname: bad\ndescription: [not, text]\n---\nbody', 'bad'),
      /Invalid skill metadata/,
    );
    const linked = join(f.directory, 'linked-check');
    await symlink(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(
      (await f.request('POST', '/api/skills/import', { path: linked, scope: 'personal' }))
        .statusCode,
      403,
    );
    const badResource = join(source, 'references/outside.md');
    await symlink(
      join(f.workspace, 'code.mjs'),
      badResource,
      process.platform === 'win32' ? 'file' : undefined,
    );
    const rejected = await f.request('POST', '/api/skills/import', {
      path: source,
      scope: 'personal',
    });
    assert.equal(rejected.statusCode, 409, rejected.body);
  } finally {
    await f.close();
  }
});

test('the agent loads an automatic skill, reads a resource and runs its script only after fresh command approval with literal arguments', async () => {
  const argument = 'a\'; Write-Output injected; #\nUnicode ’ ‘ and quotes " remain literal';
  const f = await setup(
    (request) =>
      ([
        {
          tool: 'load_skill',
          input: {
            id: 'project:local-check',
            reason: 'Matches the requested project verification.',
          },
        },
        {
          tool: 'read_skill_resource',
          input: { id: 'project:local-check', path: 'references/guide.md' },
        },
        {
          tool: 'run_skill_script',
          input: { id: 'project:local-check', path: 'scripts/check.mjs', args: [argument] },
        },
        { text: 'Used the procedure and reported its real script output.' },
      ][steps(request)] as FixtureReply) ?? { text: 'Complete.' },
  );
  try {
    const skills = f.runtime.agent.knowledge.skills;
    await skills.save(
      'project',
      document('local-check', 'Use references/guide.md and scripts/check.mjs for verification.'),
      'local-check',
    );
    const root = join(f.workspace, '.peaper/skills/local-check');
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'references'));
    await writeFile(join(root, 'references/guide.md'), 'REFERENCE_LOADED_ON_DEMAND');
    await writeFile(
      join(root, 'scripts/check.mjs'),
      "console.log('SKILL_SCRIPT_OK:' + JSON.stringify(process.argv.slice(2)));\n",
    );
    const run = f.runtime.agent.start(f.session.id, 'Verify using the project procedure');
    const waiting = await until(f, run.id, (r) =>
      r.permissions.some((p) => p.status === 'pending'),
    );
    assert.equal(waiting.knowledge.skills[0]!.invocation, 'automatic');
    assert.equal(waiting.permissions[0]!.kind, 'command');
    assert.match(waiting.permissions[0]!.command!, /check.mjs/);
    assert.match(waiting.activities[1]!.output!, /REFERENCE_LOADED_ON_DEMAND/);
    assert.ok(!waiting.activities[2]!.output?.includes('SKILL_SCRIPT_OK'));
    f.runtime.agent.decide(run.id, waiting.permissions[0]!.id, true);
    const result = await until(f, run.id, finished);
    assert.equal(result.status, 'completed');
    const output = JSON.parse(result.activities[2]!.output!);
    assert.equal(output.exitCode, 0);
    assert.match(output.output, /SKILL_SCRIPT_OK:/);
    assert.ok(output.output.includes(JSON.stringify([argument])));
    assert.equal(result.permissions.length, 1);
    assert.equal(
      result.knowledge.skills[0]!.activationReason,
      'Matches the requested project verification.',
    );
    await f.reopen();
    assert.equal(
      f.runtime.agent.store.get(run.id).knowledge.skills[0]!.activationReason,
      'Matches the requested project verification.',
    );
  } finally {
    await f.close();
  }
});

test('inspector authenticates read-only checks, exposes nested files for disabled skills and never runs their scripts', async () => {
  const f = await setup();
  try {
    await f.runtime.agent.knowledge.skills.save(
      'project',
      document('inspect-me', 'Read scripts/helpers/check.mjs and references/missing.md.'),
      'inspect-me',
    );
    const root = join(f.workspace, '.peaper/skills/inspect-me');
    await mkdir(join(root, 'scripts/helpers'), { recursive: true });
    await writeFile(
      join(root, 'scripts/helpers/check.mjs'),
      "import {writeFileSync} from 'node:fs'; writeFileSync('never-run.txt', 'bad');",
    );
    await f.runtime.agent.knowledge.skills.preference('project:inspect-me', false, false);
    const route = '/api/skills/project%3Ainspect-me/inspection';
    assert.equal((await f.runtime.app.inject({ method: 'GET', url: route })).statusCode, 401);
    const response = await f.request('GET', route);
    assert.equal(response.statusCode, 200, response.body);
    const report = response.json();
    assert.equal(report.skill.enabled, false);
    assert.equal(report.skill.resources[0].path, 'scripts/helpers/check.mjs');
    assert.deepEqual(
      report.references.map((r: { path: string; status: string }) => [r.path, r.status]),
      [
        ['scripts/helpers/check.mjs', 'found'],
        ['references/missing.md', 'missing'],
      ],
    );
    assert.equal(report.runtimes[0].status, 'available');
    await assert.rejects(readFile(join(f.workspace, 'never-run.txt')), { code: 'ENOENT' });
    assert.equal(f.runtime.agent.store.list(f.session.id).length, 0);
  } finally {
    await f.close();
  }
});

test('skill scripts reject changed files after approval and Plan cannot execute them', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? {
          tool: 'run_skill_script',
          input: { id: 'project:local-check', path: 'scripts/check.mjs', args: [] },
        }
      : { text: 'No further actions.' },
  );
  try {
    await f.runtime.agent.knowledge.skills.save(
      'project',
      document('local-check', 'Run the check only after approval.'),
      'local-check',
    );
    const root = join(f.workspace, '.peaper/skills/local-check');
    await mkdir(join(root, 'scripts'));
    await writeFile(join(root, 'scripts/check.mjs'), "console.log('ORIGINAL_SCRIPT');\n");
    const run = f.runtime.agent.start(f.session.id, 'Run check', null, undefined, {
      context: { profileId: 'none', skillIds: ['project:local-check'] },
    });
    const waiting = await until(f, run.id, (r) => r.status === 'waiting');
    await writeFile(
      join(root, 'scripts/check.mjs'),
      "require('fs').writeFileSync('unexpected.txt', 'changed');\n",
    );
    f.runtime.agent.decide(run.id, waiting.permissions[0]!.id, true);
    const result = await until(f, run.id, finished);
    assert.match(result.activities[0]!.output!, /changed after approval/);
    await assert.rejects(readFile(join(f.workspace, 'unexpected.txt')), { code: 'ENOENT' });
    const plan = f.runtime.agent.start(f.session.id, 'Plan a check', null, undefined, {
      mode: 'plan',
    });
    const planned = await until(f, plan.id, finished);
    assert.equal(planned.permissions.length, 0);
    assert.equal(planned.changes.length, 0);
    await assert.rejects(readFile(join(f.workspace, 'unexpected.txt')), { code: 'ENOENT' });
  } finally {
    await f.close();
  }
});

test('profile and manual selections persist across restart and fork; captured task context is stable and profiles are scoped', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? { tool: 'ask_user', input: { question: 'Continue?', options: ['Yes'] } }
      : { text: 'Completed with captured profile.' },
  );
  try {
    const store = f.runtime.agent.knowledge.store;
    const profile = store.saveProfile({
      name: 'Reviewer',
      description: 'Focused review',
      instructions: 'PROFILE_CAPTURED_ORIGINAL',
      scope: 'project',
    });
    store.setDefaultProfile(profile.id);
    store.select(f.session.id, { profileId: 'default', skillIds: ['builtin:testing'] });
    const run = f.runtime.agent.start(f.session.id, 'Inspect the export');
    const waiting = await until(f, run.id, (r) => r.questions.some((q) => q.status === 'pending'));
    assert.equal(waiting.knowledge.persona!.instructions, 'PROFILE_CAPTURED_ORIGINAL');
    store.saveProfile(
      { ...profile, name: 'Careful Reviewer', instructions: 'PROFILE_UPDATED_FUTURE' },
      profile.id,
      profile.revision,
    );
    f.runtime.agent.answer(run.id, waiting.questions[0]!.id, 'Yes');
    const result = await until(f, run.id, finished);
    assert.equal(result.knowledge.persona!.instructions, 'PROFILE_CAPTURED_ORIGINAL');
    assert.equal(result.knowledge.persona!.name, 'Reviewer');
    assert.ok(!JSON.stringify(f.model.requests.at(-1)).includes('PROFILE_UPDATED_FUTURE'));
    const fork = f.runtime.agent.continuity.fork(f.session.id, run.id, 'Profile fork');
    assert.deepEqual(store.selection(fork.id), store.selection(f.session.id));
    await f.reopen();
    assert.equal(f.runtime.agent.store.get(run.id).knowledge.persona!.name, 'Reviewer');
    assert.equal(f.runtime.agent.store.list(fork.id)[0]!.knowledge.persona!.name, 'Reviewer');
    assert.equal(
      (await f.runtime.agent.knowledge.snapshot(f.session.id, 'Next task')).persona!.name,
      'Careful Reviewer',
    );
    assert.equal(
      (
        await f.runtime.agent.knowledge.snapshot(f.session.id, 'No profile', {
          profileId: 'none',
          skillIds: [],
        })
      ).persona,
      null,
    );
    assert.equal(
      f.runtime.agent.knowledge.store.profile(profile.id).instructions,
      'PROFILE_UPDATED_FUTURE',
    );
    assert.deepEqual(f.runtime.agent.knowledge.store.selection(f.session.id), {
      profileId: 'default',
      skillIds: ['builtin:testing'],
    });
    const otherPath = join(f.directory, 'other');
    await mkdir(otherPath);
    const other = f.runtime.database.workspace(otherPath);
    const foreignStore = new KnowledgeStore(
      f.runtime.database,
      other.id,
      new AgentStore(f.runtime.database, other.id, () => {}),
      () => {},
    );
    assert.throws(() => foreignStore.profile(profile.id), /not found/);
    const personal = f.runtime.agent.knowledge.store.saveProfile({
      name: 'Personal',
      instructions: 'GLOBAL_PROFILE',
      scope: 'personal',
    });
    assert.equal(foreignStore.profile(personal.id).instructions, 'GLOBAL_PROFILE');
  } finally {
    await f.close();
  }
});

test('memory respects global/project/session scope, pins, index update/delete, revisions and persistence without vector search', async () => {
  const f = await setup();
  try {
    const store = f.runtime.agent.knowledge.store;
    const global = store.saveMemory({
      title: 'Shared preference',
      body: 'GLOBAL_COBALT_PREF',
      scope: 'global',
      pinned: true,
    });
    const project = store.saveMemory({
      title: 'Project decision',
      body: 'PROJECT_QUASAR_DECISION',
      scope: 'project',
    });
    const recap = store.saveMemory({
      title: 'Current progress',
      body: 'RECAP_SOURCE_ONLY',
      scope: 'recap',
      sessionId: f.session.id,
      pinned: true,
    });
    const second = f.runtime.database.createSession(
      f.runtime.workspace.id,
      'Another session',
    ).session;
    assert.ok(store.retrieve(second.id, 'quasar').memories.some((m) => m.id === project.id));
    assert.ok(!store.retrieve(second.id, 'RECAP').memories.some((m) => m.id === recap.id));
    const otherPath = join(f.directory, 'other');
    await mkdir(otherPath);
    const other = f.runtime.database.workspace(otherPath);
    const otherSession = f.runtime.database.createSession(other.id, 'Other workspace').session;
    const foreign = new KnowledgeStore(
      f.runtime.database,
      other.id,
      new AgentStore(f.runtime.database, other.id, () => {}),
      () => {},
    );
    assert.ok(foreign.retrieve(otherSession.id, 'quasar').memories.some((m) => m.id === global.id));
    assert.throws(() => foreign.memory(project.id), /not found/);
    assert.ok(
      !foreign
        .retrieve(otherSession.id, 'quasar recap')
        .memories.some((m) => [project.id, recap.id].includes(m.id)),
    );
    const updated = store.saveMemory(
      { ...project, title: 'Updated project', body: 'NEW_ORCHID_DECISION', pinned: true },
      project.id,
      project.revision,
    );
    assert.equal(store.listMemories('QUASAR').length, 0);
    assert.equal(store.listMemories('ORCHID')[0]!.id, project.id);
    assert.throws(
      () => store.saveMemory({ ...project, body: 'Stale' }, project.id, project.revision),
      /changed/,
    );
    assert.throws(
      () =>
        foreign.saveMemory({
          title: 'Bad recap',
          body: 'Should fail',
          scope: 'recap',
          sessionId: f.session.id,
        }),
      /not found/,
    );
    store.deleteMemory(project.id, updated.revision);
    assert.equal(store.listMemories('ORCHID').length, 0);
    assert.ok(!store.retrieve(f.session.id, 'ORCHID').memories.some((m) => m.id === project.id));
    await f.reopen();
    assert.equal(f.runtime.agent.knowledge.store.memory(global.id).body, 'GLOBAL_COBALT_PREF');
    const run = f.runtime.agent.start(f.session.id, 'Continue progress');
    const result = await until(f, run.id, finished);
    assert.ok(result.knowledge.memories.some((m) => m.id === global.id));
    assert.ok(result.knowledge.memories.some((m) => m.id === recap.id));
    assert.ok(!JSON.stringify(f.model.requests.at(-1)).includes('NEW_ORCHID_DECISION'));
    const info = await f.runtime.agent.continuity.info(f.session.id);
    assert.ok(info.knowledge!.memories.some((m) => m.id === global.id));
  } finally {
    await f.close();
  }
});

test('agent memory suggestions require a user decision, accept edited scope/content once and never publish dismissed suggestions into retrieval', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? {
          tool: 'propose_memory',
          input: {
            title: 'Suggested design decision',
            body: 'SUGGESTED_NOT_PERMANENT',
            scope: 'project',
          },
        }
      : { text: 'A memory suggestion is waiting for your review.' },
  );
  try {
    const run = f.runtime.agent.start(f.session.id, 'Propose a useful decision note');
    const result = await until(f, run.id, finished),
      proposal = result.memorySuggestions[0]!;
    assert.equal(proposal.status, 'pending');
    assert.equal(f.runtime.agent.knowledge.store.listMemories('SUGGESTED').length, 0);
    const accepted = await f.request('POST', `/api/memory-suggestions/${proposal.id}`, {
      action: 'save',
      edited: {
        title: 'Reviewed decision',
        body: 'USER_REVIEWED_NOTE',
        scope: 'global',
        pinned: true,
      },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().status, 'saved');
    assert.equal(accepted.json().scope, 'global');
    assert.equal(accepted.json().body, 'USER_REVIEWED_NOTE');
    const again = await f.request('POST', `/api/memory-suggestions/${proposal.id}`, {
      action: 'save',
    });
    assert.equal(again.json().memoryId, accepted.json().memoryId);
    const notes = f.runtime.agent.knowledge.store.listMemories('USER_REVIEWED');
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.scope, 'global');
    assert.equal(notes[0]!.sourceRunId, run.id);
    const exported = f.runtime.agent.continuity.export(f.session.id, 'markdown');
    assert.match(exported.content, /Reviewed decision · global · saved/);
    assert.match(exported.content, /USER_REVIEWED_NOTE/);
    f.runtime.agent.knowledge.store.deleteMemory(notes[0]!.id, notes[0]!.revision);
    await f.request('POST', `/api/memory-suggestions/${proposal.id}`, { action: 'save' });
    assert.equal(f.runtime.agent.knowledge.store.listMemories('USER_REVIEWED').length, 0);
    const second = f.runtime.agent.start(f.session.id, 'Suggest another note');
    const later = await until(f, second.id, finished),
      discarded = later.memorySuggestions[0]!;
    assert.equal(
      (
        await f.request('POST', `/api/memory-suggestions/${discarded.id}`, { action: 'dismiss' })
      ).json().status,
      'dismissed',
    );
    assert.equal(f.runtime.agent.knowledge.store.listMemories('SUGGESTED').length, 0);
    assert.equal(
      (
        await f.request('POST', `/api/memory-suggestions/${discarded.id}`, { action: 'save' })
      ).json().status,
      'dismissed',
    );
  } finally {
    await f.close();
  }
});

test('scoped retrieval caps pinned context visibly and manager routes require authorization and isolate foreign project records', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? { tool: 'search_memory', input: { query: 'NEEDLE_EXACT' } }
      : { text: 'Found the scoped note.' },
  );
  try {
    const store = f.runtime.agent.knowledge.store;
    for (let i = 0; i < 5; i++)
      store.saveMemory({
        title: `Pinned ${i}`,
        body: 'large note '.repeat(700),
        scope: 'project',
        pinned: true,
      });
    const context = store.retrieve(f.session.id, 'large');
    assert.ok(context.memories.length < 5);
    assert.ok(context.warnings.length > 0);
    assert.ok(Buffer.byteLength(JSON.stringify(context.memories)) < 32500);
    const needle = store.saveMemory({
      title: 'Focused search',
      body: 'NEEDLE_EXACT unpinned evidence',
      scope: 'project',
    });
    const run = f.runtime.agent.start(f.session.id, 'Find a specific note');
    const result = await until(f, run.id, finished);
    assert.match(result.activities[0]!.output!, /NEEDLE_EXACT/);
    assert.ok(result.knowledge.memories.some((note) => note.id === needle.id));
    const unicode = store.saveMemory({
      title: 'Unicodeproof',
      body: '知'.repeat(7000),
      scope: 'project',
    });
    assert.equal(
      store.retrieve(f.session.id, 'Unicodeproof', false).memories[0]!.body,
      unicode.body,
    );
    assert.equal(
      (await f.runtime.app.inject({ method: 'GET', url: '/api/knowledge' })).statusCode,
      401,
    );
    const foreignPath = join(f.directory, 'foreign');
    await mkdir(foreignPath);
    const foreign = f.runtime.database.workspace(foreignPath);
    const foreignStore = new KnowledgeStore(
      f.runtime.database,
      foreign.id,
      new AgentStore(f.runtime.database, foreign.id, () => {}),
      () => {},
    );
    const note = foreignStore.saveMemory({
      title: 'Private decision',
      body: 'FOREIGN_PROJECT_PRIVATE',
      scope: 'project',
    });
    assert.equal((await f.request('GET', `/api/memories/${note.id}`)).statusCode, 404);
    assert.equal(
      (await f.request('DELETE', `/api/memories/${note.id}`, { revision: note.revision }))
        .statusCode,
      404,
    );
    assert.ok(!(await f.request('GET', '/api/memories?q=FOREIGN')).json().memories.length);
  } finally {
    await f.close();
  }
});

test('Memory Lens includes manual notes, excludes pinned/matching notes from initial and later search, and records exact task reasons', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? { tool: 'search_memory', input: { query: 'EXCLUDED_NEEDLE' } }
      : { text: 'Memory search complete.' },
  );
  try {
    const store = f.runtime.agent.knowledge.store;
    const blocked = store.saveMemory({
      title: 'Excluded decision',
      body: 'EXCLUDED_NEEDLE PRIVATE_NOTE_CONTEXT',
      scope: 'project',
      pinned: true,
    });
    const included = store.saveMemory({
      title: 'Unrelated preference',
      body: 'MANUAL_ONLY_CONTEXT',
      scope: 'global',
    });
    const related = store.saveMemory({
      title: 'Addition note',
      body: 'Addition export should remain stable.',
      scope: 'project',
    });
    const memory = { includeIds: [included.id], excludeIds: [blocked.id] };
    assert.ok(
      !store.retrieve(f.session.id, 'the a and').memories.some((note) => note.id === related.id),
    );
    const response = await f.request('POST', '/api/memory-lens', {
      sessionId: f.session.id,
      query: 'Inspect addition',
      selection: memory,
    });
    assert.equal(response.statusCode, 200, response.body);
    const lens = response.json();
    assert.ok(lens.memories.some((m: { id: string }) => m.id === included.id));
    assert.ok(lens.memories.some((m: { id: string }) => m.id === related.id));
    assert.ok(!lens.memories.some((m: { id: string }) => m.id === blocked.id));
    assert.equal(
      lens.entries.find((e: { memory: { id: string } }) => e.memory.id === blocked.id).context
        .reason,
      'excluded',
    );
    const run = f.runtime.agent.start(f.session.id, 'Inspect addition', null, undefined, {
      memory,
    });
    const result = await until(f, run.id, finished);
    assert.equal(result.status, 'completed');
    assert.ok(!JSON.stringify(f.model.requests).includes('PRIVATE_NOTE_CONTEXT'));
    assert.ok(!result.activities[0]!.output!.includes('EXCLUDED_NEEDLE'));
    assert.ok(
      result.knowledge.memoryContext?.some(
        (c) => c.id === included.id && c.reason === 'manual' && c.selected,
      ),
    );
    const next = await f.runtime.agent.knowledge.snapshot(f.session.id, 'Next task');
    assert.ok(next.memories.some((m) => m.id === blocked.id));
    await f.reopen();
    assert.deepEqual(f.runtime.agent.store.get(run.id).memorySelection, memory);
    assert.ok(
      f.runtime.agent.store
        .get(run.id)
        .knowledge.memoryContext?.some((c) => c.id === blocked.id && !c.selected),
    );
  } finally {
    await f.close();
  }
});

test('Memory Lens enforces scope, conflicting choices and context bounds before model generation', async () => {
  const f = await setup();
  try {
    const store = f.runtime.agent.knowledge.store;
    const ids = Array.from(
      { length: 6 },
      (_, i) =>
        store.saveMemory({ title: `Large ${i}`, body: 'note '.repeat(1500), scope: 'project' }).id,
    );
    const memory = { includeIds: ids, excludeIds: [] };
    const preview = await f.request('POST', '/api/memory-lens', {
      sessionId: f.session.id,
      query: '',
      selection: memory,
    });
    assert.equal(preview.json().overBudget, true);
    const before = f.model.requests.length;
    const run = f.runtime.agent.start(f.session.id, 'Try all notes', null, undefined, { memory });
    assert.match((await until(f, run.id, finished)).error!, /context limit/);
    assert.equal(f.model.requests.length, before);
    assert.equal(
      (
        await f.request('POST', '/api/memory-lens', {
          sessionId: f.session.id,
          query: '',
          selection: { includeIds: [ids[0]], excludeIds: [ids[0]] },
        })
      ).statusCode,
      400,
    );
    const other = f.runtime.database.createSession(f.runtime.workspace.id, 'Other').session;
    const recap = store.saveMemory({
      title: 'Private recap',
      body: 'OTHER_SESSION_RECAP',
      scope: 'recap',
      sessionId: other.id,
    });
    assert.equal(
      (
        await f.request('POST', '/api/memory-lens', {
          sessionId: f.session.id,
          query: '',
          selection: { includeIds: [recap.id], excludeIds: [] },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.runtime.app.inject({
          method: 'POST',
          url: '/api/memory-lens',
          payload: { query: '' },
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});

test('Memory Evidence captures real file/message/tool snapshots, retains history, isolates source tasks and rejects private or changed evidence', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? { tool: 'read_file', input: { path: 'code.mjs' } }
      : { text: 'Inspected the current source.' },
  );
  try {
    const run = f.runtime.agent.start(f.session.id, 'Inspect the source for a lasting decision');
    const result = await until(f, run.id, finished);
    const value = {
      title: 'Source decision',
      body: 'Keep the existing export.',
      scope: 'project',
      sessionId: f.session.id,
      sourceRunId: run.id,
      evidence: [
        { kind: 'file', path: 'code.mjs' },
        { kind: 'activity', runId: run.id, activityId: result.activities[0]!.id },
      ],
    };
    const saved = await f.request('POST', '/api/memories', value);
    assert.equal(saved.statusCode, 200, saved.body);
    const note = saved.json() as import('../packages/shared/src/knowledge.js').MemoryNote;
    assert.equal(note.evidence.length, 3);
    assert.ok(
      note.evidence.some(
        (e) => e.reference.kind === 'file' && e.excerpt.includes('export const value = 1'),
      ),
    );
    assert.ok(
      note.evidence.some((e) => e.reference.kind === 'activity' && e.outcome === 'completed'),
    );
    await writeFile(join(f.workspace, 'code.mjs'), 'export const value = 2;\n');
    const edited = await f.request('PUT', `/api/memories/${note.id}`, {
      ...memoryDraft(note),
      body: 'Keep the named export stable.',
      revision: note.revision,
    });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.deepEqual(edited.json().evidence, note.evidence);
    const evidence = await f.request('GET', `/api/memories/${note.id}/evidence`);
    assert.equal(evidence.statusCode, 200, evidence.body);
    assert.equal(evidence.json().revisions.length, 2);
    assert.equal(evidence.json().revisions[1].memory.body, note.body);
    assert.equal(evidence.json().sources[0].prompt, run.prompt);
    const preview = await f.request('POST', '/api/memory-review', {
      value: {
        title: 'New evidence',
        body: 'Inspect current code.',
        scope: 'project',
        evidence: [{ kind: 'file', path: 'code.mjs' }],
      },
    });
    assert.equal(preview.statusCode, 200, preview.body);
    await writeFile(join(f.workspace, 'code.mjs'), 'export const value = 3;\n');
    const stale = await f.request('POST', '/api/memory-review/commit', {
      value: {
        title: 'New evidence',
        body: 'Inspect current code.',
        scope: 'project',
        evidence: [{ kind: 'file', path: 'code.mjs' }],
      },
      ...preview.json(),
      action: 'create',
    });
    assert.equal(stale.statusCode, 409, stale.body);
    for (const path of ['../outside.txt', 'C:/outside.txt', '.env', 'id_rsa']) {
      if (!path.includes('/') && !path.startsWith('..'))
        await writeFile(join(f.workspace, path), 'SECRET_EVIDENCE');
      const blocked = await f.request('POST', '/api/memories', {
        title: 'Blocked',
        body: 'Do not read private data.',
        scope: 'project',
        evidence: [{ kind: 'file', path }],
      });
      assert.notEqual(blocked.statusCode, 200, path);
      assert.ok(!blocked.body.includes('SECRET_EVIDENCE'));
    }
    await f.reopen();
    assert.equal(
      (await f.request('GET', `/api/memories/${note.id}/evidence`)).json().revisions.length,
      2,
    );
    const current = f.runtime.agent.knowledge.store.memory(note.id);
    const global = f.runtime.agent.knowledge.store.saveMemory(
      { ...memoryDraft(current), scope: 'global' },
      current.id,
      current.revision,
      current.evidence,
    );
    const foreignPath = join(f.directory, 'evidence-foreign');
    await mkdir(foreignPath);
    const owner = f.runtime.database.workspace(foreignPath),
      foreign = new KnowledgeStore(
        f.runtime.database,
        owner.id,
        new AgentStore(f.runtime.database, owner.id, () => {}),
        () => {},
      );
    const foreignView = foreign.evidenceView(global.id);
    assert.ok(foreignView.revisions.every((revision) => revision.memory.scope === 'global'));
    assert.equal(foreignView.sources.length, 0);
    const { MemoryService } = await import('../packages/core/src/knowledge/memory-service.js');
    const foreignEdit = await new MemoryService(foreign, foreignPath, f.dataDirectory).save(
      {
        ...memoryDraft(global),
        body: 'An approved global note can be edited from another workspace.',
      },
      global.id,
      global.revision,
    );
    assert.deepEqual(foreignEdit.evidence, global.evidence);
  } finally {
    await f.close();
  }
});

test('Memory Review keeps both or updates explicitly, rejects stale revisions, preserves approved proposal provenance and never indexes history', async () => {
  const f = await setup((request) =>
    steps(request) === 0
      ? {
          tool: 'propose_memory',
          input: {
            title: 'Styling decision',
            body: 'TAILWIND_CURRENT styling policy.',
            scope: 'project',
            files: ['code.mjs'],
          },
        }
      : { text: 'A proposed update is ready for review.' },
  );
  try {
    const store = f.runtime.agent.knowledge.store;
    const old = store.saveMemory({
      title: 'Styling decision',
      body: 'MANUAL_CSS_LEGACY styling policy.',
      scope: 'project',
    });
    const run = f.runtime.agent.start(f.session.id, 'Suggest the new styling decision');
    const finishedRun = await until(f, run.id, finished),
      proposal = finishedRun.memorySuggestions[0]!;
    assert.equal(proposal.evidence.length, 2);
    const recap = await f.runtime.agent.knowledge.memory.propose(f.session.id, run.id, {
      title: 'Reviewed recap',
      body: 'The task proposed a styling update; it has not yet been saved.',
      scope: 'recap',
    });
    assert.equal(recap.scope, 'recap');
    assert.equal(recap.sessionId, f.session.id);
    assert.ok(recap.evidence.some((e) => e.reference.kind === 'message'));
    const value = { ...proposal, evidence: proposal.evidence.map((e) => e.reference) };
    const preview = await f.request('POST', '/api/memory-review', {
      value,
      proposalId: proposal.id,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().candidates[0].memory.id, old.id);
    assert.equal(store.memory(old.id).body, 'MANUAL_CSS_LEGACY styling policy.');
    const commit = {
      value,
      proposalId: proposal.id,
      inputDigest: preview.json().inputDigest,
      evidenceDigest: preview.json().evidenceDigest,
      action: 'update',
      targetId: old.id,
      targetRevision: old.revision,
    };
    const updated = await f.request('POST', '/api/memory-review/commit', commit);
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().memory.id, old.id);
    assert.equal(updated.json().proposal.decision, 'update');
    assert.equal(updated.json().memory.sourceRunId, run.id);
    assert.equal(store.listMemories('MANUAL_CSS_LEGACY').length, 0);
    assert.equal(store.evidenceView(old.id).revisions.length, 2);
    const retry = await f.request('POST', '/api/memory-review/commit', commit);
    assert.equal(retry.json().proposal.memoryId, old.id);
    assert.equal(store.evidenceView(old.id).revisions.length, 2);
    const freshValue = {
      title: 'Styling decision',
      body: 'SECOND_NOTE_KEEP_BOTH',
      scope: 'project',
    };
    const keepPreview = await f.request('POST', '/api/memory-review', { value: freshValue });
    const keep = await f.request('POST', '/api/memory-review/commit', {
      value: freshValue,
      inputDigest: keepPreview.json().inputDigest,
      evidenceDigest: keepPreview.json().evidenceDigest,
      action: 'create',
    });
    assert.equal(keep.statusCode, 200, keep.body);
    assert.notEqual(keep.json().memory.id, old.id);
    const current = store.memory(old.id),
      editedValue = { ...memoryDraft(current), body: 'REVIEWED_EDIT' };
    const stalePreview = await f.request('POST', '/api/memory-review', {
      value: editedValue,
      previousId: current.id,
      previousRevision: current.revision,
    });
    store.saveMemory({ ...memoryDraft(current), pinned: true }, current.id, current.revision);
    const stale = await f.request('POST', '/api/memory-review/commit', {
      value: editedValue,
      previousId: current.id,
      previousRevision: current.revision,
      inputDigest: stalePreview.json().inputDigest,
      evidenceDigest: stalePreview.json().evidenceDigest,
      action: 'update',
      targetId: current.id,
      targetRevision: current.revision,
    });
    assert.equal(stale.statusCode, 409, stale.body);
    const next = f.runtime.agent.start(f.session.id, 'Continue styling');
    await until(f, next.id, finished);
    const view = store.evidenceView(old.id);
    assert.ok(view.uses.some((use) => use.runId === next.id));
    store.deleteMemory(old.id, store.memory(old.id).revision);
    assert.equal((await f.request('GET', `/api/memories/${old.id}/evidence`)).statusCode, 404);
    assert.equal(
      (
        f.runtime.database.sqlite
          .prepare('SELECT count(*) count FROM memory_revisions WHERE memory_id=?')
          .get(old.id) as { count: number }
      ).count,
      0,
    );
    assert.ok(f.runtime.agent.store.get(next.id).knowledge.memories.some((m) => m.id === old.id));
  } finally {
    await f.close();
  }
});
