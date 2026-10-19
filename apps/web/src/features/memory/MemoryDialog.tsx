import { useState } from 'react';
import type { MemoryInput, MemoryNote, Session } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { memoryInput } from './memory-input';
import { EvidenceEditor } from './EvidenceEditor';
import { MemoryReviewDialog } from './MemoryReviewDialog';

export function MemoryDialog({
  previous,
  initial,
  sessions = [],
  onClose,
  onSaved,
  proposalId,
}: {
  previous?: MemoryNote;
  initial?: Partial<MemoryInput>;
  sessions?: Session[];
  onClose: () => void;
  onSaved: () => void;
  proposalId?: string;
}) {
  const [value, setValue] = useState<MemoryInput>(() => ({
    title: '',
    body: '',
    scope: 'project',
    sessionId: null,
    sourceRunId: null,
    pinned: false,
    ...(previous ? memoryInput(previous) : {}),
    ...initial,
  }));
  const [error, setError] = useState(''),
    [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MemoryInput>(key: K, item: MemoryInput[K]) =>
    setValue((v) => ({ ...v, [key]: item }));
  if (reviewing)
    return (
      <MemoryReviewDialog
        value={value}
        previous={previous}
        proposalId={proposalId}
        onClose={() => setReviewing(false)}
        onSaved={() => {
          onSaved();
          onClose();
        }}
      />
    );
  return (
    <Dialog
      title={previous ? 'Edit memory' : 'Save to Memory'}
      onClose={onClose}
      className="max-h-[90dvh] w-160 max-w-[calc(100vw-24px)] overflow-y-auto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setReviewing(true);
        }}
        className="space-y-4"
      >
        <Field>
          Title
          <Input
            required
            maxLength={120}
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-compact:grid-cols-1">
          <Field>
            Scope
            <Select
              value={value.scope}
              onChange={(e) => set('scope', e.target.value as MemoryInput['scope'])}
            >
              <option value="global">Global · all projects in this profile</option>
              <option value="project">Project · current workspace</option>
              <option value="recap">Session recap · this session only</option>
            </Select>
          </Field>
          <Field>
            Source session{value.scope !== 'recap' && ' (optional)'}
            <Select
              disabled={Boolean(proposalId)}
              value={value.sessionId ?? ''}
              onChange={(e) =>
                setValue((v) => ({ ...v, sessionId: e.target.value || null, sourceRunId: null }))
              }
            >
              <option value="">None</option>
              {value.sessionId && !sessions.some((s) => s.id === value.sessionId) && (
                <option value={value.sessionId}>
                  Original session · {value.sessionId.slice(0, 8)}
                </option>
              )}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {value.scope === 'recap' && value.sessionId && (
          <Button
            disabled={busy}
            onClick={() => {
              setError('');
              setBusy(true);
              const sourceSession = value.sessionId!;
              void api
                .sessionDraft(sourceSession)
                .then((state) => {
                  if (!state.compaction)
                    throw new Error(
                      'No saved conversation recap yet. Ask the agent to suggest a session recap, or write one below.',
                    );
                  setValue((v) =>
                    v.sessionId === sourceSession
                      ? {
                          ...v,
                          body: state.compaction!.summary,
                          sourceRunId: state.compaction!.throughRunId,
                          title: v.title || 'Session recap',
                        }
                      : v,
                  );
                })
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Use saved conversation recap
          </Button>
        )}
        <Field>
          Note
          <textarea
            required
            aria-label="Memory note"
            maxLength={8000}
            rows={9}
            className="w-full resize-y rounded-sm border border-border bg-surface-inset p-3 text-label leading-relaxed text-foreground"
            value={value.body}
            onChange={(e) => set('body', e.target.value)}
          />
        </Field>
        <EvidenceEditor value={value} onChange={setValue} locked={Boolean(proposalId)} />
        <label className="flex items-center gap-2 text-caption text-muted">
          <input
            type="checkbox"
            checked={value.pinned}
            onChange={(e) => set('pinned', e.target.checked)}
          />
          Pin within its scope
        </label>
        <p className="text-caption leading-relaxed text-subtle">
          Pinned notes are considered first within the context limit. Other notes are retrieved by
          relevance. Saving a note makes it available to future tasks in its scope.
        </p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy ||
              !value.title.trim() ||
              !value.body.trim() ||
              (value.scope === 'recap' && !value.sessionId) ||
              (value.evidence?.length ?? 0) > 8
            }
          >
            Review memory
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
