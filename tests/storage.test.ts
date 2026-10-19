import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { PeaperDatabase } from '../packages/core/src/storage/database.js';
import { KnowledgeStore } from '../packages/core/src/knowledge/store.js';
import { AgentStore } from '../packages/core/src/agent/store.js';

const migrations = resolve('packages/core/migrations');

test('session persistence, FTS triggers, scoped retrieval, and ordered replay survive reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-storage-'));
  const firstDirectory = await mkdtemp(join(tmpdir(), 'peaper-workspace-a-'));
  const secondDirectory = await mkdtemp(join(tmpdir(), 'peaper-workspace-b-'));
  let database = new PeaperDatabase(directory, migrations);
  try {
    const a = database.workspace(firstDirectory);
    const b = database.workspace(secondDirectory);
    const first = database.createSession(a.id, 'Implement foundation database');
    database.createSession(b.id, 'Implement foundation elsewhere');
    const second = database.createSession(a.id, 'Terminal lifecycle');
    assert.equal(database.listSessions(a.id, 'found').length, 1);
    assert.equal(database.listSessions(a.id, 'foundation OR elsewhere').length, 0);
    assert.equal(database.listSessions(a.id, '"*()').length, 0);
    assert.deepEqual(
      database.eventsAfter(a.id, first.event.id).map((event) => event.sessionId),
      [second.session.id],
    );
    database.sqlite
      .prepare('UPDATE sessions SET title = ? WHERE id = ?')
      .run('Revised storage plan', first.session.id);
    assert.equal(database.listSessions(a.id, 'foundation').length, 0);
    assert.equal(database.listSessions(a.id, 'Revised').length, 1);
    database.sqlite
      .prepare("UPDATE sessions SET status = 'running' WHERE id = ?")
      .run(second.session.id);
    database.close();
    database = new PeaperDatabase(directory, migrations);
    assert.equal(database.schemaVersion, 6);
    assert.equal(database.recoverInterrupted(a.id), 1);
    assert.equal(database.recoverInterrupted(a.id), 0);
    assert.equal(
      database.listSessions(a.id).find((session) => session.id === second.session.id)?.status,
      'interrupted',
    );
    assert.equal(database.eventsAfter(a.id, second.event.id)[0]?.type, 'session.interrupted');
    // Deleting the event first respects the FK; the search index must remove the session too.
    database.sqlite.prepare('DELETE FROM events WHERE session_id = ?').run(first.session.id);
    database.sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(first.session.id);
    assert.equal(database.listSessions(a.id, 'Revised').length, 0);
  } finally {
    database.close();
    await Promise.all(
      [directory, firstDirectory, secondDirectory].map((path) =>
        rm(path, { recursive: true, force: true }),
      ),
    );
  }
});

test('modified applied migrations are rejected without replacing user data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-migration-'));
  const copies = join(directory, 'migrations');
  await cp(migrations, copies, { recursive: true });
  const database = new PeaperDatabase(directory, copies);
  database.close();
  try {
    await appendFile(join(copies, '0001_foundation.sql'), '\n-- edited after application\n');
    assert.throws(() => new PeaperDatabase(directory, copies), /Applied migration changed/);
    const original = new PeaperDatabase(directory, migrations);
    original.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('M4 memory upgrade preserves existing notes and seeds their current revision without changing applied migrations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peaper-memory-upgrade-'));
  const oldMigrations = join(directory, 'old-migrations'),
    workspace = join(directory, 'workspace');
  await mkdir(oldMigrations);
  await mkdir(workspace);
  for (const name of (await readdir(migrations)).filter((name) => /^000[1-5]_/.test(name)))
    await cp(join(migrations, name), join(oldMigrations, name));
  let database = new PeaperDatabase(directory, oldMigrations);
  try {
    const owner = database.workspace(workspace);
    database.sqlite
      .prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        'legacy-note',
        owner.id,
        'Existing decision',
        'PRESERVED_MEMORY',
        'project',
        null,
        null,
        1,
        3,
        '2026-10-01T00:00:00Z',
        '2026-10-19T00:00:00Z',
      );
    database.close();
    database = new PeaperDatabase(directory, migrations);
    assert.equal(database.schemaVersion, 6);
    const agent = new AgentStore(database, owner.id, () => {}),
      store = new KnowledgeStore(database, owner.id, agent, () => {});
    assert.equal(store.memory('legacy-note').body, 'PRESERVED_MEMORY');
    assert.equal(store.memory('legacy-note').pinned, true);
    const history = store.evidenceView('legacy-note');
    assert.equal(history.revisions.length, 1);
    assert.equal(history.revisions[0]!.action, 'imported');
    assert.equal(history.revisions[0]!.memory.revision, 3);
    assert.deepEqual(history.revisions[0]!.memory.evidence, []);
    store.saveMemory(
      { title: 'Existing decision', body: 'UPDATED_MEMORY', scope: 'project' },
      'legacy-note',
      3,
    );
    assert.equal(store.evidenceView('legacy-note').revisions.length, 2);
    assert.equal(store.listMemories('PRESERVED').length, 0);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
