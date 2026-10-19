import { useState } from 'react';
import { Download, GitFork, MoreHorizontal, Pencil } from 'lucide-react';
import type { AgentMode, AgentRun, Session } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { cn } from '../../components/ui/cn';
import { api } from '../../lib/api';
import { downloadSession } from './download';
import { HistoryDialog } from './HistoryDialog';

export function SessionActions({
  session,
  runs,
  running = false,
  up = false,
  onSelect,
  onRewound,
}: {
  session: Session;
  runs?: AgentRun[];
  running?: boolean;
  up?: boolean;
  onSelect: (session: Session) => void;
  onRewound?: (mode: AgentMode) => void;
}) {
  const [dialog, setDialog] = useState<'rename' | 'history' | null>(null),
    [title, setTitle] = useState(session.title),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function rename() {
    setBusy(true);
    setError('');
    try {
      await api.renameSession(session.id, title);
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed.');
    } finally {
      setBusy(false);
    }
  }
  async function download(format: 'json' | 'markdown') {
    setError('');
    try {
      await downloadSession(session.id, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    }
  }
  const item =
    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-caption text-muted hover:bg-surface-hover';
  return (
    <div className="relative shrink-0">
      <details className="group">
        <summary
          aria-label={`Actions for ${session.title}`}
          className="grid size-7 list-none place-items-center rounded-sm text-muted hover:bg-surface-hover [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal size={15} />
        </summary>
        <div
          className={cn(
            'absolute right-0 z-(--layer-menu) w-46 rounded-md border border-border-strong bg-surface-overlay p-1 shadow-menu',
            up ? 'bottom-8' : 'top-8',
          )}
          onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
        >
          <button
            className={item}
            onClick={() => {
              setTitle(session.title);
              setDialog('rename');
            }}
          >
            <Pencil size={12} />
            Rename session
          </button>
          <button className={item} disabled={running} onClick={() => setDialog('history')}>
            <GitFork size={12} />
            Fork / rewind
          </button>
          <button className={item} onClick={() => void download('markdown')}>
            <Download size={12} />
            Export Markdown
          </button>
          <button className={item} onClick={() => void download('json')}>
            <Download size={12} />
            Export JSON
          </button>
        </div>
      </details>
      {dialog === 'rename' && (
        <Dialog title="Rename session" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <Field>
              Session title
              <Input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
            <div className="mt-4 flex justify-end">
              <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
                Save title
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === 'history' && (
        <HistoryDialog
          session={session}
          runs={runs}
          running={running}
          onClose={() => setDialog(null)}
          onSelect={onSelect}
          onRewound={onRewound}
        />
      )}
      {error && !dialog && (
        <span
          role="alert"
          className="absolute right-0 bottom-8 z-(--layer-menu) w-60 rounded-sm bg-danger-soft p-2 text-caption text-danger"
        >
          {error}
        </span>
      )}
    </div>
  );
}
