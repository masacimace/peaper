import type { MemoryEvidence } from '@peaper/shared';

export function EvidenceList({ evidence }: { evidence: MemoryEvidence[] }) {
  return (
    <div className="space-y-2 text-caption text-muted">
      {!evidence.length && (
        <p className="text-subtle">
          No captured evidence attached. Source session/task metadata may still be available below.
        </p>
      )}
      {evidence.map((item, index) => (
        <details key={`${item.digest}:${index}`} className="rounded-sm border border-border p-3">
          <summary className="cursor-pointer wrap-anywhere text-strong">
            {item.reference.kind} · {item.label}
            {item.outcome ? ` · ${item.outcome}` : ''}
          </summary>
          <p className="mt-2 text-micro text-subtle">
            Captured {new Date(item.capturedAt).toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-micro wrap-anywhere text-subtle">
            SHA-256 · {item.digest}
          </p>
          {item.reference.kind !== 'file' && (
            <p className="mt-1 text-micro wrap-anywhere text-subtle">
              Task {item.reference.runId}
              {item.reference.kind === 'activity' ? ` · Activity ${item.reference.activityId}` : ''}
            </p>
          )}
          <pre className="mt-3 max-h-55 overflow-auto rounded-sm bg-surface-inset p-3 font-mono text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap">
            {item.excerpt}
          </pre>
          <p className="mt-2 text-micro text-subtle">
            Captured excerpt, up to 2,000 characters. Evidence records a source; it is not a
            guarantee that the note is correct.
          </p>
        </details>
      ))}
    </div>
  );
}
