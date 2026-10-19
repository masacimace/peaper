import { randomUUID } from 'node:crypto';
import {
  contextSelectionSchema,
  memoryInputSchema,
  memorySchema,
  memoryProposalSchema,
  personaInputSchema,
  personaSchema,
  type ContextSelection,
  type MemoryInput,
  type MemoryNote,
  type MemoryProposal,
  type Persona,
  type MemoryEvidence,
  type MemorySelection,
} from '@peaper/shared';
import { planMemory, memoryQueryWords } from './memory-retrieval.js';
import type { PeaperDatabase } from '../storage/database.js';
import type { AgentStore } from '../agent/store.js';
import { continuityError } from '../continuity/instructions.js';

type Row = Record<string, unknown>;
const note = (r: Row): MemoryNote =>
  memorySchema.parse({
    id: r.id,
    title: r.title,
    body: r.body,
    scope: r.scope,
    sessionId: r.session_id,
    sourceRunId: r.source_run_id,
    pinned: Boolean(r.pinned),
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    evidence: JSON.parse(String(r.evidence ?? '[]')),
  });
const persona = (r: Row): Persona =>
  personaSchema.parse({
    id: r.id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    scope: r.scope,
    enabled: Boolean(r.enabled),
    revision: r.revision,
    updatedAt: r.updated_at,
  });
