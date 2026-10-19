import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { PeaperDatabase } from '../packages/core/src/storage/database.js';

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
    assert.equal(database.schemaVersion, 4);
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
