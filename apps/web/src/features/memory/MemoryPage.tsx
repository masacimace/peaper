import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Pin, Plus, Trash2, Pencil, History } from 'lucide-react';
import type { MemoryInput, MemoryNote, RuntimeEvent, Session } from '@peaper/shared';
import { Page, PageHeader } from '../../components/ui/Page';
import { Button, IconButton } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';
import { MemoryDialog } from './MemoryDialog';
import { memoryInput } from './memory-input';
import { MemoryEvidenceDialog } from './MemoryEvidence';

export function MemoryPage({ sessions }: { sessions: Session[] }) {
  const [notes, setNotes] = useState<MemoryNote[]>([]),
    [query, setQuery] = useState(''),
    [scope, setScope] = useState('all');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<MemoryNote | 'new' | 'recap' | null>(null),
    [deleting, setDeleting] = useState<MemoryNote | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await api.memories(query, scope);
    setNotes(result.memories);
    setLoaded(true);
  }, [query, scope]);
  useEffect(() => {
    let live = true;
    const load = () => {
      void api
        .memories(query, scope)
        .then(({ memories }) => {
          if (live) {
            setNotes(memories);
            setLoaded(true);
            setError('');
          }
        })
        .catch((e: Error) => {
          if (live) setError(e.message);
        });
    };
    const timer = setTimeout(load, 150);
    const event = (event: Event) => {
      if ((event as CustomEvent<RuntimeEvent>).detail.type === 'knowledge.updated') load();
    };
    window.addEventListener('peaper:runtime-event', event);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener('peaper:runtime-event', event);
    };
  }, [query, scope]);
  async function pin(note: MemoryNote) {
    setBusy(note.id);
    setError('');
    try {
      await api.saveMemory({ ...memoryInput(note), pinned: !note.pinned }, note);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update memory.');
    } finally {
      setBusy('');
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(deleting.id);
    setError('');
    try {
      await api.deleteMemory(deleting.id, deleting.revision);
      setDeleting(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete memory.');
    } finally {
      setBusy('');
    }
  }
  const initial: Partial<MemoryInput> | undefined =
    editing === 'recap' ? { scope: 'recap', title: 'Session recap' } : undefined;
  return (
    <Page className="max-w-280">
      <PageHeader
        kicker="LASTING CONTEXT"
        title="Memory"
        description="Decisions, preferences, and the work worth carrying forward."
      >
        <Button
          variant="primary"
          className="max-compact:px-2 max-compact:text-caption"
          onClick={() => setEditing('new')}
        >
          <Plus size={14} />
          Add memory
        </Button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field className="min-w-40 flex-1 max-compact:basis-full">
          Search memory
          <Input
            type="search"
            placeholder="Search titles and notes…"
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field className="w-42 min-w-40 max-compact:flex-1">
          Scope
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="recap">Session recaps</option>
          </Select>
        </Field>
        <Button onClick={() => setEditing('recap')}>Create recap</Button>
      </div>
      <p className="mb-5 text-caption leading-relaxed text-subtle">
        Global notes follow this Peaper data profile across projects. Project notes stay in this
        workspace. Recaps are retrieved only in their source session. Pinned notes are considered
        first; sources used by a task appear in its conversation.
      </p>
      {error && <ErrorNotice className="mb-4">{error}</ErrorNotice>}
      {!loaded && !error && <p className="py-8 text-label text-muted">Loading memory…</p>}
      {loaded && !notes.length && (
        <EmptyState
          variant="page"
          icon={BookOpen}
          iconSize={30}
          title={query ? 'No matching notes' : 'Keep the decisions that matter'}
          description="Save a preference, project decision, or session recap. Agent suggestions stay pending until you choose to save them."
        />
      )}
      <div className="divide-y divide-border-subtle border-t border-border-subtle">
        {notes.map((note) => (
          <article className="py-4" key={note.id}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-micro text-subtle">
                  {note.scope}
                  {note.pinned ? ' · pinned' : ''} · Updated{' '}
                  {new Date(note.updatedAt).toLocaleDateString()}
                </p>
                <h2 className="mt-1 text-label font-medium wrap-anywhere text-strong">
                  {note.title}
                </h2>
              </div>
              <IconButton
                aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title}`}
                disabled={Boolean(busy)}
                onClick={() => void pin(note)}
                className={note.pinned ? 'text-accent' : undefined}
              >
                <Pin size={14} />
              </IconButton>
              <IconButton aria-label={`Edit ${note.title}`} onClick={() => setEditing(note)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton aria-label={`Delete ${note.title}`} onClick={() => setDeleting(note)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <p className="mt-2 text-label leading-relaxed wrap-anywhere whitespace-pre-wrap text-muted">
              {note.body.length > 500 ? `${note.body.slice(0, 500)}…` : note.body}
            </p>
            <Button
              variant="text"
              className="mt-2 px-0 text-caption"
              aria-label={`Evidence and history for ${note.title}`}
              onClick={() => setInspecting(note.id)}
            >
              <History size={12} />
              Evidence & history · {note.evidence.length} sources · r{note.revision}
            </Button>
            {note.sessionId && (
              <p className="mt-2 text-micro text-subtle">
                Source:{' '}
                {sessions.find((session) => session.id === note.sessionId)?.title ??
                  `session ${note.sessionId.slice(0, 8)}`}
                {note.sourceRunId ? ` · task ${note.sourceRunId.slice(0, 8)}` : ''}
              </p>
            )}
          </article>
        ))}
      </div>
      {notes.length === 100 && (
        <p className="mt-4 text-caption text-subtle">
          Showing the first 100 notes. Refine your search to find older notes.
        </p>
      )}
      {editing && (
        <MemoryDialog
          previous={typeof editing === 'object' ? editing : undefined}
          initial={initial}
          sessions={sessions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void refresh().catch(() => {});
          }}
        />
      )}
      {inspecting && <MemoryEvidenceDialog id={inspecting} onClose={() => setInspecting(null)} />}
      {deleting && (
        <Dialog title="Delete memory?" onClose={() => setDeleting(null)}>
          <p className="text-label leading-relaxed text-muted">
            Delete “{deleting.title}” from stored memory and search. Future tasks will not retrieve
            it. Historical task snapshots and exports retain the context they previously used.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              className="border-danger text-danger"
              disabled={Boolean(busy)}
              onClick={() => void remove()}
            >
              Delete memory
            </Button>
          </div>
        </Dialog>
      )}
    </Page>
  );
}
