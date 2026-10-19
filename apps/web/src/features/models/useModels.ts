import { useCallback, useEffect, useRef, useState } from 'react';
import {
  validEffort,
  type ModelSelection,
  type ModelState,
  type RuntimeEvent,
} from '@peaper/shared';
import { api } from '../../lib/api';

const empty: ModelState = {
  connections: [],
  models: [],
  defaults: { modelId: null, effort: 'default' },
};
export function useModels(sessionId?: string | null) {
  const [state, setState] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [choice, setChoice] = useState<{ sessionId: string | null; value: ModelSelection | null }>({
    sessionId: null,
    value: null,
  });
  const current = useRef(sessionId ?? null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const next = await api.models();
    setState(next);
    setLoaded(true);
    setError('');
    return next;
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => {
      void api
        .models()
        .then((value) => {
          if (active) {
            setState(value);
            setLoaded(true);
            setError('');
          }
        })
        .catch((error: Error) => {
          if (active) setError(error.message);
        });
    };
    load();
    const event = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeEvent>).detail;
      if (detail.type === 'models.updated' || detail.type === 'provider.updated') load();
    };
    window.addEventListener('peaper:runtime-event', event);
    return () => {
      active = false;
      window.removeEventListener('peaper:runtime-event', event);
    };
  }, []);
  useEffect(() => {
    current.current = sessionId ?? null;
    if (!sessionId) return;
    let active = true;
    const load = () => {
      const version = ++generation.current;
      void api
        .sessionModel(sessionId)
        .then((result) => {
          if (active && version === generation.current) {
            setChoice({ sessionId, value: result.selection });
            setSelectionError('');
          }
        })
        .catch((error: Error) => {
          if (active && version === generation.current) {
            setChoice({ sessionId, value: null });
            setSelectionError(error.message);
          }
        });
    };
    load();
    const event = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeEvent>).detail;
      if (detail.type === 'models.updated' && detail.sessionId === sessionId) load();
    };
    window.addEventListener('peaper:runtime-event', event);
    return () => {
      active = false;
      window.removeEventListener('peaper:runtime-event', event);
    };
  }, [sessionId]);
  async function select(selection: ModelSelection) {
    const target = sessionId ?? null;
    ++generation.current;
    if (target) await api.selectModel(target, selection);
    if (current.current === target) {
      setChoice({ sessionId: target, value: selection });
      setSelectionError('');
    }
  }
  const savedSelection =
    choice.sessionId === (sessionId ?? null) && choice.value
      ? choice.value
      : state.defaults.modelId
        ? { modelId: state.defaults.modelId, effort: state.defaults.effort }
        : null;
  const model = state.models.find((item) => item.id === savedSelection?.modelId);
  const selection =
    savedSelection && model
      ? { ...savedSelection, effort: validEffort(model, savedSelection.effort) }
      : savedSelection;
  const connection = state.connections.find((item) => item.id === model?.connectionId);
  const selectionLoading = Boolean(sessionId && choice.sessionId !== sessionId);
  return {
    state,
    setState,
    loaded,
    error,
    refresh,
    select,
    selection,
    selectionLoading,
    selectionError,
    model,
    connection,
  };
}
