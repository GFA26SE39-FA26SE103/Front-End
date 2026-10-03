import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  getAiPreviewFrame,
  getAiPreviewStatus,
  startAiPreview,
  stopAiPreview,
  type AiPreviewState,
} from '../api/cameras';
import s from './AnnotatedPreview.module.css';

type ViewState = 'idle' | 'starting' | 'waiting' | 'live' | 'completed' | 'reconnecting' | 'error' | 'unauthorized' | 'unavailable';

export type AnnotatedPreviewProps = {
  cameraId: string;
  enabled: boolean;
  pollInterval?: number;
  zoneId?: string;
};

export function AnnotatedPreview({ cameraId, enabled, pollInterval = 250, zoneId }: AnnotatedPreviewProps) {
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const stopChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const controller = new AbortController();
    const precedingStop = stopChainRef.current;
    const startPromise = (async () => {
      await precedingStop;
      if (!active) return;
      if (zoneId) await startAiPreview(cameraId, undefined, zoneId);
      else await startAiPreview(cameraId);
    })();

    const replaceImage = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = next;
      setImageUrl(next);
      setViewState('live');
    };

    const schedule = () => {
      if (active) timer = window.setTimeout(poll, pollInterval);
    };

    const poll = async () => {
      try {
        const current = await getAiPreviewStatus(cameraId, controller.signal);
        if (!active) return;
        setViewState(statusView(current.state));
        if (current.state === 'ERROR' || current.state === 'STOPPED') {
          if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
          imageUrlRef.current = null;
          setImageUrl(null);
          return;
        }
        if (current.state === 'LIVE' || current.state === 'COMPLETED') {
          try {
            const blob = await getAiPreviewFrame(cameraId, controller.signal);
            if (!active || controller.signal.aborted) return;
            replaceImage(blob);
            if (current.state === 'COMPLETED') {
              setViewState('completed');
              return;
            }
            failures = 0;
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            if (error instanceof ApiError && error.code === 'AI_FRAME_NOT_READY') {
              setViewState('waiting');
            } else {
              throw error;
            }
          }
        }
        schedule();
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setViewState('unauthorized');
          return;
        }
        failures += 1;
        if (failures >= 3) {
          setViewState('unavailable');
          return;
        }
        setViewState('reconnecting');
        schedule();
      }
    };

    const boot = async () => {
      setViewState('starting');
      setImageUrl(null);
      try {
        await startPromise;
        if (active) await poll();
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setViewState(error instanceof ApiError && error.status === 401 ? 'unauthorized' : 'unavailable');
      }
    };

    void boot();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
      stopChainRef.current = startPromise
        .catch(() => undefined)
        .then(async () => {
          try {
            await stopAiPreview(cameraId);
          } catch {
            // The server-side idle lease is the final cleanup guard if auth has expired.
          }
        });
    };
  }, [cameraId, enabled, pollInterval, zoneId]);

  const visibleState = enabled ? viewState : 'idle';
  return (
    <div className={s.preview} aria-live="polite">
      {enabled && imageUrl && <img className={s.image} src={imageUrl} alt="Tracked preview for camera" />}
      {visibleState !== 'live' && visibleState !== 'completed' && <div className={s.state}>{stateLabel(visibleState)}</div>}
      {visibleState === 'live' && <span className={s.badge}>YOLO · BYTETRACK · LIVE</span>}
      {visibleState === 'completed' && <span className={s.badge}>Video completed · Stop then start to replay</span>}
    </div>
  );
}

function statusView(state: AiPreviewState): ViewState {
  if (state === 'LIVE') return 'live';
  if (state === 'COMPLETED') return 'completed';
  if (state === 'RECONNECTING') return 'reconnecting';
  if (state === 'ERROR') return 'error';
  if (state === 'STOPPED') return 'idle';
  return 'starting';
}

function stateLabel(state: ViewState): string {
  if (state === 'idle') return 'AI preview is stopped';
  if (state === 'starting') return 'Starting YOLO + ByteTrack…';
  if (state === 'waiting') return 'Waiting for first tracked frame…';
  if (state === 'reconnecting') return 'Camera disconnected · reconnecting…';
  if (state === 'unauthorized') return 'Session expired';
  if (state === 'error') return 'AI preview stopped after a camera error';
  if (state === 'unavailable') return 'AI preview is unavailable';
  return '';
}
