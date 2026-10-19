import { useState } from 'react';
import type { SkillDetail } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';

const template =
  '---\nname: my-skill\ndescription: Describe what this procedure does and when to use it.\n---\n# My skill\n\nWrite the steps the agent should follow.\n';
export function SkillEditor({
  previous,
  copy,
  onClose,
  onSaved,
}: {
  previous?: SkillDetail;
  copy?: SkillDetail;
  onClose: () => void;
  onSaved: (value: SkillDetail) => void;
}) {
  const [name, setName] = useState(previous?.name ?? copy?.name ?? 'my-skill'),
    [scope, setScope] = useState<'personal' | 'project'>(
      previous?.scope === 'personal' ? 'personal' : 'project',
    );
  const [document, setDocument] = useState(previous?.document ?? copy?.document ?? template),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.saveSkill({ name, scope, document, digest: previous?.digest }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save skill.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={previous ? 'Edit skill' : 'Create skill'}
      onClose={onClose}
      className="max-h-[92dvh] w-190 max-w-[calc(100vw-24px)] overflow-y-auto"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-3 max-compact:grid-cols-1">
          <Field>
            Folder name
            <Input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={64}
              readOnly={Boolean(previous)}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDocument((current) => current.replace(/^name:.*$/m, `name: ${e.target.value}`));
              }}
            />
          </Field>
          <Field>
            Scope
            <Select
              disabled={Boolean(previous)}
              value={scope}
              onChange={(e) => setScope(e.target.value as 'personal' | 'project')}
            >
              <option value="project">Project</option>
              <option value="personal">Personal</option>
            </Select>
          </Field>
        </div>
        <Field>
          SKILL.md
          <textarea
            aria-label="Skill document"
            required
            maxLength={65536}
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            className="h-[min(50dvh,420px)] min-h-40 resize-y rounded-sm border border-border bg-surface-inset p-3 font-mono text-label leading-relaxed text-foreground"
          />
        </Field>
        <p className="text-caption leading-relaxed text-subtle">
          YAML metadata needs a name matching the folder and a description of when to use the skill.
          Add compatibility for required runtimes or tools. Scripts and references stay in the skill
          folder; all command permissions still apply.
        </p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="flex justify-end">
          <Button variant="primary" type="submit" disabled={busy || !document.trim()}>
            {busy ? 'Saving…' : 'Save skill'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function ImportSkillDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (skill: SkillDetail) => void;
}) {
  const [path, setPath] = useState(''),
    [scope, setScope] = useState<'personal' | 'project'>('project'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.importSkill(path, scope));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import skill.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Import local skill" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field>
          Absolute folder path
          <Input
            required
            value={path}
            maxLength={2048}
            onChange={(e) => setPath(e.target.value)}
            placeholder="D:\Skills\my-skill"
          />
        </Field>
        <Field>
          Import into
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'personal' | 'project')}
          >
            <option value="project">Project skills</option>
            <option value="personal">Personal skills</option>
          </Select>
        </Field>
        <p className="text-caption leading-relaxed text-muted">
          Copies SKILL.md and bounded local resources. Existing skills are preserved. Hidden/private
          files and generated dependencies are excluded; symlinks and junctions are rejected. Import
          does not run scripts or install dependencies.
        </p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Button type="submit" variant="primary" disabled={busy || !path.trim()}>
          {busy ? 'Importing…' : 'Import skill'}
        </Button>
      </form>
    </Dialog>
  );
}
