import { useEffect, useState } from 'react';
import type { MemoryProposal, RuntimeEvent } from '@peaper/shared';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { MemoryDialog } from './MemoryDialog';
import { memoryInput } from './memory-input';
import { MemoryReviewDialog } from './MemoryReviewDialog';

export function MemorySuggestion({ suggestion }: { suggestion: MemoryProposal }) {
  const [current, setCurrent] = useState(suggestion),
    [editing, setEditing] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => {
      void api
        .memorySuggestion(suggestion.id)
        .then((value) => {
          if (live) setCurrent(value);
        })
        .catch(() => {});
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent<RuntimeEvent>).detail.type === 'knowledge.updated') load();
    };
    load();
    window.addEventListener('peaper:runtime-event', changed);
    return () => {
      live = false;
      window.removeEventListener('peaper:runtime-event', changed);
    };
  }, [suggestion.id]);
  async function decide(action: 'save' | 'dismiss') {
    setBusy(true);
    setError('');
    try {
      setCurrent(await api.decideMemory(suggestion.id, action));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update suggestion.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      role="group"
      aria-label={`Memory suggestion: ${current.title}`}
      className="my-3 rounded-sm border border-border bg-surface-inset p-3"
    >
      <p className="text-micro text-subtle">
        Memory suggestion · {current.scope} ·{' '}
        {current.status === 'pending' ? 'awaiting your choice' : current.status}
      </p>
      <p className="mt-2 text-label font-medium text-strong">{current.title}</p>
      <p className="mt-2 text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap text-muted">
        {current.body}
      </p>
      {current.status === 'pending' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setReviewing(true)}>
            Review & save
          </Button>
          <Button disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="text" disabled={busy} onClick={() => void decide('dismiss')}>
            Dismiss
          </Button>
        </div>
      )}
      {error && <ErrorNotice className="mt-2">{error}</ErrorNotice>}
      {editing && (
        <MemoryDialog
          initial={memoryInput(current)}
          proposalId={current.id}
          onClose={() => setEditing(false)}
          onSaved={() => {}}
        />
      )}
      {reviewing && (
        <MemoryReviewDialog
          value={memoryInput(current)}
          proposalId={current.id}
          onClose={() => setReviewing(false)}
          onSaved={() => {
            setReviewing(false);
            void api
              .memorySuggestion(current.id)
              .then(setCurrent)
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
