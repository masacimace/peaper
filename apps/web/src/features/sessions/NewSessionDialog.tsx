import type { Session } from '@peaper/shared';
import { ArrowUpRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
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
      <p className="text-label leading-[1.8] text-muted">
        Name this session so you can find it later. Sessions are saved on this computer.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <Field className="mt-5.5 mb-1.75 text-caption text-foreground" htmlFor="session-title">
          Session name
        </Field>
        <Input
          className="h-auto border-border-strong p-2.5 text-small"
          id="session-title"
          autoFocus
          maxLength={120}
          placeholder="e.g. Build the settings page"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        {error && (
          <p className="mt-2.5 text-label text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5.75 flex justify-end gap-3.25">
          <Button variant="text" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!title.trim() || busy}>
            {busy ? 'Saving…' : 'Create session'}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
