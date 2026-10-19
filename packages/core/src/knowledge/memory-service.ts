import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import {
  memoryInputSchema,
  type MemoryEvidence,
  type MemoryEvidenceInput,
  type MemoryInput,
  type MemoryNote,
  type MemoryReview,
} from '@peaper/shared';
import { WorkspaceFiles } from '../workspace/files.js';
import { continuityError } from '../continuity/instructions.js';
import { KnowledgeStore } from './store.js';
import { memoryWords } from './memory-retrieval.js';

const hash = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const referenceKey = (reference: MemoryEvidenceInput) => JSON.stringify(reference);
const evidenceHash = (evidence: MemoryEvidence[]) =>
  hash(evidence.map(({ reference, digest }) => ({ reference, digest })));
const stopWords = new Set(
  'the a an to of and or for in on is are be with this that use using di ke dan atau yang untuk ini itu dengan dari pada adalah gunakan menggunakan'.split(
    ' ',
  ),
);
export function memoryOverlap(value: MemoryInput, memory: MemoryNote) {
  const terms = (text: string) =>
    memoryWords(text).filter((w) => w.length > 2 && !stopWords.has(w));
  const incoming = terms(`${value.title} ${value.body}`),
    existing = new Set(terms(`${memory.title} ${memory.body}`));
  const sharedTerms = incoming.filter((word) => existing.has(word)).slice(0, 12);
  if (value.body.trim().toLowerCase() === memory.body.trim().toLowerCase())
    return { score: 2, reason: 'Same note content', sharedTerms };
  if (value.title.trim().toLowerCase() === memory.title.trim().toLowerCase())
    return { score: 1.5, reason: 'Same title', sharedTerms };
  const titleWords = terms(value.title),
    titleMatches = titleWords.filter((w) => terms(memory.title).includes(w));
  const score = sharedTerms.length / Math.max(1, new Set([...incoming, ...existing]).size);
  return titleMatches.length >= 2 || (sharedTerms.length >= 3 && score >= 0.18)
    ? { score, reason: 'Shared title or keywords; possible overlap', sharedTerms }
    : null;
}

