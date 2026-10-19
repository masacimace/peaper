import { useEffect, useState, useSyncExternalStore } from 'react';
import { defaultLayout, readLayout } from './layout';

function subscribe(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}
export function useViewportWidth() {
  return useSyncExternalStore(subscribe, () => window.innerWidth);
}

export function useWorkspaceLayout(workspaceId: string) {
  const key = `peaper:layout:${workspaceId}`;
  const [layout, setLayout] = useState(() => {
    try {
      return readLayout(localStorage.getItem(key));
    } catch {
      return structuredClone(defaultLayout);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      /* Preferences can remain in memory when browser storage is unavailable. */
    }
  }, [key, layout]);
  return { layout, setLayout, reset: () => setLayout(structuredClone(defaultLayout)) };
}
