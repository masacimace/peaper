import { useEffect, useState } from 'react';
import type { MemoryEvidenceView } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/cn';
import { EvidenceList } from './EvidenceList';
import { memoryReason } from './memory-context';

export function MemoryEvidenceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [view, setView] = useState<MemoryEvidenceView | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState('evidence'),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void api
      .memoryEvidence(id)
      .then((value) => {
        if (live) setView(value);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, reload]);
  return (
    <Dialog
      title="Memory Evidence"
      onClose={onClose}
      className="max-h-[90dvh] w-210 max-w-[calc(100vw-24px)] overflow-y-auto max-compact:p-4"
    >
      {error && (
        <ErrorNotice>
          {error}
          <Button
            variant="text"
            onClick={() => {
              setError('');
              setReload((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </ErrorNotice>
      )}
      {!view && !error && (
        <p className="py-5 text-caption text-muted">Loading sources and history…</p>
      )}
      {view && (
        <>
          <h3 className="text-label font-medium wrap-anywhere text-strong">{view.memory.title}</h3>
          <p className="mt-1 text-micro text-subtle">
            {view.memory.scope} · Revision {view.memory.revision}
          </p>
          <div
            className="my-4 flex gap-5 border-b border-border"
            role="tablist"
            aria-label="Memory evidence views"
          >
            {['evidence', 'history', 'usage'].map((name) => (
              <button
                type="button"
                role="tab"
                key={name}
                aria-selected={name === tab}
                onClick={() => setTab(name)}
                className={cn(
                  'border-b-2 border-transparent pb-2 text-caption text-muted capitalize',
                  name === tab && 'border-accent text-strong',
                )}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === 'evidence' && (
            <div className="space-y-4">
              <EvidenceList evidence={view.memory.evidence} />
              {view.sources.map((source) => (
                <details
                  key={source.runId}
                  className="rounded-sm border border-border p-3 text-caption text-muted"
                >
                  <summary className="cursor-pointer wrap-anywhere text-strong">
                    Source task · {source.title}
                  </summary>
                  <p className="mt-2 text-micro wrap-anywhere text-subtle">
                    Session {source.sessionId} · Task {source.runId}
                  </p>
                  <p className="mt-3 font-medium">User request</p>
                  <pre className="mt-1 max-h-45 overflow-auto whitespace-pre-wrap">
                    {source.prompt}
                  </pre>
                  <p className="mt-3 font-medium">Agent response</p>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap">
                    {source.text || 'No response recorded.'}
                  </pre>
                  <p className="mt-2 text-micro text-subtle">
                    Source excerpts show up to 4,000 characters each.
                  </p>
                </details>
              ))}
              {view.memory.sourceRunId &&
                !view.sources.some((s) => s.runId === view.memory.sourceRunId) && (
                  <p className="text-caption text-subtle">
                    The original task is outside this workspace or unavailable. Captured evidence
                    remains part of the saved note.
                  </p>
                )}
            </div>
          )}
          {tab === 'history' && (
            <div className="space-y-3">
              {view.revisions.map((item) => (
                <details
                  key={item.memory.revision}
                  className="rounded-sm border border-border p-3 text-caption text-muted"
                >
                  <summary className="cursor-pointer">
                    Revision {item.memory.revision} · {item.action} ·{' '}
                    {new Date(item.recordedAt).toLocaleString()}
                  </summary>
                  <p className="mt-2 font-medium wrap-anywhere text-strong">{item.memory.title}</p>
                  <p className="mt-1 text-micro text-subtle">
                    {item.memory.scope}
                    {item.memory.pinned ? ' · pinned' : ''}
                  </p>
                  <pre className="my-3 max-h-65 overflow-auto wrap-anywhere whitespace-pre-wrap">
                    {item.memory.body}
                  </pre>
                  <EvidenceList evidence={item.memory.evidence} />
                </details>
              ))}
              <p className="text-micro text-subtle">
                Up to 50 revisions visible in this workspace. Editing a note preserves its previous
                revisions.
              </p>
            </div>
          )}
          {tab === 'usage' && (
            <div className="space-y-3 text-caption text-muted">
              {!view.uses.length && (
                <p>No recorded task snapshots use this note in this workspace.</p>
              )}
              {view.uses.map((use, index) => (
                <div key={`${use.runId}:${index}`} className="border-b border-border-subtle pb-3">
                  <p className="font-medium wrap-anywhere text-strong">{use.title}</p>
                  <p className="mt-1">
                    Revision {use.revision} ·{' '}
                    {memoryReason[use.reason] ?? 'Selection reason not recorded'} ·{' '}
                    {use.stage === 'initial'
                      ? 'At task start'
                      : use.stage === 'search'
                        ? 'During task search'
                        : 'Stage not recorded'}
                  </p>
                  <p className="mt-1 text-micro wrap-anywhere text-subtle">
                    {new Date(use.startedAt).toLocaleString()} · Task {use.runId}
                  </p>
                </div>
              ))}
              <p className="text-micro text-subtle">
                Usage means the note was loaded into task context; it does not prove that it
                influenced the answer. Up to 50 recent tasks in this workspace are inspected.
              </p>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
