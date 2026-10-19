import type { ModelMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  agentRunSchema,
  modelSelectionSchema,
  type FileChange,
  type ModelSelection,
  type AgentRun,
} from '@peaper/shared';
import type { PeaperDatabase } from '../storage/database.js';

export class AgentStore {
  constructor(
    private readonly database: PeaperDatabase,
    private readonly workspaceId: string,
    private readonly publish: () => void,
  ) {}
  session(id: string) {
    const found = this.database.sqlite
      .prepare('SELECT id FROM sessions WHERE id=? AND workspace_id=?')
      .get(id, this.workspaceId);
    if (!found) throw Object.assign(new Error('Session not found.'), { statusCode: 404 });
  }
  list(sessionId: string, includeArchived = false): AgentRun[] {
    this.session(sessionId);
    return (
      this.database.sqlite
        .prepare(
          `SELECT state FROM agent_runs WHERE workspace_id=? AND session_id=? ${includeArchived ? '' : 'AND visible=1'} ORDER BY created_at, rowid`,
        )
        .all(this.workspaceId, sessionId) as { state: string }[]
    ).map((row) => agentRunSchema.parse(JSON.parse(row.state)));
  }
  get(id: string): AgentRun {
    const row = this.database.sqlite
      .prepare('SELECT state FROM agent_runs WHERE id=? AND workspace_id=?')
      .get(id, this.workspaceId) as { state: string } | undefined;
    if (!row) throw Object.assign(new Error('Agent run not found.'), { statusCode: 404 });
    return agentRunSchema.parse(JSON.parse(row.state));
  }
  history(sessionId: string): ModelMessage[] {
    this.session(sessionId);
    const rows = this.database.sqlite
      .prepare(
        'SELECT messages FROM agent_runs WHERE workspace_id=? AND session_id=? AND visible=1 ORDER BY created_at, rowid',
      )
      .all(this.workspaceId, sessionId) as { messages: string }[];
    return rows.flatMap((row) => JSON.parse(row.messages) as ModelMessage[]);
  }
  selection(sessionId: string): ModelSelection | null {
    this.session(sessionId);
    const row = this.database.sqlite
      .prepare('SELECT selection FROM session_models WHERE session_id=?')
      .get(sessionId) as { selection: string } | undefined;
    return row ? modelSelectionSchema.parse(JSON.parse(row.selection)) : null;
  }
  select(sessionId: string, selection: ModelSelection) {
    this.session(sessionId);
    this.database.sqlite
      .prepare(
        'INSERT INTO session_models(session_id,selection) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET selection=excluded.selection',
      )
      .run(sessionId, JSON.stringify(selection));
    this.event('models.updated', sessionId);
    this.publish();
  }
  create(
    sessionId: string,
    prompt: string,
    model: string,
    settings?: Partial<
      Pick<
        AgentRun,
        'connectionId' | 'connectionName' | 'effort' | 'mode' | 'resumeOf' | 'selectedFile'
      >
    >,
  ) {
    this.session(sessionId);
    const now = new Date().toISOString();
    const run: AgentRun = {
      id: randomUUID(),
      sessionId,
      prompt,
      model,
      mode: 'build',
      instructions: [],
      ...settings,
      status: 'running',
      text: '',
      activities: [],
      permissions: [],
      questions: [],
      changes: [],
      todos: [],
      startedAt: now,
      updatedAt: now,
    };
    this.database.sqlite
      .prepare(
        'INSERT INTO agent_runs(id,workspace_id,session_id,state,created_at) VALUES(?,?,?,?,?)',
      )
      .run(run.id, this.workspaceId, sessionId, JSON.stringify(run), now);
    this.save(run);
    return run;
  }
  save(run: AgentRun, messages?: ModelMessage[]) {
    run.updatedAt = new Date().toISOString();
    this.database.sqlite.transaction(() => {
      this.database.sqlite
        .prepare('UPDATE agent_runs SET state=? WHERE id=? AND workspace_id=?')
        .run(JSON.stringify(run), run.id, this.workspaceId);
      if (messages)
        this.database.sqlite
          .prepare('UPDATE agent_runs SET messages=? WHERE id=? AND workspace_id=?')
          .run(JSON.stringify(messages), run.id, this.workspaceId);
      this.database.sqlite
        .prepare('UPDATE sessions SET status=?,updated_at=? WHERE id=? AND workspace_id=?')
        .run(
          ['running', 'waiting'].includes(run.status)
            ? 'running'
            : run.status === 'interrupted'
              ? 'interrupted'
              : 'idle',
          run.updatedAt,
          run.sessionId,
          this.workspaceId,
        );
      this.event('agent.updated', run.sessionId, { runId: run.id });
    })();
    this.publish();
  }
  event(
    type: 'agent.updated' | 'provider.updated' | 'models.updated' | 'session.updated',
    sessionId: string | null,
    payload: Record<string, unknown> = {},
  ) {
    this.database.sqlite
      .prepare(
        'INSERT INTO events(workspace_id,session_id,type,payload,created_at) VALUES(?,?,?,?,?)',
      )
      .run(this.workspaceId, sessionId, type, JSON.stringify(payload), new Date().toISOString());
  }
  recover() {
    const rows = this.database.sqlite
      .prepare('SELECT state FROM agent_runs WHERE workspace_id=?')
      .all(this.workspaceId) as { state: string }[];
    for (const row of rows) {
      const run = JSON.parse(row.state) as AgentRun;
      if (!['running', 'waiting'].includes(run.status)) continue;
      run.status = 'interrupted';
      run.error =
        'Runtime restarted. This run was interrupted; tools will not be retried automatically.';
      for (const permission of run.permissions)
        if (permission.status === 'pending') permission.status = 'cancelled';
      for (const question of run.questions ?? [])
        if (question.status === 'pending') question.status = 'cancelled';
      for (const activity of run.activities)
        if (['running', 'waiting'].includes(activity.status)) activity.status = 'cancelled';
      this.save(run);
    }
  }
  stageChange(run: AgentRun, change: FileChange) {
    this.database.sqlite
      .prepare('INSERT INTO file_checkpoints VALUES(?,?,?,?,?,?,?,?,?)')
      .run(
        change.id,
        this.workspaceId,
        run.sessionId,
        run.id,
        change.path,
        change.before,
        change.after,
        'pending',
        new Date().toISOString(),
      );
  }
  finishChange(run: AgentRun, change: FileChange, applied: boolean) {
    this.database.sqlite.transaction(() => {
      this.database.sqlite
        .prepare('UPDATE file_checkpoints SET state=? WHERE id=? AND workspace_id=?')
        .run(applied ? 'applied' : 'failed', change.id, this.workspaceId);
      if (applied) run.changes.push(change);
      this.save(run);
    })();
  }
}
