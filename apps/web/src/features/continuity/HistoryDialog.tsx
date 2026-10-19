import { useEffect, useState } from 'react';
import type { AgentMode, AgentRun, RewindPreview, Session } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { ChangeView } from '../agent/RunView';
import { api } from '../../lib/api';

export function HistoryDialog({
  session,
  runs: provided,
  running,
  onClose,
  onSelect,
  onRewound,
}: {
  session: Session;
  runs?: AgentRun[];
  running: boolean;
  onClose: () => void;
  onSelect: (session: Session) => void;
  onRewound?: (mode: AgentMode) => void;
}) {
  const [runs, setRuns] = useState(provided ?? []),
    [point, setPoint] = useState<string | undefined>(provided?.at(-1)?.id),
    [title, setTitle] = useState(`${session.title} · fork`.slice(0, 120)),
    [preview, setPreview] = useState<RewindPreview | null>(null),
    [paths, setPaths] = useState<string[]>([]),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (provided) return;
    let live = true;
    void api
      .runs(session.id)
      .then(({ runs }) => {
        if (live) {
          setRuns(runs);
          setPoint(runs.at(-1)?.id);
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session.id, provided]);
  const after = point ?? null;
  async function action(kind: 'fork' | 'preview' | 'rewind' | 'restore') {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      if (kind === 'fork') {
        const child = await api.forkSession(session.id, after, title);
        onSelect(child);
        onClose();
      } else if (kind === 'preview') {
        setPreview(await api.rewindPreview(session.id, after));
        setPaths([]);
      } else if (preview) {
        if (kind === 'restore') {
          const result = await api.restoreFiles(session.id, after, preview.revision, paths);
          window.dispatchEvent(new Event('peaper:workspace-changed'));
          setNotice(`Restored ${result.restored} files. Conversation is unchanged.`);
          setPreview(await api.rewindPreview(session.id, after));
          setPaths([]);
          return;
        }
        await api.rewind(session.id, after, preview.revision, []);
        window.dispatchEvent(new Event('peaper:workspace-changed'));
        onRewound?.(runs.find((run) => run.id === after)?.mode ?? 'build');
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed.');
      if (kind === 'rewind' || kind === 'restore') setPreview(null);
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog
      title="Conversation history"
      onClose={onClose}
      className="max-h-[88dvh] w-160 max-w-[calc(100vw-24px)] overflow-y-auto"
    >
      <Field>
        Continue after
        <Select
          aria-label="History point"
          value={point ?? ''}
          onChange={(e) => {
            setPoint(e.target.value || undefined);
            setPreview(null);
            setPaths([]);
          }}
        >
          <option value="">Start of session</option>
          {runs.map((run, index) => (
            <option key={run.id} value={run.id}>
              {index + 1}. {run.mode} · {run.prompt.slice(0, 65)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-label font-medium">Fork conversation</h3>
        <p className="my-2 text-caption leading-relaxed text-muted">
          Copies conversation context through this point into a new session. Both sessions share the
          current workspace; files and commands are not copied or replayed.
        </p>
        <Input
          aria-label="Fork session title"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          className="mt-3"
          disabled={running || Boolean(busy) || !title.trim()}
          onClick={() => void action('fork')}
        >
          {busy === 'fork' ? 'Creating…' : 'Create fork'}
        </Button>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-label font-medium">Rewind conversation</h3>
        <p className="my-2 text-caption leading-relaxed text-muted">
          Restore selected files first if needed, then rewind the conversation separately. Later
          turns remain in session exports. Saved memory, profiles, commands, databases and remote
          effects remain unchanged.
        </p>
        <Button disabled={running || Boolean(busy)} onClick={() => void action('preview')}>
          {busy === 'preview' ? 'Checking files…' : 'Preview rewind'}
        </Button>
      </div>
      {preview && (
        <div className="mt-4">
          <p className="text-caption text-muted">
            {preview.turnCount} later turns · {preview.files.length} checkpoint files
          </p>
          {preview.files.map((file) => (
            <div className="mt-3 rounded-sm border border-border p-3" key={file.path}>
              <label className="flex items-center gap-2 text-caption">
                <input
                  type="checkbox"
                  className="accent-accent"
                  aria-label={`Restore ${file.path}`}
                  disabled={Boolean(file.conflict) || Boolean(busy)}
                  checked={paths.includes(file.path)}
                  onChange={(e) =>
                    setPaths((current) =>
                      e.target.checked
                        ? [...current, file.path]
                        : current.filter((path) => path !== file.path),
                    )
                  }
                />
                <span className="min-w-0 flex-1 wrap-anywhere">
                  {file.after === null ? 'Remove Peaper-created file' : 'Restore previous contents'}{' '}
                  · {file.path}
                </span>
              </label>
              {file.conflict ? (
                <p className="mt-2 text-caption leading-relaxed text-danger">{file.conflict}</p>
              ) : (
                <ChangeView
                  change={{
                    id: file.path,
                    path: file.path,
                    before: file.before,
                    after: file.after ?? '',
                  }}
                />
              )}
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={running || Boolean(busy) || !paths.length}
              onClick={() => void action('restore')}
            >
              {busy === 'restore' ? 'Restoring…' : `Restore ${paths.length || 'selected'} files`}
            </Button>
            <Button
              variant="primary"
              disabled={running || Boolean(busy) || !preview.turnCount}
              onClick={() => void action('rewind')}
            >
              {busy === 'rewind' ? 'Rewinding…' : 'Rewind conversation only'}
            </Button>
          </div>
        </div>
      )}
      {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
      {notice && (
        <p role="status" className="mt-3 text-caption text-success">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
