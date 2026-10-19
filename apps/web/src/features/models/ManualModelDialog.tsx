import { useState, type FormEvent } from 'react';
import type { ModelState } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';

export function ManualModelDialog({
  state,
  onClose,
  onSaved,
}: {
  state: ModelState;
  onClose: () => void;
  onSaved: (state: ModelState) => void;
}) {
  const [connectionId, setConnectionId] = useState(
    state.connections.find((item) => item.enabled)?.id ?? '',
  );
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(await api.addModel(connectionId, id, name));
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not add model.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Enter model ID manually" onClose={onClose}>
      <p className="text-label leading-relaxed text-muted">
        Use this for models missing from a catalog or servers that do not list their models.
        Capabilities remain unknown until tested.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="mt-5 grid gap-4 border-0 p-0">
          <Field>
            Provider connection
            <Select
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              required
            >
              <option value="" disabled>
                Choose a connection
              </option>
              {state.connections
                .filter((item) => item.enabled)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field>
            Model ID
            <Input
              required
              maxLength={200}
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="provider/model-id"
              spellCheck={false}
            />
          </Field>
          <Field>
            Display name (optional)
            <Input maxLength={240} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </fieldset>
        {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !connectionId}>
            {busy ? 'Adding…' : 'Add model'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
