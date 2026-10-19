import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { MemoryLens, MemorySelection } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { MemoryEvidenceDialog } from './MemoryEvidence';
import { memoryReason } from './memory-context';

export function MemoryLensControl({
  query,
  sessionId,
  value,
  onChange,
}: {
  query: string;
  sessionId?: string;
  value: MemorySelection;
  onChange: (value: MemorySelection) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Open Memory Lens"
        title="Preview and choose memory for the next task"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-sm px-1 text-caption text-muted hover:bg-surface-hover"
      >
        <BookOpen size={12} />
        Memory{value.includeIds.length || value.excludeIds.length ? ' · custom' : ''}
      </button>
      {open && (
        <MemoryLensDialog
          query={query}
          sessionId={sessionId}
          initial={value}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
function MemoryLensDialog({
  query,
  sessionId,
  initial,
  onClose,
  onApply,
}: {
  query: string;
  sessionId?: string;
  initial: MemorySelection;
  onClose: () => void;
  onApply: (value: MemorySelection) => void;
}) {
  const [selection, setSelection] = useState(initial),
    [snapshot, setSnapshot] = useState<{ key: string; value: MemoryLens } | null>(null),
    [error, setError] = useState(''),
    [filter, setFilter] = useState(''),
    [inspecting, setInspecting] = useState<string | null>(null);
  const key = JSON.stringify({ query, sessionId, selection });
  useEffect(() => {
    let live = true;
    void api
      .memoryLens(query, selection, sessionId)
      .then((value) => {
        if (live) {
          setSnapshot({ key, value });
          setError('');
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [key, query, selection, sessionId]);
  const report = snapshot?.value,
    loaded = snapshot?.key === key;
  function choose(id: string, choice: string) {
    setSelection((previous) => ({
      includeIds: [
        ...previous.includeIds.filter((v) => v !== id),
        ...(choice === 'include' ? [id] : []),
      ],
      excludeIds: [
        ...previous.excludeIds.filter((v) => v !== id),
        ...(choice === 'exclude' ? [id] : []),
      ],
    }));
  }
  return (
    <>
      <Dialog
        title="Memory Lens · next task"
        onClose={onClose}
        className="max-h-[90dvh] w-210 max-w-[calc(100vw-24px)] overflow-y-auto max-compact:p-4"
      >
        <p className="mb-4 text-caption leading-relaxed text-muted">
          Preview scoped memory for your current draft. Include or exclude notes for this task
          without changing stored memory. Exclusions also apply to agent memory searches; they do
          not erase earlier conversation content.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field className="min-w-40 flex-1">
            Filter preview
            <Input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Title or note text…"
            />
          </Field>
          <Button onClick={() => setSelection({ includeIds: [], excludeIds: [] })}>
            Reset choices
          </Button>
        </div>
        {error && <ErrorNotice className="mb-3">{error}</ErrorNotice>}
        <p role="status" className="mb-3 text-caption text-subtle">
          {!loaded
            ? 'Updating preview…'
            : `${report?.memories.length ?? 0} notes selected · ${selection.includeIds.length}/6 manual includes · 12 notes / 32 KB maximum`}
        </p>
        {report?.warnings.map((warning) => (
          <p key={warning} className="mb-2 text-caption text-warning">
            {warning}
          </p>
        ))}
        <div className="space-y-2">
          {report?.entries
            .filter(({ memory }) =>
              `${memory.title} ${memory.body}`.toLowerCase().includes(filter.toLowerCase()),
            )
            .map(({ memory, context }) => (
              <div key={memory.id} className="rounded-sm border border-border p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-micro text-subtle">
                      {memory.scope} · Revision {memory.revision} ·{' '}
                      {context.selected ? 'Will load' : 'Not selected'}
                    </p>
                    <h3 className="mt-1 text-caption font-medium wrap-anywhere text-strong">
                      {memory.title}
                    </h3>
                    <p className="mt-1 text-micro text-muted">
                      {memoryReason[context.reason]}
                      {context.reason === 'match' && context.matchedTerms.length
                        ? ` · ${context.matchedTerms.join(', ')}`
                        : ''}
                    </p>
                  </div>
                  <Select
                    aria-label={`Memory choice for ${memory.title}`}
                    className="w-28"
                    value={
                      selection.excludeIds.includes(memory.id)
                        ? 'exclude'
                        : selection.includeIds.includes(memory.id)
                          ? 'include'
                          : 'auto'
                    }
                    onChange={(e) => choose(memory.id, e.target.value)}
                  >
                    <option value="auto">Auto</option>
                    <option
                      value="include"
                      disabled={
                        selection.includeIds.length >= 6 &&
                        !selection.includeIds.includes(memory.id)
                      }
                    >
                      Include
                    </option>
                    <option
                      value="exclude"
                      disabled={
                        selection.excludeIds.length >= 100 &&
                        !selection.excludeIds.includes(memory.id)
                      }
                    >
                      Exclude
                    </option>
                  </Select>
                </div>
                <details className="mt-2 text-caption text-muted">
                  <summary className="cursor-pointer">Read note</summary>
                  <pre className="my-2 max-h-45 overflow-auto wrap-anywhere whitespace-pre-wrap">
                    {memory.body}
                  </pre>
                  <Button variant="text" onClick={() => setInspecting(memory.id)}>
                    Evidence & history
                  </Button>
                </details>
              </div>
            ))}
        </div>
        {loaded && !report?.entries.length && (
          <p className="py-6 text-caption text-subtle">
            No memory available in this scope. Add a note in Memory, or write task details to find
            relevant notes.
          </p>
        )}
        <p className="mt-4 text-micro leading-relaxed text-subtle">
          The task captures current note revisions when sent. Agent searches may load additional
          matching notes during execution. Preview choices apply to one sent task.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!loaded || Boolean(error) || report?.overBudget}
            onClick={() => onApply(selection)}
          >
            Apply to next task
          </Button>
        </div>
      </Dialog>
      {inspecting && <MemoryEvidenceDialog id={inspecting} onClose={() => setInspecting(null)} />}
    </>
  );
}
