import { useEffect, useRef, useState } from 'react';
import { problem } from './dates';

/**
 * Loads data for [key] and aborts the previous load when the key changes. While the key's
 * result is not in yet, `data` is null, so a page shows its loading state without resetting state in the effect.
 */
export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string } | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    const controller = new AbortController();
    loader.current(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data, error: '' }); },
      (reason: unknown) => { if (!controller.signal.aborted) setResult({ key, data: null, error: problem(reason) }); },
    );
    return () => controller.abort();
  }, [key]);
  const current = result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? '' };
}