export class KnowledgeStore {
  constructor(
    readonly database: PeaperDatabase,
    readonly workspaceId: string,
    private readonly agent: AgentStore,
    private readonly publish: () => void,
  ) {}
  changed(sessionId: string | null = null) {
    this.agent.event('knowledge.updated', sessionId);
    this.publish();
  }
  selection(sessionId: string): ContextSelection {
    this.agent.session(sessionId);
    const row = this.database.sqlite
      .prepare('SELECT selection FROM context_selections WHERE session_id=?')
      .get(sessionId) as { selection: string } | undefined;
    return contextSelectionSchema.parse(row ? JSON.parse(row.selection) : {});
  }
  select(sessionId: string, value: ContextSelection) {
    this.agent.session(sessionId);
    const selection = contextSelectionSchema.parse(value);
    this.database.sqlite
      .prepare(
        'INSERT INTO context_selections VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET selection=excluded.selection',
      )
      .run(sessionId, JSON.stringify(selection));
    this.changed(sessionId);
    return selection;
  }
  personas(): Persona[] {
    return (
      this.database.sqlite
        .prepare("SELECT * FROM personas WHERE scope='personal' OR workspace_id=? ORDER BY name,id")
        .all(this.workspaceId) as Row[]
    ).map(persona);
  }
  profile(id: string) {
    const result = this.personas().find((p) => p.id === id);
    if (!result) throw continuityError('Profile not found.', 404);
    return result;
  }
  defaultProfileId() {
    return (
      (
        this.database.sqlite
          .prepare('SELECT profile_id FROM knowledge_defaults WHERE workspace_id=?')
          .get(this.workspaceId) as { profile_id: string | null } | undefined
      )?.profile_id ?? 'none'
    );
  }
  setDefaultProfile(id: string) {
    if (id !== 'none' && !this.profile(id).enabled)
      throw continuityError('Enable this profile before making it the default.');
    this.database.sqlite
      .prepare(
        'INSERT INTO knowledge_defaults VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET profile_id=excluded.profile_id',
      )
      .run(this.workspaceId, id === 'none' ? null : id);
    this.changed();
  }
  resolveProfile(selection: ContextSelection) {
    const id = selection.profileId === 'default' ? this.defaultProfileId() : selection.profileId;
    if (id === 'none') return null;
    const profile = this.profile(id);
    if (!profile.enabled)
      throw continuityError('The selected profile is disabled. Choose another profile or None.');
    return profile;
  }
  saveProfile(input: unknown, id?: string, revision?: number) {
    const value = personaInputSchema.parse(input),
      now = new Date().toISOString();
    if (id) {
      const previous = this.profile(id);
      if (previous.revision !== revision)
        throw continuityError('Profile changed. Reload before saving.');
      const updated = this.database.sqlite
        .prepare(
          'UPDATE personas SET workspace_id=?,name=?,description=?,instructions=?,scope=?,enabled=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
        )
        .run(
          value.scope === 'personal' ? null : this.workspaceId,
          value.name,
          value.description,
          value.instructions,
          value.scope,
          +value.enabled,
          now,
          id,
          revision,
        );
      if (updated.changes !== 1) throw continuityError('Profile changed. Reload before saving.');
    } else {
      id = randomUUID();
      this.database.sqlite
        .prepare('INSERT INTO personas VALUES(?,?,?,?,?,?,?,?,?)')
        .run(
          id,
          value.scope === 'personal' ? null : this.workspaceId,
          value.name,
          value.description,
          value.instructions,
          value.scope,
          +value.enabled,
          1,
          now,
        );
    }
    if (!value.enabled)
      this.database.sqlite
        .prepare('UPDATE knowledge_defaults SET profile_id=NULL WHERE profile_id=?')
        .run(id);
    this.changed();
    return this.profile(id);
  }
  deleteProfile(id: string, revision: number) {
    if (this.profile(id).revision !== revision)
      throw continuityError('Profile changed. Reload before deleting.');
    this.database.sqlite.transaction(() => {
      this.database.sqlite
        .prepare('UPDATE knowledge_defaults SET profile_id=NULL WHERE profile_id=?')
        .run(id);
      if (
        this.database.sqlite
          .prepare('DELETE FROM personas WHERE id=? AND revision=?')
          .run(id, revision).changes !== 1
      )
        throw continuityError('Profile changed. Reload before deleting.');
    })();
    this.changed();
  }
  memory(id: string): MemoryNote {
    const r = this.database.sqlite
      .prepare("SELECT * FROM memories WHERE id=? AND (scope='global' OR workspace_id=?)")
      .get(id, this.workspaceId) as Row | undefined;
    if (!r) throw continuityError('Memory not found.', 404);
    return note(r);
  }
  listMemories(query = '', scope = 'all', sessionId?: string, retrieval = false): MemoryNote[] {
    if (sessionId) this.agent.session(sessionId);
    const params: unknown[] = [this.workspaceId];
    let where = "(m.scope='global' OR m.workspace_id=?)";
    if (scope !== 'all') {
      where += ' AND m.scope=?';
      params.push(scope);
    }
    if (retrieval) {
      where += " AND (m.scope!='recap' OR m.session_id=?)";
      params.push(sessionId ?? '');
    } else if (sessionId) {
      where += ' AND m.session_id=?';
      params.push(sessionId);
    }
    const words = retrieval
      ? memoryQueryWords(query)
      : query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20);
    if (query && !words?.length) return [];
    if (words?.length) {
      const match = words.map((word) => `"${word}"*`).join(retrieval ? ' OR ' : ' AND ');
      return (
        this.database.sqlite
          .prepare(
            `SELECT m.* FROM memory_search f JOIN memories m ON m.id=f.id WHERE memory_search MATCH ? AND ${where} ORDER BY m.pinned DESC,rank,m.updated_at DESC LIMIT 100`,
          )
          .all(match, ...params) as Row[]
      ).map(note);
    }
    return (
      this.database.sqlite
        .prepare(
          `SELECT m.* FROM memories m WHERE ${where} ORDER BY m.pinned DESC,m.updated_at DESC,m.id LIMIT 100`,
        )
        .all(...params) as Row[]
    ).map(note);
  }
  saveMemory(
    input: unknown,
    id?: string,
    revision?: number,
    evidence?: MemoryEvidence[],
  ): MemoryNote {
    return this.database.sqlite.transaction(() =>
      this.writeMemory(input, id, revision, evidence),
    )();
  }
  private writeMemory(
    input: unknown,
    id?: string,
    revision?: number,
    evidence?: MemoryEvidence[],
  ): MemoryNote {
    const value = memoryInputSchema.parse(input),
      old = id ? this.memory(id) : null;
    if (old && old.revision !== revision)
      throw continuityError('Memory changed. Reload before saving.');
    if (value.scope === 'recap' && !value.sessionId)
      throw continuityError('A session recap needs its source session.', 400);
    if (value.scope === 'recap') this.agent.session(value.sessionId!);
    if (value.sessionId && value.sessionId !== old?.sessionId) this.agent.session(value.sessionId);
    if (value.sourceRunId && value.sourceRunId !== old?.sourceRunId) {
      const source = this.agent.get(value.sourceRunId);
      if (source.sessionId !== value.sessionId)
        throw continuityError('The source task must belong to the source session.', 400);
    }
    if (value.pinned && (!old?.pinned || value.scope !== old.scope)) {
      const count = this.database.sqlite
        .prepare(
          "SELECT count(*) AS count FROM memories WHERE scope=? AND (workspace_id=? OR (?='global' AND workspace_id IS NULL)) AND pinned=1",
        )
        .get(value.scope, this.workspaceId, value.scope) as { count: number };
      if (count.count >= 20)
        throw continuityError('Unpin a note first. Each scope allows at most 20 pinned notes.');
    }
    const now = new Date().toISOString();
    if (id) {
      const updated = this.database.sqlite
        .prepare(
          'UPDATE memories SET workspace_id=?,title=?,body=?,scope=?,session_id=?,source_run_id=?,pinned=?,evidence=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
        )
        .run(
          value.scope === 'global' ? null : this.workspaceId,
          value.title,
          value.body,
          value.scope,
          value.sessionId,
          value.sourceRunId,
          +value.pinned,
          JSON.stringify(evidence ?? old?.evidence ?? []),
          now,
          id,
          revision,
        );
      if (updated.changes !== 1) throw continuityError('Memory changed. Reload before saving.');
    } else {
      id = randomUUID();
      this.database.sqlite
        .prepare(
          'INSERT INTO memories(id,workspace_id,title,body,scope,session_id,source_run_id,pinned,revision,created_at,updated_at,evidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          value.scope === 'global' ? null : this.workspaceId,
          value.title,
          value.body,
          value.scope,
          value.sessionId,
          value.sourceRunId,
          +value.pinned,
          1,
          now,
          now,
          JSON.stringify(evidence ?? []),
        );
    }
    const saved = this.memory(id);
    this.database.sqlite
      .prepare('INSERT INTO memory_revisions VALUES(?,?,?,?,?,?,?)')
      .run(
        id,
        saved.revision,
        value.scope === 'global' ? null : this.workspaceId,
        value.scope,
        JSON.stringify(saved),
        old ? 'updated' : 'created',
        now,
      );
    this.changed(value.sessionId);
    return saved;
  }
  deleteMemory(id: string, revision: number) {
    if (this.memory(id).revision !== revision)
      throw continuityError('Memory changed. Reload before deleting.');
    if (
      this.database.sqlite
        .prepare('DELETE FROM memories WHERE id=? AND revision=?')
        .run(id, revision).changes !== 1
    )
      throw continuityError('Memory changed. Reload before deleting.');
    this.changed();
  }
  memoryLens(
    sessionId: string | undefined,
    query: string,
    selection: MemorySelection = { includeIds: [], excludeIds: [] },
    includePins = true,
  ) {
    if (sessionId) this.agent.session(sessionId);
    if (selection.includeIds.some((id) => selection.excludeIds.includes(id)))
      throw continuityError('A note cannot be both included and excluded.', 400);
    const check = (id: string) => {
      const memory = this.memory(id);
      if (memory.scope === 'recap' && memory.sessionId !== sessionId)
        throw continuityError('This recap belongs to another session.', 403);
      return memory;
    };
    const included = selection.includeIds.map(check);
    if (includePins) selection.excludeIds.forEach(check);
    const eligible = this.listMemories('', 'all', sessionId, true);
    const matches = query.trim() ? this.listMemories(query, 'all', sessionId, true) : [];
    return planMemory(eligible, matches, included, query, selection, includePins);
  }
  retrieve(
    sessionId: string,
    query: string,
    includePins = true,
    selection: MemorySelection = { includeIds: [], excludeIds: [] },
  ) {
    const lens = this.memoryLens(sessionId, query, selection, includePins);
    return {
      memories: lens.memories,
      warnings: lens.warnings,
      memoryContext: lens.entries.map((entry) => entry.context),
      overBudget: lens.overBudget,
    };
  }
  sourceRun(id: string) {
    return this.agent.get(id);
  }
  evidenceView(id: string) {
    const memory = this.memory(id);
    const revisions = (
      this.database.sqlite
        .prepare(
          "SELECT state,action,recorded_at FROM memory_revisions WHERE memory_id=? AND (scope='global' OR workspace_id=?) ORDER BY revision DESC LIMIT 50",
        )
        .all(id, this.workspaceId) as {
        state: string;
        action: 'imported' | 'created' | 'updated';
        recorded_at: string;
      }[]
    ).map((r) => ({
      memory: memorySchema.parse(JSON.parse(r.state)),
      action: r.action,
      recordedAt: r.recorded_at,
    }));
    const uses = (
      this.database.sqlite
        .prepare(
          "SELECT r.id,r.session_id,r.state,s.title FROM agent_runs r JOIN sessions s ON s.id=r.session_id WHERE r.workspace_id=? AND EXISTS(SELECT 1 FROM json_each(r.state,'$.knowledge.memories') m WHERE json_extract(m.value,'$.id')=?) ORDER BY r.created_at DESC LIMIT 50",
        )
        .all(this.workspaceId, id) as {
        id: string;
        session_id: string;
        state: string;
        title: string;
      }[]
    ).flatMap((row) => {
      const run = this.agent.get(row.id);
      return run.knowledge.memories
        .filter((m) => m.id === id)
        .map((m) => ({
          runId: run.id,
          sessionId: row.session_id,
          title: row.title,
          revision: m.revision,
          startedAt: run.startedAt,
          reason:
            run.knowledge.memoryContext?.find(
              (entry) => entry.id === id && entry.revision === m.revision && entry.selected,
            )?.reason ?? 'not recorded',
          stage:
            run.knowledge.memoryContext?.find(
              (entry) => entry.id === id && entry.revision === m.revision && entry.selected,
            )?.stage ?? 'not recorded',
        }));
    });
    const sourceIds = [
      ...new Set(
        [
          memory.sourceRunId,
          ...memory.evidence.flatMap((e) =>
            e.reference.kind === 'file' ? [] : [e.reference.runId],
          ),
        ].filter((v): v is string => Boolean(v)),
      ),
    ];
    const sources = sourceIds.flatMap((runId) => {
      try {
        const run = this.agent.get(runId);
        const session = this.database.sqlite
          .prepare('SELECT title FROM sessions WHERE id=? AND workspace_id=?')
          .get(run.sessionId, this.workspaceId) as { title: string };
        return [
          {
            runId,
            sessionId: run.sessionId,
            title: session.title,
            prompt: run.prompt.slice(0, 4000),
            text: run.text.slice(0, 4000),
          },
        ];
      } catch {
        return [];
      }
    });
    return { memory, revisions, uses, sources };
  }
  proposal(id: string): MemoryProposal {
    const row = this.database.sqlite
      .prepare('SELECT state FROM memory_proposals WHERE id=? AND workspace_id=?')
      .get(id, this.workspaceId) as { state: string } | undefined;
    if (!row) throw continuityError('Memory suggestion not found.', 404);
    return memoryProposalSchema.parse(JSON.parse(row.state));
  }
  propose(sessionId: string, runId: string, input: unknown, evidence: MemoryEvidence[] = []) {
    const value = memoryInputSchema.parse(input);
    this.agent.session(sessionId);
    if (this.agent.get(runId).sessionId !== sessionId)
      throw continuityError('Source task is outside this session.', 400);
    const proposal: MemoryProposal = {
      ...value,
      evidence,
      id: randomUUID(),
      sessionId,
      sourceRunId: runId,
      status: 'pending',
      memoryId: null,
    };
    this.database.sqlite
      .prepare('INSERT INTO memory_proposals VALUES(?,?,?,?,?)')
      .run(proposal.id, this.workspaceId, sessionId, runId, JSON.stringify(proposal));
    this.changed(sessionId);
    return proposal;
  }
  decideProposal(
    id: string,
    action: 'save' | 'dismiss',
    edited?: MemoryInput,
    options: { evidence?: MemoryEvidence[]; targetId?: string; targetRevision?: number } = {},
  ) {
    return this.database.sqlite.transaction(() => {
      const current = this.proposal(id);
      if (current.status !== 'pending') return current;
      if (action === 'save') {
        const value = memoryInputSchema.parse(
          edited ?? { ...current, evidence: current.evidence.map((e) => e.reference) },
        );
        if (options.targetId) {
          const target = this.memory(options.targetId);
          if (
            target.scope !== value.scope ||
            (target.scope === 'recap' && target.sessionId !== current.sessionId)
          )
            throw continuityError('Update a note in the same scope and source session.', 400);
        }
        current.title = value.title;
        current.body = value.body;
        current.scope = value.scope;
        current.pinned = value.pinned;
        const saved = this.saveMemory(
          {
            ...value,
            sessionId: current.sessionId,
            sourceRunId: current.sourceRunId,
          },
          options.targetId,
          options.targetRevision,
          options.evidence ?? current.evidence,
        );
        current.memoryId = saved.id;
        current.evidence = saved.evidence;
        current.decision = options.targetId ? 'update' : 'create';
      }
      current.status = action === 'save' ? 'saved' : 'dismissed';
      this.database.sqlite
        .prepare('UPDATE memory_proposals SET state=? WHERE id=?')
        .run(JSON.stringify(current), id);
      this.changed(current.sessionId);
      return current;
    })();
  }
}
