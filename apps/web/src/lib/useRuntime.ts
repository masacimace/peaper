import { useCallback, useEffect, useState } from 'react';
import type { Health, Session, Workspace } from '@peaper/shared';
import { api, subscribeEvents } from './api';

export type RuntimeSnapshot = { health: Health; workspace: Workspace; sessions: Session[] };
export function useRuntime() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([api.health(), api.workspace(), api.sessions()])
      .then(([health, workspace, sessions]) => {
        if (live) {
          setSnapshot({ health, workspace, sessions });
          setError('');
        }
      })
      .catch((error: Error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [reload]);
  const refreshSessions = useCallback(async () => {
    const sessions = await api.sessions();
    setSnapshot((previous) => (previous ? { ...previous, sessions } : previous));
  }, []);
  const workspaceId = snapshot?.workspace.id;
  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    void subscribeEvents(
      workspaceId,
      abort.signal,
      (event) => {
        window.dispatchEvent(new CustomEvent('peaper:runtime-event', { detail: event }));
        if (!refreshTimer)
          refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void refreshSessions().catch(() => undefined);
          }, 500);
      },
      setConnected,
    );
    return () => {
      abort.abort();
      clearTimeout(refreshTimer);
    };
  }, [workspaceId, refreshSessions]);
  return {
    snapshot,
    error,
    connected,
    setError,
    retry: () => setReload((value) => value + 1),
    refreshSessions,
  };
}
