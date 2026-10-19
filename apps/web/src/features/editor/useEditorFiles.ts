import { useEffect, useState } from 'react';
import type { WorkspaceFile } from '@peaper/shared';
import { api } from '../../lib/api';

export function useEditorFiles(workspaceId: string) {
  const key = `peaper:editor:${workspaceId}`;
  const [tabs, setTabs] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value)
        ? value
            .filter((path): path is string => typeof path === 'string' && path.length < 2048)
            .slice(0, 12)
        : [];
    } catch {
      return [];
    }
  });
  const [activePath, setActivePath] = useState<string | null>(() => tabs[0] || null);
  const [file, setFile] = useState<WorkspaceFile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    try {
      const ordered = activePath
        ? [activePath, ...tabs.filter((path) => path !== activePath)]
        : tabs;
      localStorage.setItem(key, JSON.stringify(ordered));
    } catch {
      /* Browsing files does not require persistent browser storage. */
    }
  }, [key, tabs, activePath]);
  useEffect(() => {
    if (!activePath) return;
    let live = true;
    void Promise.resolve().then(async () => {
      if (!live) return;
      setLoading(true);
      setError('');
      try {
        const next = await api.file(activePath);
        if (live) setFile(next);
      } catch (error) {
        if (live) setError(error instanceof Error ? error.message : 'Could not read file');
      } finally {
        if (live) setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [activePath, revision]);
  function openFile(path: string) {
    setTabs((previous) => (previous.includes(path) ? previous : [...previous.slice(-11), path]));
    setActivePath(path);
  }
  function closeFile(path: string) {
    const next = tabs.filter((item) => item !== path);
    setTabs(next);
    if (activePath === path) setActivePath(next.at(-1) || null);
  }
  return {
    tabs,
    activePath,
    setActivePath,
    openFile,
    closeFile,
    file: file?.path === activePath ? file : null,
    error,
    loading,
    refresh: () => setRevision((value) => value + 1),
  };
}
