import type { AgentRun } from '@peaper/shared';
import { EvidenceList } from './EvidenceList';
import { memoryReason } from './memory-context';

export function MemoryTaskLens({ run }: { run: AgentRun }) {
  const context = run.knowledge.memoryContext ?? [],
    omitted = context.filter((c) => !c.selected),
    memories = run.knowledge.memories;
  if (!context.length && !memories.length) return null;
  return (
    <details className="mt-3 rounded-sm border border-border p-3 text-caption text-muted">
      <summary className="cursor-pointer font-medium text-strong">
        Memory Lens · {memories.length} loaded {memories.length === 1 ? 'note' : 'notes'}
      </summary>
      <p className="my-2 text-micro text-subtle">
        Historical note snapshots loaded into model context. Loading a note does not prove it
        influenced the answer.
      </p>
      <div className="space-y-2">
        {memories.map((memory) => {
          const record = context.find(
            (c) => c.id === memory.id && c.revision === memory.revision && c.selected,
          );
          return (
            <details
              key={`${memory.id}:${memory.revision}`}
              className="rounded-sm border border-border-subtle p-2"
            >
              <summary className="cursor-pointer wrap-anywhere">
                {memory.title} · {memory.scope} · r{memory.revision}
              </summary>
              <p className="my-2 text-micro text-subtle">
                {record
                  ? `${record.stage === 'initial' ? 'At task start' : 'During task'} · ${memoryReason[record.reason]}`
                  : 'Selection reason was not recorded for this historical task.'}
                {record && ['match', 'search'].includes(record.reason) && record.matchedTerms.length
                  ? ` · ${record.matchedTerms.join(', ')}`
                  : ''}
              </p>
              <pre className="mb-3 max-h-50 overflow-auto wrap-anywhere whitespace-pre-wrap">
                {memory.body}
              </pre>
              <EvidenceList evidence={memory.evidence} />
            </details>
          );
        })}
      </div>
      {omitted.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-micro text-subtle">
            Not loaded at task start · {omitted.length}
          </summary>
          {omitted.map((record) => (
            <p key={`${record.id}:${record.revision}`} className="mt-2 text-micro wrap-anywhere">
              {record.title} · {memoryReason[record.reason]}
            </p>
          ))}
        </details>
      )}
    </details>
  );
}
