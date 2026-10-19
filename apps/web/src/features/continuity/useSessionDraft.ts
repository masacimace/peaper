import { useEffect, useRef, useState } from 'react';
import type { AgentMode } from '@peaper/shared';
import { api } from '../../lib/api';

type Draft = { draft: string; mode: AgentMode; updatedAt: string };
type Entries = Record<string, Draft>;
function read(key: string): Entries {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, Draft] => {
          const v = entry[1] as Partial<Draft> | null;
          return Boolean(
            v &&
            typeof v.draft === 'string' &&
            v.draft.length <= 16000 &&
            ['build', 'plan'].includes(v.mode ?? '') &&
            typeof v.updatedAt === 'string',
          );
        }),
      );
  } catch {
    /* Browser persistence is optional. */
  }
  return {};
}
export function useSessionDraft(workspaceId: string, sessionId?: string) {
  const storageKey = `peaper:drafts:${workspaceId}`,
    key = sessionId || 'workspace';
  const [entries, setEntries] = useState<Entries>(() => read(storageKey));
  const values = useRef(entries),
    pending = useRef(new Map<string, Draft>()),
    timers = useRef(new Map<string, ReturnType<typeof setTimeout>>()),
    chains = useRef(new Map<string, Promise<unknown>>());
  const [loaded, setLoaded] = useState<string | null>(null),
    [error, setError] = useState('');
  function persist(next: Entries) {
    values.current = next;
    setEntries(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Backend autosave remains available. */
    }
  }
  const save = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    save.current = (id) => {
      const record = pending.current.get(id);
      pending.current.delete(id);
      if (!record || id === 'workspace') return;
      const chain = (chains.current.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => api.saveDraft(id, record.draft, record.mode));
      chains.current.set(id, chain);
      void chain
        .then(() => setError(''))
        .catch(() =>
          setError(
            'Draft is saved in this browser; runtime autosave failed. Keep this tab open and retry.',
          ),
        );
    };
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    const sessionTimers = timers.current;
    const atStart = values.current[key]?.updatedAt;
    void api
      .sessionDraft(sessionId)
      .then((state) => {
        if (!live) return;
        const local = values.current[key];
        if (
          local?.updatedAt === atStart &&
          (!local || (state.draftUpdatedAt ?? '') > local.updatedAt)
        ) {
          const next = {
            ...values.current,
            [key]: {
              draft: state.draft,
              mode: state.mode,
              updatedAt: state.draftUpdatedAt ?? new Date(0).toISOString(),
            },
          };
          values.current = next;
          setEntries(next);
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            /* Optional browser cache. */
          }
        }
        setLoaded(key);
        setError('');
      })
      .catch(() => {
        if (live) {
          setLoaded(key);
          setError('Runtime draft could not be loaded. Your browser draft is retained.');
        }
      });
    return () => {
      live = false;
      clearTimeout(sessionTimers.get(key));
      save.current(key);
    };
  }, [sessionId, key, storageKey]);
  useEffect(() => {
    const pendingTimers = timers.current;
    const flush = () => {
      for (const id of pending.current.keys()) {
        clearTimeout(pendingTimers.get(id));
        save.current(id);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  function update(draft: string, mode: AgentMode = values.current[key]?.mode ?? 'build') {
    const record = { draft, mode, updatedAt: new Date().toISOString() };
    persist({ ...values.current, [key]: record });
    if (sessionId) {
      pending.current.set(key, record);
      clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        setTimeout(() => save.current(key), 500),
      );
    }
  }
  const current = entries[key];
  return {
    draft: current?.draft ?? '',
    mode: current?.mode ?? ('build' as AgentMode),
    loaded: !sessionId || Boolean(current) || loaded === key,
    error,
    setDraft: (text: string) => update(text),
    setMode: (mode: AgentMode) => update(values.current[key]?.draft ?? '', mode),
    clearIfUnchanged: (text: string) => {
      if (values.current[key]?.draft === text) update('');
    },
  };
}
