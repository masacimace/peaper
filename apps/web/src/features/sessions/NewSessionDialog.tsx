import { useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Session } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { api } from '../../lib/api';

export function NewSessionDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (session: Session) => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      onCreated(await api.createSession(title.trim()));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create session');
      setBusy(false);
    }
  }
  return (
    <Dialog title="New session" onClose={onClose}>
      <p className="muted">
        Name this session so you can find it later. Sessions are saved on this computer.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field-label" htmlFor="session-title">
          Session name
        </label>
        <input
          id="session-title"
          autoFocus
          maxLength={120}
          placeholder="e.g. Build the settings page"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="quiet-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!title.trim() || busy}>
            {busy ? 'Saving…' : 'Create session'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