export class MemoryService {
  private readonly files: WorkspaceFiles;
  constructor(
    readonly store: KnowledgeStore,
    private readonly workspace: string,
    dataDirectory: string,
  ) {
    this.files = new WorkspaceFiles(workspace, dataDirectory);
  }
  private value(input: unknown, proposalId?: string) {
    const value = memoryInputSchema.parse(input);
    if (value.scope === 'recap' && !proposalId) {
      if (!value.sessionId) throw continuityError('A session recap needs its source session.', 400);
      this.store.selection(value.sessionId);
    }
    if (!proposalId) return value;
    const proposal = this.store.proposal(proposalId);
    return { ...value, sessionId: proposal.sessionId, sourceRunId: proposal.sourceRunId };
  }
  private async capture(value: MemoryInput, previous?: MemoryEvidence[]) {
    const references = [...(value.evidence ?? previous?.map((e) => e.reference) ?? [])];
    if (
      value.sourceRunId &&
      references.length < 8 &&
      !references.some(
        (r) => r.kind === 'message' && r.runId === value.sourceRunId && r.role === 'user',
      )
    ) {
      try {
        this.store.sourceRun(value.sourceRunId);
        references.push({ kind: 'message', runId: value.sourceRunId, role: 'user' });
      } catch (error) {
        if (!previous) throw error;
      }
    }
    const seen = new Set<string>(),
      evidence: MemoryEvidence[] = [];
    for (const reference of references) {
      const key = referenceKey(reference);
      if (seen.has(key)) continue;
      seen.add(key);
      const retained = previous?.find((e) => referenceKey(e.reference) === key);
      if (retained) {
        evidence.push(retained);
        continue;
      }
      const base = {
        reference,
        workspaceId: this.store.workspaceId,
        capturedAt: new Date().toISOString(),
      };
      if (reference.kind === 'file') {
        const path = reference.path.replaceAll('\\', '/');
        if (
          path
            .split('/')
            .some((part) => /^(?:id_rsa|id_ed25519|provider\.json|provider\.key)$/i.test(part)) ||
          /\.(?:pem|key|p12|pfx)$/i.test(path)
        )
          throw continuityError('Private files cannot be attached as memory evidence.', 403);
        // WorkspaceFiles enforces root/data exclusions; also reject in-root links before reading.
        if (
          isAbsolute(path) ||
          path.includes('\0') ||
          path
            .split('/')
            .some((part) => !part || part === '.' || part === '..' || part.includes(':'))
        )
          throw continuityError('Choose a relative workspace file.', 400);
        let cursor = this.workspace;
        for (const part of path.split('/')) {
          cursor = resolve(cursor, part);
          try {
            if ((await lstat(cursor)).isSymbolicLink())
              throw continuityError('Memory evidence cannot follow symlinks or junctions.', 403);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
              throw continuityError(
                'The selected evidence file was not found in this workspace.',
                404,
              );
            throw error;
          }
        }
        const file = await this.files.read(path);
        evidence.push({
          ...base,
          label: path,
          digest: hash(file.content),
          excerpt: file.content.slice(0, 2000),
        });
      } else {
        const run = this.store.sourceRun(reference.runId);
        if (reference.kind === 'message') {
          const content = reference.role === 'user' ? run.prompt : run.text;
          if (!content) throw continuityError('The selected message is not available yet.', 400);
          evidence.push({
            ...base,
            label: `${reference.role === 'user' ? 'User request' : 'Agent response'} · ${run.prompt.slice(0, 80)}`,
            digest: hash(content),
            excerpt: content.slice(0, 2000),
          });
        } else {
          const activity = run.activities.find((a) => a.id === reference.activityId);
          if (!activity) throw continuityError('The source activity was not found.', 404);
          let outcome: string = activity.status;
          if (
            ['run_command', 'run_skill_script'].includes(activity.name) &&
            activity.status === 'completed'
          ) {
            try {
              const result = JSON.parse(activity.output ?? '{}') as Record<string, unknown>;
              outcome = result.cancelled
                ? 'cancelled'
                : result.timedOut
                  ? 'timed out'
                  : typeof result.exitCode === 'number'
                    ? `exit ${result.exitCode}`
                    : 'exit unknown';
            } catch {
              outcome = 'result unavailable';
            }
          }
          evidence.push({
            ...base,
            label: activity.name.replaceAll('_', ' '),
            digest: hash({
              name: activity.name,
              input: activity.input,
              status: activity.status,
              output: activity.output,
            }),
            excerpt: (activity.output ?? 'No output recorded.').slice(0, 2000),
            outcome,
          });
        }
      }
    }
    return evidence;
  }
  async save(input: unknown, id?: string, revision?: number) {
    const value = this.value(input),
      old = id ? this.store.memory(id) : null;
    if (old && old.revision !== revision)
      throw continuityError('Memory changed. Reload before saving.');
    const evidence = await this.capture(value, old?.evidence);
    return this.store.saveMemory(value, id, revision, evidence);
  }
  async propose(sessionId: string, runId: string, input: unknown) {
    const value = memoryInputSchema.parse(input),
      withSource = this.value({ ...value, sessionId, sourceRunId: runId });
    return this.store.propose(sessionId, runId, withSource, await this.capture(withSource));
  }
  async review(
    input: unknown,
    options: { proposalId?: string; previousId?: string; previousRevision?: number } = {},
  ): Promise<MemoryReview> {
    const value = this.value(input, options.proposalId),
      previous = options.previousId ? this.store.memory(options.previousId) : null;
    if (previous && previous.revision !== options.previousRevision)
      throw continuityError('Memory changed. Reload before reviewing.');
    if (options.proposalId && this.store.proposal(options.proposalId).status !== 'pending')
      throw continuityError('This suggestion has already been decided. Refresh it.');
    const retained = options.proposalId
      ? this.store.proposal(options.proposalId).evidence
      : previous?.evidence;
    const evidence = await this.capture(value, retained);
    const pool = this.store.listMemories(
      '',
      value.scope,
      value.scope === 'recap' ? (value.sessionId ?? undefined) : undefined,
    );
    const candidates = pool
      .filter((m) => m.id !== previous?.id)
      .flatMap((memory) => {
        const match = memoryOverlap(value, memory);
        return match ? [{ memory, ...match }] : [];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ memory, reason, sharedTerms }) => ({ memory, reason, sharedTerms }));
    return {
      inputDigest: hash(value),
      evidenceDigest: evidenceHash(evidence),
      evidence,
      candidates,
      previous,
      notices: [
        'Overlap checks compare titles and keywords in up to 100 recent notes in the same scope. They do not prove a semantic contradiction.',
        'File and tool evidence records what was observed; it does not by itself prove the note is correct.',
      ],
    };
  }
  async commit(
    input: unknown,
    options: {
      proposalId?: string;
      previousId?: string;
      previousRevision?: number;
      inputDigest: string;
      evidenceDigest: string;
      action: 'create' | 'update';
      targetId?: string;
      targetRevision?: number;
    },
  ) {
    if (options.proposalId) {
      const decided = this.store.proposal(options.proposalId);
      if (decided.status !== 'pending') return { memory: null, proposal: decided };
    }
    const report = await this.review(input, options);
    if (
      report.inputDigest !== options.inputDigest ||
      report.evidenceDigest !== options.evidenceDigest
    )
      throw continuityError('The note or its new evidence changed. Review it again.');
    const value = this.value(input, options.proposalId);
    if (options.action === 'update') {
      if (!options.targetId || options.targetRevision === undefined)
        throw continuityError('Choose the note and revision to update.', 400);
      const target = this.store.memory(options.targetId);
      if (
        options.previousId !== target.id &&
        (target.scope !== value.scope ||
          (target.scope === 'recap' && target.sessionId !== value.sessionId))
      )
        throw continuityError('Update a note in the same scope and source session.', 400);
    }
    if (
      options.previousId &&
      (options.action !== 'update' || options.targetId !== options.previousId)
    )
      throw continuityError('An edited note must update the reviewed original.', 400);
    if (options.proposalId) {
      const proposal = this.store.decideProposal(options.proposalId, 'save', value, {
        evidence: report.evidence,
        ...(options.action === 'update'
          ? { targetId: options.targetId, targetRevision: options.targetRevision }
          : {}),
      });
      return { memory: proposal.memoryId ? this.store.memory(proposal.memoryId) : null, proposal };
    }
    return {
      memory: this.store.saveMemory(
        value,
        options.action === 'update' ? options.targetId : undefined,
        options.action === 'update' ? options.targetRevision : undefined,
        report.evidence,
      ),
      proposal: null,
    };
  }
  async decide(id: string, action: 'save' | 'dismiss', edited?: MemoryInput) {
    const current = this.store.proposal(id);
    if (current.status !== 'pending' || action === 'dismiss')
      return this.store.decideProposal(id, action);
    const value = this.value(
      edited ?? { ...current, evidence: current.evidence.map((e) => e.reference) },
      id,
    );
    return this.store.decideProposal(id, action, value, {
      evidence: await this.capture(value, current.evidence),
    });
  }
}
