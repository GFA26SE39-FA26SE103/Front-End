import { useEffect, useState } from 'react';
import { getCameraIncidents, getCameraMonitoringRuntime, type CameraMonitoringRuntime, type IncidentFeed } from '../../api/monitoringRuntime';

export type CameraMonitoringState = { runtime: CameraMonitoringRuntime | null; feed: IncidentFeed | null; runtimeError: string; feedError: string; loading: boolean };
const empty = (): CameraMonitoringState => ({ runtime: null, feed: null, runtimeError: '', feedError: '', loading: true });
export function useCameraMonitoring(cameraId: string, enabled = true, pollInterval = 1000): CameraMonitoringState {
  const [state, setState] = useState<CameraMonitoringState & { cameraId: string }>({ ...empty(), cameraId });
  useEffect(() => {
    if (!enabled || !cameraId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const message = (e: unknown) => e instanceof Error ? e.message : 'Monitoring request failed.';
    const poll = async () => {
      const [runtime, feed] = await Promise.allSettled([
        getCameraMonitoringRuntime(cameraId, controller.signal),
        getCameraIncidents(cameraId, { limit: 20 }, controller.signal),
      ]);
      if (!active || controller.signal.aborted) return;
      setState(previous => ({ cameraId, loading: false,
        runtime: runtime.status === 'fulfilled' ? runtime.value : previous.cameraId === cameraId ? previous.runtime : null,
        runtimeError: runtime.status === 'fulfilled' ? '' : message(runtime.reason),
        feed: feed.status === 'fulfilled' ? feed.value : previous.cameraId === cameraId ? previous.feed : null,
        feedError: feed.status === 'fulfilled' ? '' : message(feed.reason),
      }));
      timer = setTimeout(() => void poll(), Math.max(20, pollInterval));
    };
    void poll();
    return () => { active = false; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [cameraId, enabled, pollInterval]);
  return enabled && state.cameraId === cameraId ? state : empty();
}
