import { useCallback, useEffect, useRef, useState } from 'react';
import {
  contextSelectionSchema,
  type ContextSelection,
  type KnowledgeState,
  type RuntimeEvent,
} from '@peaper/shared';
import { api } from '../../lib/api';

function cached(key: string): Record<string, ContextSelection> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).flatMap(([id, value]) => {
        const parsed = contextSelectionSchema.safeParse(value);
        return parsed.success ? [[id, parsed.data]] : [];
      }),
    );
  } catch {
    return {};
  }
}
export function useKnowledge(workspaceId: string, sessionId?: string) {
  const key = sessionId ?? 'workspace',
    storage = `peaper:context:${workspaceId}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: KnowledgeState } | null>(null);
  const [choices, setChoices] = useState(() => cached(storage));
  const [error, setError] = useState('');
  const sequence = useRef(0),
    saving = useRef(Promise.resolve());
  const pending = useRef(new Map<string, ContextSelection>());
  const refresh = useCallback(async () => {
    const request = ++sequence.current,
      state = await api.knowledge(sessionId);
    if (request === sequence.current) {
      setSnapshot({ key, state });
      setError('');
      if (sessionId && !pending.current.has(key))
        setChoices((old) => ({ ...old, [key]: state.selection }));
    }
    return state;
  }, [sessionId, key]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void refresh().catch((e: Error) => {
        if (live) setError(e.message);
      });
    };
    load();
    const listener = (event: Event) => {
      if ((event as CustomEvent<RuntimeEvent>).detail.type === 'knowledge.updated' && !timer)
        timer = setTimeout(() => {
          timer = undefined;
          load();
        }, 120);
    };
    window.addEventListener('peaper:runtime-event', listener);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener('peaper:runtime-event', listener);
    };
  }, [refresh]);
  const selection =
    choices[key] ??
    (snapshot?.key === key ? snapshot.state.selection : { profileId: 'default', skillIds: [] });
  async function select(value: ContextSelection) {
    sequence.current++;
    setChoices((previous) => {
      const next = { ...previous, [key]: value };
      try {
        localStorage.setItem(storage, JSON.stringify(next));
      } catch {
        /* Runtime keeps session preferences. */
      }
      return next;
    });
    if (!sessionId) return;
    pending.current.set(key, value);
    const operation = saving.current
      .catch(() => {})
      .then(async () => {
        await api.selectContext(sessionId, value);
      });
    saving.current = operation;
    try {
      await operation;
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save context selection.');
    } finally {
      if (pending.current.get(key) === value) pending.current.delete(key);
    }
  }
  return {
    state: snapshot?.state ?? null,
    selection,
    select,
    refresh,
    error,
    loaded: snapshot?.key === key,
  };
}
