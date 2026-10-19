import { useEffect, useState } from 'react';
import type { AgentRun, RuntimeEvent } from '@peaper/shared';
import { api } from '../../lib/api';

export function useAgent(sessionId?: string) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; runs: AgentRun[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    let again = false;
    const load = async () => {
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      try {
        const { runs } = await api.runs(sessionId);
        if (live) {
          setSnapshot({ sessionId, runs });
          setError('');
        }
      } catch (error) {
        if (live) setError(error instanceof Error ? error.message : 'Could not load task.');
      } finally {
        loading = false;
        if (again && live) {
          again = false;
          void load();
        }
      }
    };
    const event = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeEvent>).detail;
      if (detail.sessionId !== sessionId || detail.type !== 'agent.updated' || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 80);
    };
    void load();
    window.addEventListener('peaper:runtime-event', event);
    // A poll repairs a missed last event after reconnect, without restarting model work.
    const poll = setInterval(() => void load(), 4000);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('peaper:runtime-event', event);
    };
  }, [sessionId]);
  return { runs: snapshot && snapshot.sessionId === sessionId ? snapshot.runs : [], error };
}
