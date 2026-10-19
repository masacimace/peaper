import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw, FolderTree } from 'lucide-react';
import type { Workspace, WorkspaceEntry } from '@peaper/shared';
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
          <p className="tree-notice" style={{ paddingLeft: depth * 14 + 16 }}>
            Loading…
          </p>
        )}
        {errors[path] && (
          <div className="tree-notice error-text" style={{ paddingLeft: depth * 14 + 16 }}>
            {errors[path]} <button onClick={() => void load(path)}>Retry</button>
          </div>
        )}
        {children[path]?.map((entry) =>
          entry.kind === 'directory' ? (
            <div key={entry.path}>
              <button
                className="tree-row directory-row"
                style={{ paddingLeft: depth * 14 + 12 }}
                aria-expanded={expanded.has(entry.path)}
                onClick={() => toggle(entry.path)}
              >
                {expanded.has(entry.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {expanded.has(entry.path) ? <FolderOpen size={14} /> : <Folder size={14} />}
                <span>{entry.name}</span>
              </button>
              {expanded.has(entry.path) && directory(entry.path, depth + 1)}
            </div>
          ) : (
            <button
              key={entry.path}
              className={`tree-row file-row ${selectedPath === entry.path ? 'selected' : ''}`}
              style={{ paddingLeft: depth * 14 + 29 }}
              title={entry.path}
              onClick={() => onOpenFile(entry.path)}
            >
              <FileIcon name={entry.name} />
              <span>{entry.name}</span>
            </button>
          ),
        )}
        {children[path]?.length === 0 && !loading.has(path) && (
          <p className="tree-notice" style={{ paddingLeft: depth * 14 + 16 }}>
            Empty folder
          </p>
        )}
        {truncated.has(path) && <p className="tree-notice">Showing the first 400 entries.</p>}
      </>
    );
  }
  return (
    <Panel
      title="Files"
      icon={FolderTree}
      className="file-explorer"
      hidden={panel.hidden}
      maximized={panel.maximized}
      onMaximize={panel.onMaximize}
      onClose={panel.onClose}
      style={{ width: panel.maximized ? '100%' : panel.width }}
      actions={
        <button
          className="icon-button"
          title="Refresh files"
          aria-label="Refresh files"
          onClick={() => {
            for (const path of expanded) void load(path);
          }}
        >
          <RefreshCw size={13} />
        </button>
      }
    >
      <div className="file-tree">
        <button className="tree-root" aria-expanded={expanded.has('')} onClick={() => toggle('')}>
          {expanded.has('') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <FolderOpen size={14} />
          <span>{workspace.name}</span>
        </button>
        {expanded.has('') && directory('', 0)}
      </div>
      <div className="explorer-footer">WORKSPACE · READ ONLY</div>
    </Panel>
  );
}
