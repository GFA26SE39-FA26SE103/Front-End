import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTaskPolling } from './useTaskPolling';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('task polling lifecycle', () => {
  it('never overlaps a pending request and aborts it on unmount', async () => {
    vi.useFakeTimers();
    const load = vi.fn((_signal: AbortSignal) => new Promise<string>(() => {}));
    const hook = renderHook(() => useTaskPolling(load));
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(load).toHaveBeenCalledTimes(1);
    const signal = load.mock.calls[0][0];
    hook.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('pauses in a hidden tab and refreshes on resume', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const load = vi.fn(async (_signal: AbortSignal) => 'saved');
    const hook = renderHook(() => useTaskPolling(load));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.data).toBe('saved');
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(load).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
  it('preserves the last result with an error instead of fabricating replacement data', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async (_signal: AbortSignal) => 'saved');
    const hook = renderHook(() => useTaskPolling(load));
    await act(async () => { await Promise.resolve(); });
    load.mockRejectedValue(new Error('Backend unavailable'));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(hook.result.current.data).toBe('saved');
    expect(hook.result.current.error).toBe('Backend unavailable');
    hook.unmount();
  });
});
