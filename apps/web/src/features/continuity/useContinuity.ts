import { useCallback, useEffect, useState } from 'react';
import type { ContextInfo, ModelSelection, RuntimeEvent } from '@peaper/shared';
import { api } from '../../lib/api';

export function useContinuity(
  sessionId?: string,
  selection?: ModelSelection | null,
  path?: string | null,
) {
  const [snapshot, setSnapshot] = useState<{ id: string; info: ContextInfo } | null>(null);
  const [error, setError] = useState('');
  const modelId = selection?.modelId,
    effort = selection?.effort;
  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const info = await api.context(sessionId, modelId && effort ? { modelId, effort } : null, path);
    setSnapshot({ id: sessionId, info });
    setError('');
    return info;
  }, [sessionId, modelId, effort, path]);
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      if (!sessionId) return;
      void api
        .context(sessionId, modelId && effort ? { modelId, effort } : null, path)
        .then((info) => {
          if (live) {
            setSnapshot({ id: sessionId, info });
            setError('');
          }
        })
        .catch((e: Error) => {
          if (live) setError(e.message);
        });
    };
    load();
    const event = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeEvent>).detail;
      if (
        detail.sessionId === sessionId &&
        ['agent.updated', 'session.updated', 'models.updated'].includes(detail.type) &&
        !timer
      )
        timer = setTimeout(() => {
          timer = undefined;
          load();
        }, 350);
    };
    window.addEventListener('peaper:runtime-event', event);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener('peaper:runtime-event', event);
    };
  }, [sessionId, modelId, effort, path]);
  return { info: snapshot && snapshot.id === sessionId ? snapshot.info : null, error, refresh };
}
