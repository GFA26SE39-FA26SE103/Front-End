import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getCameraPreview } from '../api/cameras';
import s from './AnnotatedPreview.module.css';

export type CameraLiveViewState = 'idle' | 'starting' | 'live' | 'reconnecting' | 'error' | 'unauthorized';

export type CameraLivePreviewProps = {
  cameraId: string;
  enabled: boolean;
  pollInterval?: number;
  onStateChange?: (state: CameraLiveViewState, error?: ApiError) => void;
};

/** Polls the backend's direct camera-frame endpoint. No AI service is involved. */
export function CameraLivePreview({ cameraId, enabled, pollInterval = 750, onStateChange }: CameraLivePreviewProps) {
  const [viewState, setViewState] = useState<CameraLiveViewState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const staleUrlsRef = useRef<string[]>([]);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const controller = new AbortController();
    const staleUrls = staleUrlsRef.current;
    const updateState = (next: CameraLiveViewState, error?: ApiError) => {
      if (!active) return;
      setViewState(next);
      onStateChangeRef.current?.(next, error);
    };

    const replaceImage = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (imageUrlRef.current) staleUrls.push(imageUrlRef.current);
      while (staleUrls.length > 4) URL.revokeObjectURL(staleUrls.shift()!);
      imageUrlRef.current = next;
      setImageUrl(next);
      updateState('live');
    };

    const poll = async () => {
      try {
        replaceImage(await getCameraPreview(cameraId, controller.signal));
        failures = 0;
        if (active) timer = window.setTimeout(poll, pollInterval);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          updateState('unauthorized', error);
          return;
        }
        failures += 1;
        updateState(failures >= 3 ? 'error' : 'reconnecting', error instanceof ApiError ? error : undefined);
        if (failures < 3) timer = window.setTimeout(poll, 1200);
      }
    };

    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
      staleUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cameraId, enabled, pollInterval]);

  const visibleState: CameraLiveViewState = !enabled ? 'idle' : viewState === 'idle' ? 'starting' : viewState;
  return (
    <div className={s.preview} aria-live="polite">
      {enabled && imageUrl && (
        <img
          className={s.image}
          src={imageUrl}
          alt="Live camera preview"
          onLoad={() => staleUrlsRef.current.splice(0).forEach((url) => URL.revokeObjectURL(url))}
        />
      )}
      {visibleState !== 'live' && <div className={s.state}>{stateLabel(visibleState)}</div>}
      {visibleState === 'live' && <span className={s.badge}>DIRECT · LIVE</span>}
    </div>
  );
}

function stateLabel(state: CameraLiveViewState): string {
  if (state === 'idle') return 'Live view is stopped';
  if (state === 'starting') return 'Connecting to camera…';
  if (state === 'reconnecting') return 'Camera frame unavailable · reconnecting…';
  if (state === 'unauthorized') return 'Session expired';
  if (state === 'error') return 'Live view is unavailable';
  return '';
}
