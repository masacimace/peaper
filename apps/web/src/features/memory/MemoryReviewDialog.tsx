import { useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import type { MemoryInput, MemoryNote, MemoryReview } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/cn';
import { EvidenceList } from './EvidenceList';

export function MemoryDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(
    () => diffLines(before, after, { timeout: 100, maxEditLength: 5000 }),
    [before, after],
  );
  return parts ? (
    <pre
      aria-label="Memory changes"
      className="max-h-65 overflow-auto rounded-sm border border-border bg-surface-inset font-mono text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap"
    >
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn(
            'block px-3',
            part.added && 'bg-success/9 text-success',
            part.removed && 'bg-danger/9 text-danger',
          )}
        >
          {part.value
            .split('\n')
            .map((line, i, lines) =>
              i === lines.length - 1 && !line
                ? ''
                : `${part.added ? '+' : part.removed ? '-' : ' '}${line}\n`,
            )
            .join('')}
        </span>
      ))}
    </pre>
  ) : (
    <div className="grid gap-3 compact:grid-cols-2">
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{before}</pre>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{after}</pre>
    </div>
  );
}
export function MemoryReviewDialog({
  value,
  previous,
  proposalId,
  onClose,
  onSaved,
}: {
  value: MemoryInput;
  previous?: MemoryNote;
  proposalId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [report, setReport] = useState<MemoryReview | null>(null),
    [error, setError] = useState(''),
    [target, setTarget] = useState(previous?.id ?? ''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void api
      .reviewMemory(value, {
        proposalId,
        previousId: previous?.id,
        previousRevision: previous?.revision,
      })
      .then((result) => {
        if (live) setReport(result);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [value, proposalId, previous, reload]);
  const original =
    report?.previous?.id === target
      ? report.previous
      : report?.candidates.find((c) => c.memory.id === target)?.memory;
  async function commit() {
    if (!report) return;
    if (target && !original) {
      setError('The selected note is no longer in this review. Reload and choose again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.commitMemory(value, {
        proposalId,
        previousId: previous?.id,
        previousRevision: previous?.revision,
        inputDigest: report.inputDigest,
        evidenceDigest: report.evidenceDigest,
        action: original ? 'update' : 'create',
        targetId: original?.id,
        targetRevision: original?.revision,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the reviewed note.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Memory Review"
      onClose={onClose}
      className="max-h-[90dvh] w-210 max-w-[calc(100vw-24px)] overflow-y-auto max-compact:p-4"
    >
      <p className="mb-4 text-caption leading-relaxed text-muted">
        Review the proposed note, related notes, and evidence before saving. Existing memory changes
        only when you choose an update.
      </p>
      {error && (
        <ErrorNotice className="mb-3">
          {error}
          <Button
            variant="text"
            onClick={() => {
              setReport(null);
              setError('');
              setReload((n) => n + 1);
            }}
          >
            Reload review
          </Button>
        </ErrorNotice>
      )}
      {!report && !error && (
        <p className="py-6 text-caption text-muted">Checking related notes and evidence…</p>
      )}
      {report && (
        <div className="space-y-4">
          <div>
            <h3 className="text-label font-medium wrap-anywhere text-strong">{value.title}</h3>
            <p className="mt-1 text-micro text-subtle">
              Proposed · {value.scope}
              {value.pinned ? ' · pinned' : ''}
            </p>
            <pre className="mt-2 max-h-45 overflow-auto rounded-sm bg-surface-inset p-3 text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap">
              {value.body}
            </pre>
          </div>
          <Field>
            Save behavior
            <Select
              aria-label="Memory save behavior"
              value={target}
              disabled={Boolean(previous) || busy}
              onChange={(e) => setTarget(e.target.value)}
            >
              {report.previous ? (
                <option value={report.previous.id}>
                  Update current note · {report.previous.title}
                </option>
              ) : (
                <option value="">
                  {report.candidates.length ? 'Save as new note · keep both' : 'Save as new note'}
                </option>
              )}
              {report.candidates.map((candidate) => (
                <option key={candidate.memory.id} value={candidate.memory.id}>
                  Update existing · {candidate.memory.title}
                </option>
              ))}
            </Select>
          </Field>
          {report.candidates.length > 0 && (
            <div>
              <h3 className="mb-2 text-caption font-medium text-strong">
                Potential overlap · {report.candidates.length}
              </h3>
              {report.candidates.map((candidate) => (
                <details
                  key={candidate.memory.id}
                  open={report.candidates.length === 1}
                  className="mb-2 rounded-sm border border-border p-3 text-caption text-muted"
                >
                  <summary className="cursor-pointer wrap-anywhere">
                    {candidate.memory.title} · {candidate.reason}
                  </summary>
                  <p className="mt-2 text-micro text-subtle">
                    {candidate.memory.scope} · Revision {candidate.memory.revision}
                    {candidate.sharedTerms.length
                      ? ` · Shared words: ${candidate.sharedTerms.join(', ')}`
                      : ''}
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">
                    {candidate.memory.body}
                  </pre>
                </details>
              ))}
            </div>
          )}
          {original && (
            <section>
              <h3 className="mb-2 text-caption font-medium text-strong">
                Changes to revision {original.revision}
              </h3>
              <p className="mb-2 text-micro text-subtle">
                Scope: {original.scope} → {value.scope} · Pin: {original.pinned ? 'on' : 'off'} →{' '}
                {value.pinned ? 'on' : 'off'}
              </p>
              <MemoryDiff
                before={`${original.title}\n\n${original.body}`}
                after={`${value.title}\n\n${value.body}`}
              />
            </section>
          )}
          <section>
            <h3 className="mb-2 text-caption font-medium text-strong">
              Evidence to retain · {report.evidence.length}
            </h3>
            <EvidenceList evidence={report.evidence} />
          </section>
          <div className="space-y-2 text-micro leading-relaxed text-subtle">
            {report.notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={onClose}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={busy || Boolean(error)}
              onClick={() => void commit()}
            >
              {busy
                ? 'Saving…'
                : original
                  ? 'Update memory'
                  : report.candidates.length
                    ? 'Keep both'
                    : 'Save memory'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
