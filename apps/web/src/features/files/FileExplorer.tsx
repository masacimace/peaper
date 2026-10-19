import type { Workspace, WorkspaceEntry } from '@peaper/shared';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { IconButton } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { Panel } from '../../layout/Panel';
import { api } from '../../lib/api';
import { FileIcon } from './FileIcon';

export function FileExplorer({
  workspace,
  selectedPath,
  onOpenFile,
  ...panel
}: {
  workspace: Workspace;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  hidden: boolean;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
  width: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [children, setChildren] = useState<Record<string, WorkspaceEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [truncated, setTruncated] = useState<Set<string>>(() => new Set());
  const load = useCallback(async (path: string) => {
    setLoading((previous) => new Set(previous).add(path));
    try {
      const result = await api.files(path);
      setChildren((previous) => ({ ...previous, [path]: result.entries }));
      setErrors((previous) => ({ ...previous, [path]: '' }));
      setTruncated((previous) => {
        const next = new Set(previous);
        if (result.truncated) next.add(path);
        else next.delete(path);
        return next;
      });
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [path]: error instanceof Error ? error.message : 'Could not open directory',
      }));
    } finally {
      setLoading((previous) => {
        const next = new Set(previous);
        next.delete(path);
        return next;
      });
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => load(''));
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      for (const path of expanded) void load(path);
    };
    window.addEventListener('peaper:workspace-changed', refresh);
    return () => window.removeEventListener('peaper:workspace-changed', refresh);
  }, [expanded, load]);
  function toggle(path: string) {
    const wasOpen = expanded.has(path);
    setExpanded((previous) => {
      const next = new Set(previous);
      if (wasOpen) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!wasOpen && !children[path] && !loading.has(path)) void load(path);
  }
  function directory(path: string, depth: number) {
    return (
      <>
        {loading.has(path) && (
          <p
            className="py-1.5 pr-2 text-caption leading-[1.6] text-subtle"
            style={{ paddingLeft: depth * 14 + 16 }}
          >
            Loading…
          </p>
        )}
        {errors[path] && (
          <div
            className="py-1.5 pr-2 text-caption leading-[1.6] text-danger"
            style={{ paddingLeft: depth * 14 + 16 }}
          >
            {errors[path]}{' '}
            <button className="ml-1 underline" onClick={() => void load(path)}>
              Retry
            </button>
          </div>
        )}
        {children[path]?.map((entry) =>
          entry.kind === 'directory' ? (
            <div key={entry.path}>
              <button
                className="flex min-h-5.75 w-full items-center gap-1.5 pr-2.25 text-left text-tree hover:bg-surface-hover"
                style={{ paddingLeft: depth * 14 + 12 }}
                aria-expanded={expanded.has(entry.path)}
                onClick={() => toggle(entry.path)}
              >
                {expanded.has(entry.path) ? (
                  <ChevronDown size={12} className="text-subtle" />
                ) : (
                  <ChevronRight size={12} className="text-subtle" />
                )}
                {expanded.has(entry.path) ? (
                  <FolderOpen size={14} className="text-subtle" />
                ) : (
                  <Folder size={14} className="text-subtle" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
              {expanded.has(entry.path) && directory(entry.path, depth + 1)}
            </div>
          ) : (
            <button
              key={entry.path}
              className={cn(
                'flex min-h-5.75 w-full items-center gap-1.5 pr-2.25 text-left text-tree hover:bg-surface-hover',
                selectedPath === entry.path && 'bg-surface-selected text-strong',
              )}
              style={{ paddingLeft: depth * 14 + 29 }}
              title={entry.path}
              onClick={() => onOpenFile(entry.path)}
            >
              <FileIcon name={entry.name} />
              <span className="truncate">{entry.name}</span>
            </button>
          ),
        )}
        {children[path]?.length === 0 && !loading.has(path) && (
          <p
            className="py-1.5 pr-2 text-caption leading-[1.6] text-subtle"
            style={{ paddingLeft: depth * 14 + 16 }}
          >
            Empty folder
          </p>
        )}
        {truncated.has(path) && (
          <p className="py-1.5 pr-2 text-micro leading-[1.6] text-subtle">
            Showing the first 400 entries.
          </p>
        )}
      </>
    );
  }
  return (
    <Panel
      title="Files"
      icon={FolderTree}
      className="shrink-0 bg-surface-inset"
      headerClassName="bg-surface-panel"
      hidden={panel.hidden}
      maximized={panel.maximized}
      onMaximize={panel.onMaximize}
      onClose={panel.onClose}
      style={{ width: panel.maximized ? '100%' : panel.width }}
      actions={
        <IconButton
          title="Refresh files"
          aria-label="Refresh files"
          onClick={() => {
            for (const path of expanded) void load(path);
          }}
        >
          <RefreshCw size={13} />
        </IconButton>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto pt-2 pb-3">
        <button
          className="mb-0.75 flex min-h-5.75 w-full items-center gap-1.5 pr-2.25 pl-1.75 text-left text-tree font-medium hover:bg-surface-hover"
          aria-expanded={expanded.has('')}
          onClick={() => toggle('')}
        >
          {expanded.has('') ? (
            <ChevronDown size={12} className="text-subtle" />
          ) : (
            <ChevronRight size={12} className="text-subtle" />
          )}
          <FolderOpen size={14} className="text-subtle" />
          <span className="truncate">{workspace.name}</span>
        </button>
        {expanded.has('') && directory('', 0)}
      </div>
      <div className="border-t border-border-subtle px-2.5 py-1.75 text-tiny tracking-[1px] whitespace-nowrap text-subtle">
        WORKSPACE · READ ONLY
      </div>
    </Panel>
  );
}
