import { useEffect, useState } from 'react';

export function useTaskPolling<T>(load: (signal: AbortSignal) => Promise<T>, paused = false) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ load: typeof load; data?: T; error: string; checkedAt?: Date }>({ load, error: '' });
  useEffect(() => {
    if (paused) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    async function poll() {
      if (disposed || document.visibilityState === 'hidden') return;
      controller = new AbortController();
      const request = controller;
      try {
        const data = await load(request.signal);
        if (disposed || request.signal.aborted) return;
        failures = 0;
        setState({ load, data, error: '', checkedAt: new Date() });
      } catch (reason) {
        if (disposed || request.signal.aborted) return;
        failures++;
        const error = reason instanceof Error ? reason.message : 'Could not load tasks. Try again.';
        setState(previous => ({ ...(previous.load === load ? previous : { load }), error }));
      } finally {
        if (!disposed && !request.signal.aborted) timer = setTimeout(() => void poll(), Math.min(4000 * 2 ** failures, 30000));
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      controller?.abort();
      if (document.visibilityState !== 'hidden') void poll();
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [load, paused, attempt]);
  const value = state.load === load ? state : { data: undefined, error: '', checkedAt: undefined };
  return { ...value, refresh: () => setAttempt(n => n + 1) };
}
