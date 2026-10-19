import { useEffect, useState } from 'react';
import type { SkillDetail, SkillInspection } from '@peaper/shared';
import { Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { cn } from '../../components/ui/cn';
import { api } from '../../lib/api';
import { SkillFiles } from './SkillFiles';

export function SkillDetails({
  skill,
  onClose,
  onEdit,
  onCopy,
}: {
  skill: SkillDetail;
  onClose: () => void;
  onEdit: (skill: SkillDetail) => void;
  onCopy: (skill: SkillDetail) => void;
}) {
  const [tab, setTab] = useState('overview'),
    [inspection, setInspection] = useState<SkillInspection | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [file, setFile] = useState('SKILL.md');
  useEffect(() => {
    let live = true;
    void api
      .skillInspection(skill.id)
      .then((value) => {
        if (live) setInspection(value);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [skill.id, revision]);
  const current = inspection?.skill ?? skill;
  const issues = inspection
    ? inspection.references.filter((r) => r.status !== 'found').length +
      inspection.runtimes.filter((r) => r.status !== 'available').length
    : 0;
  function showFile(path: string) {
    setFile(path);
    setTab('files');
  }
  return (
    <Dialog
      title={`Skill Inspector · ${current.name}`}
      onClose={onClose}
      className="max-h-[90dvh] w-230 max-w-[calc(100vw-24px)] overflow-y-auto max-compact:p-4"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-micro text-muted">
        <span className="rounded-sm border border-border px-2 py-1">{current.scope}</span>
        <span>
          {current.enabled ? 'Enabled' : 'Disabled'} ·{' '}
          {current.automatic ? 'Automatic available' : 'Manual only'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            aria-label="Refresh skill inspection"
            disabled={!inspection && !error}
            onClick={() => {
              setInspection(null);
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            <RefreshCw size={14} />
          </IconButton>
          <Button
            onClick={() => (current.scope === 'builtin' ? onCopy(current) : onEdit(current))}
            className="text-caption"
          >
            {current.scope === 'builtin' ? 'Copy to project' : 'Edit SKILL.md'}
          </Button>
        </div>
      </div>
      <p className="mb-4 text-label leading-relaxed text-muted">{current.description}</p>
      <div
        role="tablist"
        aria-label="Skill inspector"
        className="mb-5 flex gap-5 border-b border-border"
      >
        {['overview', 'instructions', 'files'].map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              'border-b-2 border-transparent pb-2 text-caption text-muted capitalize',
              tab === item && 'border-accent text-strong',
            )}
          >
            {item}
            {item === 'files' ? ` · ${current.resources.length + 1}` : ''}
          </button>
        ))}
      </div>
      {error && <ErrorNotice className="mb-4">{error}</ErrorNotice>}
      {tab === 'overview' && (
        <div className="space-y-5 text-caption text-muted">
          <section>
            <h3 className="mb-2 text-label font-medium text-strong">Use this skill</h3>
            <div className="rounded-sm border border-border bg-surface-inset p-3 font-mono wrap-anywhere">
              /skill {current.id}
            </div>
            <p className="mt-2">
              Or select it in the chat composer. /{current.name} uses the highest-priority enabled
              project, personal, or built-in origin.
            </p>
          </section>
          <section>
            <h3 className="mb-2 text-label font-medium text-strong">Source</h3>
            <p className="wrap-anywhere">{current.path}</p>
            <p className="mt-2 font-mono text-micro wrap-anywhere text-subtle">
              SHA-256 · {current.digest}
            </p>
          </section>
          <section className="border-t border-border pt-4">
            {current.resources.some((r) =>
              /(?:^|\/)(?:examples?|samples?)(?:\/|[.-])/i.test(r.path),
            ) && (
              <div className="mb-5">
                <h3 className="mb-2 text-label font-medium text-strong">Usage examples</h3>
                {current.resources
                  .filter((r) => /(?:^|\/)(?:examples?|samples?)(?:\/|[.-])/i.test(r.path))
                  .slice(0, 12)
                  .map((r) => (
                    <button
                      type="button"
                      key={r.path}
                      onClick={() => showFile(r.path)}
                      className="block py-1 text-left wrap-anywhere text-accent"
                    >
                      {r.path}
                    </button>
                  ))}
                <p className="mt-1 text-micro text-subtle">
                  Example resources can be opened in Files. See Instructions for inline examples.
                </p>
              </div>
            )}
            <h3 className="mb-2 flex items-center gap-2 text-label font-medium text-strong">
              {inspection &&
                (issues ? (
                  <TriangleAlert size={14} className="text-warning" />
                ) : (
                  <Check size={14} className="text-success" />
                ))}
              {inspection
                ? issues
                  ? `${issues} ${issues === 1 ? 'check needs' : 'checks need'} attention`
                  : 'Inspection complete'
                : 'Inspecting files and runtimes…'}
            </h3>
            <p className="leading-relaxed">
              Checks cover local paths declared in SKILL.md and interpreter availability. No scripts
              run; package dependencies and runtime versions are not verified.
            </p>
            {inspection && (
              <p className="mt-2 text-micro text-subtle">
                Checked {new Date(inspection.inspectedAt).toLocaleString()}
              </p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-label font-medium text-strong">Requirements</h3>
            <p className="leading-relaxed">
              {current.compatibility || 'No additional requirements declared.'}
            </p>
            {inspection?.runtimes.map((runtime) => (
              <div key={runtime.name} className="mt-3 border-l border-border pl-3">
                <p className={runtime.status === 'available' ? 'text-success' : 'text-warning'}>
                  {runtime.name} ·{' '}
                  {runtime.status === 'available'
                    ? 'Available'
                    : runtime.status === 'unsupported'
                      ? 'Unsupported by this script runner on this platform'
                      : 'Not found on PATH'}
                </p>
                <p className="mt-1 text-micro wrap-anywhere text-subtle">
                  {runtime.files.join(', ')}
                </p>
              </div>
            ))}
            {inspection && !inspection.runtimes.length && (
              <p className="mt-2 text-subtle">No supported script runtime requirements detected.</p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-label font-medium text-strong">
              File references · {inspection?.references.length ?? '…'}
            </h3>
            {inspection?.references.map((reference) => (
              <div
                key={reference.path}
                className="flex items-start justify-between gap-3 border-b border-border-subtle py-2"
              >
                <button
                  type="button"
                  className="min-w-0 text-left wrap-anywhere text-accent disabled:text-muted"
                  disabled={
                    reference.status !== 'found' ||
                    !['SKILL.md', ...current.resources.map((r) => r.path)].includes(
                      reference.path.replace(/^\.\//, ''),
                    )
                  }
                  onClick={() => showFile(reference.path.replace(/^\.\//, ''))}
                >
                  {reference.path}
                </button>
                <span
                  className={cn(
                    'shrink-0 text-micro',
                    reference.status === 'found' ? 'text-success' : 'text-warning',
                  )}
                >
                  {reference.status === 'outside'
                    ? 'Outside skill'
                    : reference.status === 'missing'
                      ? 'Missing'
                      : 'Found'}
                </span>
              </div>
            ))}
            {inspection && !inspection.references.length && (
              <p className="text-subtle">No local file references detected in SKILL.md.</p>
            )}
            {inspection?.referencesTruncated && (
              <p className="mt-2 text-warning">Showing the first 128 file references.</p>
            )}
          </section>
        </div>
      )}
      {tab === 'instructions' && (
        <pre
          aria-label="Skill instructions"
          className="max-h-110 overflow-auto rounded-sm border border-border bg-surface-inset p-3 font-mono text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap"
        >
          {current.instructions}
        </pre>
      )}
      {tab === 'files' && (
        <SkillFiles key={`${current.digest}:${file}`} skill={current} initialPath={file} />
      )}
    </Dialog>
  );
}
