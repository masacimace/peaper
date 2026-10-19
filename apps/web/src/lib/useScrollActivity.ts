import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep scrollbar geometry stable while its thumb fades after scrolling stops. */
export function useScrollActivity() {
  const [scrolling, setScrolling] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrollActivity = useCallback(() => {
    setScrolling(true);
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      timeout.current = null;
      setScrolling(false);
    }, 2000);
  }, []);
  useEffect(() => {
    // Fast Refresh can replay effects while preserving an active scrolling state.
    if (timeout.current !== null) {
      timeout.current = setTimeout(() => {
        timeout.current = null;
        setScrolling(false);
      }, 2000);
    }
    return () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    };
  }, []);
  return { scrolling, onScrollActivity };
}
