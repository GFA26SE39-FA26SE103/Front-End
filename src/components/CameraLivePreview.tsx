import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getCameraPreview } from '../api/cameras';
import s from './AnnotatedPreview.module.css';

type LiveViewState = 'idle' | 'starting' | 'live' | 'reconnecting' | 'error' | 'unauthorized';

export type CameraLivePreviewProps = {
  cameraId: string;
  enabled: boolean;
  pollInterval?: number;
};

/** Polls the backend's direct camera-frame endpoint. No AI service is involved. */
export function CameraLivePreview({ cameraId, enabled, pollInterval = 750 }: CameraLivePreviewProps) {
  const [viewState, setViewState] = useState<LiveViewState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const staleUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const controller = new AbortController();
    const staleUrls = staleUrlsRef.current;

    const replaceImage = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (imageUrlRef.current) staleUrls.push(imageUrlRef.current);
      while (staleUrls.length > 4) URL.revokeObjectURL(staleUrls.shift()!);
      imageUrlRef.current = next;
      setImageUrl(next);
      setViewState('live');
    };

    const poll = async () => {
      try {
        replaceImage(await getCameraPreview(cameraId, controller.signal));
        failures = 0;
        if (active) timer = window.setTimeout(poll, pollInterval);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setViewState('unauthorized');
          return;
        }
        failures += 1;
        setViewState(failures >= 3 ? 'error' : 'reconnecting');
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

  const visibleState: LiveViewState = !enabled ? 'idle' : viewState === 'idle' ? 'starting' : viewState;
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

function stateLabel(state: LiveViewState): string {
  if (state === 'idle') return 'Live view is stopped';
  if (state === 'starting') return 'Connecting to camera…';
  if (state === 'reconnecting') return 'Camera frame unavailable · reconnecting…';
  if (state === 'unauthorized') return 'Session expired';
  if (state === 'error') return 'Live view is unavailable';
  return '';
}
