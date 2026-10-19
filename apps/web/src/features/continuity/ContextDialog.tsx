import { useState } from 'react';
import type { ContextInfo, ModelSelection } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';

export function ContextDialog({
  id,
  info,
  selection,
  running,
  onClose,
  onRefresh,
}: {
  id: string;
  info: ContextInfo;
  selection: ModelSelection | null;
  running: boolean;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function compact() {
    setBusy(true);
    setError('');
    try {
      await api.compact(id, selection);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compaction failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Context & instructions"
      onClose={onClose}
      className="max-h-[85dvh] overflow-y-auto"
    >
      <dl className="grid grid-cols-2 gap-2 text-caption">
        <dt className="text-muted">Estimated input</dt>
        <dd className="text-right">~{info.estimatedTokens.toLocaleString()} tokens</dd>
        <dt className="text-muted">Model context</dt>
        <dd className="text-right">
          {info.contextWindow?.toLocaleString() ?? 'Unknown · 32K fallback'}
        </dd>
        <dt className="text-muted">Output reserve</dt>
        <dd className="text-right">{info.outputReserve.toLocaleString()}</dd>
        <dt className="text-muted">Input budget</dt>
        <dd className="text-right">{info.budget.toLocaleString()}</dd>
      </dl>
      <p className="mt-3 text-caption leading-relaxed text-subtle">
        Input is an estimate, including a conservative allowance for instructions and tools.
        Provider-reported usage remains available on each task.
      </p>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-label font-medium">Conversation compaction</h3>
        <p className="my-2 text-caption leading-relaxed text-muted">
          {info.compactedTurns} of {info.totalTurns} turns summarized. Keeps the two most recent
          turns and retains the original transcript. Compaction uses your selected model and can use
          provider credits; it also runs automatically near the context budget.
        </p>
        <Button
          disabled={busy || running || !selection || info.totalTurns - info.compactedTurns <= 2}
          onClick={() => void compact()}
        >
          {busy ? 'Summarizing…' : 'Compact older turns'}
        </Button>
        {info.state.compaction && (
          <details className="mt-3">
            <summary className="text-caption text-muted">View saved recap</summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-sm bg-surface-inset p-3 text-caption wrap-anywhere whitespace-pre-wrap">
              {info.state.compaction.summary}
            </pre>
          </details>
        )}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-label font-medium">Active instructions</h3>
        <p className="my-2 text-caption leading-relaxed text-muted">
          Loaded from ~/.peaper/PEAPER.md, project PEAPER.md, and the selected file’s parent
          directories. Directory rules are also loaded before file tools operate in a new scope.
        </p>
        {info.instructions.length ? (
          info.instructions.map((source) => (
            <details key={source.path} className="mt-2 rounded-sm border border-border p-2">
              <summary className="text-caption wrap-anywhere">
                <span className="text-accent">{source.scope}</span> · {source.path}
              </summary>
              <pre className="mt-2 max-h-50 overflow-auto text-caption wrap-anywhere whitespace-pre-wrap">
                {source.content}
              </pre>
            </details>
          ))
        ) : (
          <p className="text-caption text-subtle">
            No PEAPER.md instructions found for this scope.
          </p>
        )}
      </div>
      {info.state.lastRestore && (
        <p className="mt-4 text-caption leading-relaxed text-muted">
          Latest file restore: {info.state.lastRestore.paths.join(', ')}. The conversation was
          retained; future tasks are told to verify current files.
        </p>
      )}
      {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
    </Dialog>
  );
}
