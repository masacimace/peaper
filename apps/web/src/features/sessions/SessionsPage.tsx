import type { Session } from '@peaper/shared';
import { ArrowUpRight, MessageSquare, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { Page, PageHeader } from '../../components/ui/Page';
import { StatusDot } from '../../components/ui/Status';
import { api } from '../../lib/api';
import { SessionActions } from '../continuity/SessionActions';

export function SessionsPage({
  sessions,
  onSelect,
  onNewSession,
}: {
  sessions: Session[];
  onSelect: (session: Session) => void;
  onNewSession: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!query.trim()) return;
    let live = true;
    const timer = setTimeout(() => {
      void api
        .sessions(query)
        .then((next) => {
          if (live) {
            setResults(next);
            setError('');
          }
        })
        .catch((error: Error) => {
          if (live) setError(error.message);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, sessions]);
  const visible = query.trim() ? results || [] : sessions;
  return (
    <Page>
      <PageHeader kicker="WORKSPACE" title="Sessions" description="Pick up where you left off.">
        <Button
          variant="primary"
          className="max-compact:min-h-7 max-compact:px-1.75 max-compact:py-1.25 max-compact:text-micro"
          onClick={onNewSession}
        >
          <Plus size={15} className="max-compact:w-3" />
          New session
        </Button>
      </PageHeader>
      <div className="mb-6.25 flex min-h-9 items-center gap-2.25 rounded-[5px] border border-border-strong bg-surface px-3 text-subtle">
        <Search size={15} />
        <input
          className="h-8.25 min-w-0 flex-1 border-0 bg-transparent text-label text-strong outline-none"
          aria-label="Search sessions"
          placeholder="Search your sessions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd className="font-mono text-mini">FTS5</kbd>
      </div>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      <div className="flex justify-between border-b border-border px-4 pb-2.5 text-mini tracking-[1px] text-subtle">
        <span>SESSION</span>
        <span>LAST UPDATED</span>
      </div>
      {visible.length ? (
        <div>
          {visible.map((session) => (
            <div className="flex items-center border-b border-border-subtle pr-2" key={session.id}>
              <button
                key={session.id}
                className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-4 text-left hover:bg-surface-hover max-compact:gap-2 max-compact:px-0.75 max-compact:py-3.25"
                onClick={() => onSelect(session)}
              >
                <span className="pt-px text-muted">
                  <MessageSquare size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-small font-[450] max-compact:text-caption">
                    {session.title}
                  </strong>
                  <small className="mt-1.25 flex items-center gap-1.5 text-micro text-subtle">
                    <StatusDot warning={session.status === 'interrupted'} />
                    {session.status}
                  </small>
                </span>
                <time
                  className="mr-3.25 text-caption text-muted max-compact:mr-0.75 max-compact:text-mini"
                  dateTime={session.updatedAt}
                >
                  {new Date(session.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
                <ArrowUpRight size={14} className="text-subtle" />
              </button>
              <SessionActions
                session={session}
                running={session.status === 'running'}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          variant="page"
          icon={MessageSquare}
          iconSize={29}
          title={query ? 'No matching sessions' : 'No sessions yet'}
          description={
            query
              ? 'Try another word from the session title or conversation.'
              : 'Create a session to keep your next task in context.'
          }
        >
          {!query && (
            <Button onClick={onNewSession}>
              Create a session
              <Plus size={14} />
            </Button>
          )}
        </EmptyState>
      )}
    </Page>
  );
}
