import { useState, type FormEvent } from 'react';
import type { ConnectionInput, ModelState, ProviderConnection } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';

export function ConnectionDialog({
  connection,
  onClose,
  onSaved,
}: {
  connection?: ProviderConnection;
  onClose: () => void;
  onSaved: (state: ModelState) => void;
}) {
  const [name, setName] = useState(connection?.name ?? '');
  const [kind, setKind] = useState<ConnectionInput['kind']>(connection?.kind ?? 'openrouter');
  const [baseURL, setBaseURL] = useState(connection?.baseURL ?? 'https://openrouter.ai/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(
        await api.saveConnection(
          { name, kind, baseURL, enabled, ...(apiKey ? { apiKey } : {}) },
          connection?.id,
        ),
      );
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save connection.');
    } finally {
      setBusy(false);
    }
  }
  const sameDestination =
    connection?.kind === kind && connection.baseURL === baseURL.replace(/\/+$/, '');
  return (
    <Dialog title={connection ? 'Edit provider' : 'Add provider'} onClose={onClose}>
      <p className="text-label leading-relaxed text-muted">
        Give each connection a name. You can connect the same provider with different accounts.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="mt-5 grid gap-4 border-0 p-0">
          <Field>
            Connection name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              placeholder="e.g. OpenRouter Personal"
            />
          </Field>
          <Field>
            Provider
            <Select
              value={kind}
              onChange={(event) => {
                const next = event.target.value as ConnectionInput['kind'];
                setKind(next);
                setBaseURL(
                  next === 'openrouter'
                    ? 'https://openrouter.ai/api/v1'
                    : 'http://127.0.0.1:1234/v1',
                );
              }}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="compatible">Custom compatible</option>
            </Select>
          </Field>
          <Field>
            Base URL
            <Input
              type="url"
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              readOnly={kind === 'openrouter'}
              required
              spellCheck={false}
            />
          </Field>
          <Field>
            API key
            <Input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required={kind === 'openrouter' && !(sameDestination && connection?.hasKey)}
              placeholder={
                sameDestination && connection?.hasKey
                  ? 'Saved · leave blank to keep'
                  : kind === 'openrouter'
                    ? 'OpenRouter API key'
                    : 'Optional for a local server'
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-label text-muted">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-accent"
            />
            Enable this connection
          </label>
        </fieldset>
        <p className="mt-4 text-caption leading-relaxed text-subtle">
          Credentials are encrypted in the local runtime. Saving a connection does not make a model
          request.
        </p>
        {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save provider'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
