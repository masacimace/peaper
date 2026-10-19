import { useState } from 'react';
import type { Persona } from '@peaper/shared';
import { Button, IconButton } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/Dialog';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import type { useKnowledge } from '../knowledge/useKnowledge';
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';

export function ProfilesPanel({ controller }: { controller: ReturnType<typeof useKnowledge> }) {
  const [editing, setEditing] = useState<Persona | 'new' | null>(null),
    [deleting, setDeleting] = useState<Persona | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const profiles = controller.state?.personas ?? [];
  async function defaultProfile(id: string) {
    setError('');
    try {
      await api.defaultPersona(id);
      await controller.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update default.');
    }
  }
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Field className="w-65 max-compact:w-full">
          Workspace default profile
          <Select
            value={controller.state?.defaultProfileId ?? 'none'}
            onChange={(e) => void defaultProfile(e.target.value)}
          >
            <option value="none">None</option>
            {profiles
              .filter((p) => p.enabled)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.scope}
                </option>
              ))}
          </Select>
        </Field>
        <Button onClick={() => setEditing('new')}>
          <Plus size={13} />
          Create profile
        </Button>
      </div>
      <p className="mb-4 text-caption leading-relaxed text-subtle">
        Profiles guide the primary agent’s behavior. Scoped PEAPER.md rules and tool permissions
        remain in effect. Changes apply to future tasks; the composer can override the workspace
        default per session.
      </p>
      {error && <ErrorNotice className="mb-4">{error}</ErrorNotice>}
      {!profiles.length && (
        <EmptyState
          variant="page"
          icon={UserRound}
          title="Make the agent work your way"
          description="Create a profile for your communication preferences, review approach, or development conventions."
        />
      )}
      <div className="divide-y divide-border-subtle border-t border-border-subtle">
        {profiles.map((profile) => (
          <div className="py-4" key={profile.id}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-micro text-subtle">
                  {profile.scope} · {profile.enabled ? 'enabled' : 'disabled'}
                  {profile.id === controller.state?.defaultProfileId ? ' · workspace default' : ''}
                </p>
                <h3 className="mt-1 text-label font-medium text-strong">{profile.name}</h3>
                <p className="mt-2 text-caption leading-relaxed text-muted">
                  {profile.description}
                </p>
              </div>
              <IconButton aria-label={`Edit ${profile.name}`} onClick={() => setEditing(profile)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton
                aria-label={`Delete ${profile.name}`}
                onClick={() => setDeleting(profile)}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
            <details className="mt-3 text-caption text-muted">
              <summary>View instructions</summary>
              <pre className="mt-2 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">
                {profile.instructions}
              </pre>
            </details>
          </div>
        ))}
      </div>
      {editing && (
        <ProfileEditor
          previous={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void controller.refresh().catch(() => {});
          }}
        />
      )}
      {deleting && (
        <Dialog title="Delete profile?" onClose={() => setDeleting(null)}>
          <p className="text-label leading-relaxed text-muted">
            Delete “{deleting.name}”. Historical tasks retain the profile they used. Select a
            replacement for sessions that explicitly chose this profile.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              className="text-danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api
                  .deletePersona(deleting.id, deleting.revision)
                  .then(async () => {
                    setDeleting(null);
                    await controller.refresh();
                  })
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Delete profile
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function ProfileEditor({
  previous,
  onClose,
  onSaved,
}: {
  previous?: Persona;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState({
      name: '',
      description: '',
      instructions: '',
      scope: 'project' as 'personal' | 'project',
      enabled: true,
      ...previous,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog
      title={previous ? 'Edit profile' : 'Create profile'}
      onClose={onClose}
      className="max-h-[90dvh] w-160 max-w-[calc(100vw-24px)] overflow-y-auto"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          void api
            .savePersona(value)
            .then(() => {
              onSaved();
              onClose();
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <Field>
          Name
          <Input
            required
            maxLength={80}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field>
          Description
          <Input
            maxLength={300}
            value={value.description}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </Field>
        <Field>
          Scope
          <Select
            value={value.scope}
            onChange={(e) =>
              setValue({ ...value, scope: e.target.value as 'personal' | 'project' })
            }
          >
            <option value="project">Project</option>
            <option value="personal">Personal</option>
          </Select>
        </Field>
        <Field>
          Instructions
          <textarea
            required
            aria-label="Profile instructions"
            rows={9}
            maxLength={8000}
            className="resize-y rounded-sm border border-border bg-surface-inset p-3 text-label leading-relaxed text-foreground"
            value={value.instructions}
            onChange={(e) => setValue({ ...value, instructions: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-caption text-muted">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
          />
          Enabled
        </label>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
