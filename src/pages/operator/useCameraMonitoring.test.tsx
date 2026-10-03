import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCameraIncidents, getCameraMonitoringRuntime } from '../../api/monitoringRuntime';
import { useCameraMonitoring } from './useCameraMonitoring';
vi.mock('../../api/monitoringRuntime', () => ({ getCameraIncidents: vi.fn(), getCameraMonitoringRuntime: vi.fn() }));
const runtime = { cameraId: 'a', state: 'STOPPED', reason: 'NO_ACTIVE_CONFIGURATION', zones: [], errorCode: null, videoSourceType: null, sessionId: null, sourceElapsedMs: null, observedAt: null, isStale: false, annotationContext: null };
const feed = { items: [], hasMore: false, nextCreatedAt: null, nextIncidentId: null };
describe('camera monitoring polling', () => {
  beforeEach(() => { vi.mocked(getCameraMonitoringRuntime).mockResolvedValue(runtime as Awaited<ReturnType<typeof getCameraMonitoringRuntime>>); vi.mocked(getCameraIncidents).mockResolvedValue(feed); });
  afterEach(() => vi.useRealTimers());
  it('waits for both requests before scheduling another cycle and aborts on unmount', async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof feed) => void;
    vi.mocked(getCameraIncidents).mockImplementation(() => new Promise(r => { resolve = r; }));
    const { unmount } = renderHook(() => useCameraMonitoring('a', true, 100));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(getCameraMonitoringRuntime).toHaveBeenCalledTimes(1);
    expect(getCameraIncidents).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(feed); await Promise.resolve(); await vi.advanceTimersByTimeAsync(100); });
    expect(getCameraIncidents).toHaveBeenCalledTimes(2);
    const signal = vi.mocked(getCameraMonitoringRuntime).mock.calls[0][1]!;
    unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(getCameraIncidents).toHaveBeenCalledTimes(2);
  });
  it('retains stale runtime after error without erasing the successful feed', async () => {
    const { result, unmount } = renderHook(() => useCameraMonitoring('a', true, 20));
    await waitFor(() => expect(result.current.runtime?.cameraId).toBe('a'));
    vi.mocked(getCameraMonitoringRuntime).mockRejectedValue(new Error('Runtime unavailable'));
    await waitFor(() => expect(result.current.runtimeError).toBe('Runtime unavailable'));
    expect(result.current.runtime?.cameraId).toBe('a');
    expect(result.current.feed).toEqual(feed);
    expect(result.current.feedError).toBe('');
    unmount();
  });
  it('does not treat a failed feed as genuinely empty', async () => {
    vi.mocked(getCameraIncidents).mockRejectedValue(new Error('Feed unavailable'));
    const { result, unmount } = renderHook(() => useCameraMonitoring('a'));
    await waitFor(() => expect(result.current.feedError).toBe('Feed unavailable'));
    expect(result.current.feed).toBeNull();
    expect(result.current.runtime?.cameraId).toBe('a'); unmount();
  });
  it('ignores a late response from the previous camera', async () => {
    let resolve!: (value: typeof runtime) => void;
    vi.mocked(getCameraMonitoringRuntime).mockImplementation(id => id === 'a' ? new Promise(r => { resolve = r; }) : Promise.resolve({ ...runtime, cameraId: id } as Awaited<ReturnType<typeof getCameraMonitoringRuntime>>));
    const { result, rerender, unmount } = renderHook(({ id }) => useCameraMonitoring(id), { initialProps: { id: 'a' } });
    rerender({ id: 'b' }); await waitFor(() => expect(result.current.runtime?.cameraId).toBe('b'));
    await act(async () => resolve(runtime));
    expect(result.current.runtime?.cameraId).toBe('b'); unmount();
  });
});
