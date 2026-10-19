import { useState } from 'react';
import { Boxes, Download, Plus, RefreshCw } from 'lucide-react';
import type { Skill, SkillDetail } from '@peaper/shared';
import { Page, PageHeader } from '../../components/ui/Page';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { cn } from '../../components/ui/cn';
import { api } from '../../lib/api';
import type { useKnowledge } from '../knowledge/useKnowledge';
import { ProfilesPanel } from './ProfilesPanel';
import { ImportSkillDialog, SkillEditor } from './SkillEditor';
import { SkillDetails } from './SkillDetails';

export function SkillsPage({ controller }: { controller: ReturnType<typeof useKnowledge> }) {
  const [tab, setTab] = useState('skills'),
    [query, setQuery] = useState(''),
    [scope, setScope] = useState('all');
  const [detail, setDetail] = useState<SkillDetail | null>(null),
    [editing, setEditing] = useState<SkillDetail | 'new' | null>(null),
    [copy, setCopy] = useState<SkillDetail | null>(null),
    [importing, setImporting] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const catalog = controller.state?.catalog;
  const filtered =
    catalog?.skills.filter(
      (s) =>
        (scope === 'all' || s.scope === scope) &&
        `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  async function preference(skill: Skill, values: { enabled?: boolean; automatic?: boolean }) {
    setBusy(skill.id);
    setError('');
    try {
      await api.skillPreference(
        skill.id,
        values.enabled ?? skill.enabled,
        values.automatic ?? skill.automatic,
      );
      await controller.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update skill.');
    } finally {
      setBusy('');
    }
  }
  function saved(value: SkillDetail) {
    setDetail(value);
    void controller.refresh().catch(() => {});
  }
  return (
    <Page className="max-w-280">
      <PageHeader
        kicker="WAYS OF WORKING"
        title="Skills"
        description="Reusable procedures and profiles for your coding workspace."
      >
        {tab === 'skills' && (
          <div className="flex flex-wrap justify-end gap-2">
            <IconButton
              aria-label="Refresh skills"
              title="Refresh skills from disk"
              onClick={() => void controller.refresh().catch((e: Error) => setError(e.message))}
            >
              <RefreshCw size={14} />
            </IconButton>
            <Button
              className="max-compact:px-2 max-compact:text-micro"
              onClick={() => setImporting(true)}
            >
              <Download size={13} />
              Import folder
            </Button>
            <Button
              variant="primary"
              className="max-compact:px-2 max-compact:text-micro"
              onClick={() => setEditing('new')}
            >
              <Plus size={13} />
              Create skill
            </Button>
          </div>
        )}
      </PageHeader>
      <div
        className="mb-6 flex gap-6 border-b border-border"
        role="tablist"
        aria-label="Skill management"
      >
        {['skills', 'profiles'].map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'relative pb-3 text-label text-muted capitalize',
              tab === item &&
                'text-strong after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent',
            )}
          >
            {item}
          </button>
        ))}
      </div>
      {(error || controller.error) && (
        <ErrorNotice className="mb-4">
          {error || controller.error}
          <Button variant="text" onClick={() => void controller.refresh().catch(() => {})}>
            Retry
          </Button>
        </ErrorNotice>
      )}
      {tab === 'profiles' ? (
        <ProfilesPanel controller={controller} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              aria-label="Search skills"
              type="search"
              placeholder="Search skills…"
              className="min-w-36 flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              aria-label="Skill scope"
              className="w-40"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">All sources</option>
              <option value="project">Project</option>
              <option value="personal">Personal</option>
              <option value="builtin">Built in</option>
            </Select>
          </div>
          <p className="mb-4 text-caption leading-relaxed text-subtle">
            Manual invocation: /skill project:name or /name in chat. Bare names resolve project →
            personal → built in among enabled skills. Automatic invocation uses metadata first and
            loads instructions when needed. Preferences apply to this workspace.
          </p>
          {catalog?.errors.map((message) => (
            <p className="mb-2 text-caption wrap-anywhere text-warning" key={message}>
              {message}
            </p>
          ))}
          {!catalog && !controller.error && (
            <p className="py-8 text-label text-muted">Loading skills…</p>
          )}
          {catalog && !filtered.length && (
            <EmptyState
              variant="page"
              icon={Boxes}
              title="No matching skills"
              description="Adjust the filters, create a procedure, or import a local skill folder."
            />
          )}
          <div className="divide-y divide-border-subtle border-t border-border-subtle">
            {filtered.map((skill) => (
              <article
                className="flex gap-5 py-4 max-compact:flex-col max-compact:gap-3"
                key={skill.id}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setError('');
                    void api
                      .skill(skill.id)
                      .then(setDetail)
                      .catch((e: Error) => setError(e.message));
                  }}
                >
                  <span className="text-micro text-subtle">
                    {skill.scope} · {skill.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <h2 className="mt-1 text-label font-medium text-strong">{skill.name}</h2>
                  <p className="mt-2 text-caption leading-relaxed text-muted">
                    {skill.description}
                  </p>
                  {skill.compatibility && (
                    <p className="mt-2 text-micro leading-relaxed text-subtle">
                      Requires: {skill.compatibility}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-start gap-4 pt-1 text-caption text-muted">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Enable ${skill.id}`}
                      checked={skill.enabled}
                      disabled={busy === skill.id}
                      onChange={(e) => void preference(skill, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Automatic ${skill.id}`}
                      checked={skill.automatic}
                      disabled={busy === skill.id || !skill.enabled}
                      onChange={(e) => void preference(skill, { automatic: e.target.checked })}
                    />
                    Automatic
                  </label>
                </div>
              </article>
            ))}
          </div>
          {catalog && (
            <details className="mt-6 text-caption text-subtle">
              <summary>Discovery locations</summary>
              <p className="mt-2 wrap-anywhere">Personal: {catalog.roots.personal}</p>
              <p className="mt-2 wrap-anywhere">Project: {catalog.roots.project}</p>
              <p className="mt-2">
                Built-in procedures ship with Peaper. Personal storage follows the active data
                profile.
              </p>
            </details>
          )}
        </>
      )}
      {detail && (
        <SkillDetails
          skill={detail}
          onClose={() => setDetail(null)}
          onEdit={(value) => {
            setEditing(value);
            setDetail(null);
          }}
          onCopy={(value) => {
            setCopy(value);
            setDetail(null);
          }}
        />
      )}
      {(editing || copy) && (
        <SkillEditor
          previous={editing && editing !== 'new' ? editing : undefined}
          copy={copy ?? undefined}
          onClose={() => {
            setEditing(null);
            setCopy(null);
          }}
          onSaved={saved}
        />
      )}
      {importing && <ImportSkillDialog onClose={() => setImporting(false)} onSaved={saved} />}
    </Page>
  );
}
