import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquare, Plus, Search } from 'lucide-react';
import type { Session } from '@peaper/shared';
import { api } from '../../lib/api';

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
    <div className="manager-page">
      <div className="manager-heading">
        <div>
          <span className="section-kicker">WORKSPACE</span>
          <h1>Sessions</h1>
          <p>Pick up where you left off.</p>
        </div>
        <button className="primary-button" onClick={onNewSession}>
          <Plus size={15} />
          New session
        </button>
      </div>
      <div className="manager-search">
        <Search size={15} />
        <input
          aria-label="Search sessions"
          placeholder="Search your sessions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>FTS5</kbd>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="session-table-heading">
        <span>SESSION</span>
        <span>LAST UPDATED</span>
      </div>
      {visible.length ? (
        <div className="session-results">
          {visible.map((session) => (
            <button key={session.id} className="session-result" onClick={() => onSelect(session)}>
              <span className="session-result-icon">
                <MessageSquare size={17} />
              </span>
              <span>
                <strong>{session.title}</strong>
                <small>
                  <span
                    className={`status-dot ${session.status === 'interrupted' ? 'warning-dot' : ''}`}
                  />
                  {session.status}
                </small>
              </span>
              <time dateTime={session.updatedAt}>
                {new Date(session.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      ) : (
        <div className="manager-empty">
          <MessageSquare size={29} strokeWidth={1.2} />
          <h2>{query ? 'No matching sessions' : 'No sessions yet'}</h2>
          <p>
            {query
              ? 'Try another word from your session title.'
              : 'Create a session to keep your next task in context.'}
          </p>
          {!query && (
            <button className="secondary-button" onClick={onNewSession}>
              Create a session
              <Plus size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
