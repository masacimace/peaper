import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { RuntimeEvent, Session, Workspace } from '@peaper/shared';
import * as schema from './schema.js';

export class PeaperDatabase {
  readonly sqlite: Database.Database;
  readonly orm;
  readonly schemaVersion: number;

  constructor(dataDirectory: string, migrationsDirectory: string) {
    mkdirSync(dataDirectory, { recursive: true });
    this.sqlite = new Database(join(dataDirectory, 'peaper.sqlite'));
    try {
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('foreign_keys = ON');
      this.migrate(migrationsDirectory);
      this.sqlite.exec(
        'CREATE VIRTUAL TABLE temp.fts_probe USING fts5(text); DROP TABLE temp.fts_probe;',
      );
      this.orm = drizzle(this.sqlite, { schema });
      this.schemaVersion = Number(this.sqlite.pragma('user_version', { simple: true }));
    } catch (error) {
      this.sqlite.close();
      throw error;
    }
  }

  private migrate(directory: string) {
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    const apply = this.sqlite.transaction(() => {
      for (const name of readdirSync(directory)
        .filter((file) => /^\d+.*\.sql$/.test(file))
        .sort()) {
        const source = readFileSync(join(directory, name), 'utf8');
        const checksum = createHash('sha256').update(source).digest('hex');
        const previous = this.sqlite
          .prepare('SELECT checksum FROM _migrations WHERE name = ?')
          .get(name) as { checksum: string } | undefined;
        if (previous) {
          if (previous.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        this.sqlite.exec(source);
        this.sqlite
          .prepare('INSERT INTO _migrations VALUES (?, ?, ?)')
          .run(name, checksum, new Date().toISOString());
      }
      const count = this.sqlite.prepare('SELECT count(*) AS count FROM _migrations').get() as {
        count: number;
      };
      this.sqlite.pragma(`user_version = ${count.count}`);
    });
    apply.immediate();
  }

  workspace(path: string): Workspace {
    const canonical = realpathSync(path);
    const id = createHash('sha256')
      .update(process.platform === 'win32' ? canonical.toLowerCase() : canonical)
      .digest('hex')
      .slice(0, 24);
    this.orm
      .insert(schema.workspaces)
      .values({
        id,
        path: canonical,
        name: basename(canonical) || canonical,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    return this.orm.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).get()!;
  }

  listSessions(workspaceId: string, search = ''): Session[] {
    const words = search.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20);
    if (search && !words?.length) return [];
    if (words?.length) {
      const ids = this.sqlite
        .prepare(
          'SELECT s.id FROM sessions_fts f JOIN sessions s ON s.rowid = f.rowid WHERE sessions_fts MATCH ? AND s.workspace_id = ? ORDER BY rank LIMIT 100',
        )
        .all(words.map((word) => `"${word}"*`).join(' AND '), workspaceId) as { id: string }[];
      const matches = new Set(ids.map(({ id }) => id));
      const bodyMatches = this.sqlite
        .prepare(
          'SELECT r.session_id AS id FROM run_search f JOIN agent_runs r ON r.id=f.run_id WHERE run_search MATCH ? AND r.workspace_id=? AND r.visible=1 LIMIT 100',
        )
        .all(words.map((word) => `"${word}"*`).join(' AND '), workspaceId) as { id: string }[];
      for (const match of bodyMatches) matches.add(match.id);
      return this.listSessions(workspaceId).filter((session) => matches.has(session.id));
    }
    return this.orm
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.workspaceId, workspaceId))
      .orderBy(desc(schema.sessions.updatedAt))
      .all();
  }

  createSession(workspaceId: string, title: string): { session: Session; event: RuntimeEvent } {
    return this.sqlite.transaction(() => {
      const now = new Date().toISOString();
      const session: Session = {
        id: randomUUID(),
        workspaceId,
        title,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      };
      this.orm.insert(schema.sessions).values(session).run();
      const event = this.orm
        .insert(schema.events)
        .values({
          workspaceId,
          sessionId: session.id,
          type: 'session.created',
          payload: { title },
          createdAt: now,
        })
        .returning()
        .get();
      return { session, event };
    })();
  }

  recoverInterrupted(workspaceId: string) {
    return this.sqlite.transaction(() => {
      const running = this.orm
        .select()
        .from(schema.sessions)
        .where(
          and(eq(schema.sessions.workspaceId, workspaceId), eq(schema.sessions.status, 'running')),
        )
        .all();
      for (const session of running) {
        const now = new Date().toISOString();
        this.orm
          .update(schema.sessions)
          .set({ status: 'interrupted', updatedAt: now })
          .where(eq(schema.sessions.id, session.id))
          .run();
        this.orm
          .insert(schema.events)
          .values({
            workspaceId,
            sessionId: session.id,
            type: 'session.interrupted',
            payload: { reason: 'Runtime restarted' },
            createdAt: now,
          })
          .run();
      }
      return running.length;
    })();
  }

  eventsAfter(workspaceId: string, cursor: number): RuntimeEvent[] {
    return this.orm
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.workspaceId, workspaceId), gt(schema.events.id, cursor)))
      .orderBy(asc(schema.events.id))
      .limit(250)
      .all();
  }

  close() {
    this.sqlite.close();
  }
}
