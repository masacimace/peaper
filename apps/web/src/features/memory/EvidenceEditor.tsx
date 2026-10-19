import { useEffect, useState } from 'react';
import type { AgentRun, MemoryInput, MemoryEvidenceInput } from '@peaper/shared';
import { Field, Select } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';

export function EvidenceEditor({
  value,
  onChange,
  locked = false,
}: {
  value: MemoryInput;
  onChange: (value: MemoryInput) => void;
  locked?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; runs: AgentRun[] } | null>(null),
    [error, setError] = useState(''),
    [fileDraft, setFileDraft] = useState(
      () =>
        value.evidence
          ?.filter((r) => r.kind === 'file')
          .map((r) => r.path)
          .join('\n') ?? '',
    );
  useEffect(() => {
    if (!value.sessionId) return;
    let live = true;
    void api
      .runs(value.sessionId)
      .then(({ runs }) => {
        if (live) {
          setSnapshot({ sessionId: value.sessionId!, runs: runs.slice(-50) });
          setError('');
        }
      })
      .catch(() => {
        if (live)
          setError(
            'Source tasks are unavailable in this workspace. Existing captured evidence can still be retained.',
          );
      });
    return () => {
      live = false;
    };
  }, [value.sessionId]);
  const runs = snapshot?.sessionId === value.sessionId ? snapshot.runs : [],
    source = runs.find((run) => run.id === value.sourceRunId),
    references = value.evidence ?? [];
  function toggle(reference: MemoryEvidenceInput, checked: boolean) {
    const key = JSON.stringify(reference);
    onChange({
      ...value,
      evidence: checked
        ? [...references, reference]
        : references.filter((r) => JSON.stringify(r) !== key),
    });
  }
  return (
    <details className="rounded-sm border border-border p-3 text-caption text-muted">
      <summary className="cursor-pointer font-medium text-strong">
        Evidence · files, messages, and tool results
      </summary>
      <div className="mt-3 space-y-3">
        <Field>
          Related workspace files
          <textarea
            aria-label="Memory evidence files"
            rows={3}
            value={fileDraft}
            onChange={(e) => {
              setFileDraft(e.target.value);
              onChange({
                ...value,
                evidence: [
                  ...references.filter((r) => r.kind !== 'file'),
                  ...e.target.value
                    .split('\n')
                    .map((path) => path.trim())
                    .filter(Boolean)
                    .map((path) => ({ kind: 'file' as const, path })),
                ],
              });
            }}
            className="rounded-sm border border-border bg-surface-inset p-2 font-mono text-caption text-foreground"
            placeholder={'src/styles/tokens.css\nsrc/theme.ts'}
          />
        </Field>
        <p className="text-micro text-subtle">
          One relative path per line. Up to 8 evidence references total. Files are captured for
          review without executing them.
        </p>
        {value.sessionId && (
          <Field>
            Source task
            <Select
              aria-label="Memory evidence source task"
              value={value.sourceRunId ?? ''}
              disabled={locked}
              onChange={(e) => onChange({ ...value, sourceRunId: e.target.value || null })}
            >
              <option value="">None</option>
              {value.sourceRunId && !source && (
                <option value={value.sourceRunId}>
                  Original task · {value.sourceRunId.slice(0, 8)}
                </option>
              )}
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.prompt.slice(0, 90)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && <p className="text-micro text-subtle">{error}</p>}
        {references
          .filter((r) => r.kind !== 'file')
          .map((reference, index) => (
            <div
              key={`${JSON.stringify(reference)}:${index}`}
              className="flex items-center justify-between gap-2 text-micro text-subtle"
            >
              <span className="min-w-0 wrap-anywhere">
                Attached {reference.kind} · {reference.runId.slice(0, 8)}
                {reference.kind === 'activity'
                  ? ` · ${reference.activityId.slice(0, 12)}`
                  : ` · ${reference.role}`}
              </span>
              <Button
                variant="text"
                className="text-micro"
                onClick={() => toggle(reference, false)}
              >
                Remove
              </Button>
            </div>
          ))}
        {source && (
          <>
            <p className="text-micro text-subtle">
              The source user request is attached automatically when there is room. Select
              additional observed evidence below.
            </p>
            {source.text && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={references.some(
                    (r) => r.kind === 'message' && r.runId === source.id && r.role === 'assistant',
                  )}
                  disabled={
                    references.length >= 8 &&
                    !references.some(
                      (r) =>
                        r.kind === 'message' && r.runId === source.id && r.role === 'assistant',
                    )
                  }
                  onChange={(e) =>
                    toggle(
                      { kind: 'message', runId: source.id, role: 'assistant' },
                      e.target.checked,
                    )
                  }
                />
                Agent response
              </label>
            )}
            {source.activities.slice(-20).map((activity) => (
              <label className="flex items-start gap-2 wrap-anywhere" key={activity.id}>
                <input
                  type="checkbox"
                  checked={references.some(
                    (r) =>
                      r.kind === 'activity' &&
                      r.runId === source.id &&
                      r.activityId === activity.id,
                  )}
                  disabled={
                    references.length >= 8 &&
                    !references.some(
                      (r) =>
                        r.kind === 'activity' &&
                        r.runId === source.id &&
                        r.activityId === activity.id,
                    )
                  }
                  onChange={(e) =>
                    toggle(
                      { kind: 'activity', runId: source.id, activityId: activity.id },
                      e.target.checked,
                    )
                  }
                />
                {activity.name.replaceAll('_', ' ')} · {activity.status}
                {typeof activity.input.path === 'string' ? ` · ${activity.input.path}` : ''}
              </label>
            ))}
          </>
        )}
        {references.length > 8 && (
          <p role="alert" className="text-warning">
            Choose at most 8 evidence references.
          </p>
        )}
      </div>
    </details>
  );
}
