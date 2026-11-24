import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  getAiPreviewFrame,
  getAiPreviewStatus,
  startAiPreview,
  stopAiPreview,
  type AiPreviewState,
  type AiPreviewStatus,
} from '../api/cameras';
import { PreviewRegions, type PreviewRegion } from './PreviewRegions';
import s from './AnnotatedPreview.module.css';

type ViewState = 'idle' | 'starting' | 'waiting' | 'live' | 'completed' | 'reconnecting' | 'error' | 'unauthorized' | 'unavailable' | 'monitoring-owned';

export type AnnotatedPreviewProps = {
  cameraId: string;
  enabled: boolean;
  pollInterval?: number;
  zoneId?: string;
  regions?: PreviewRegion[];
  restartKey?: number;
  monitoringReplayAvailable?: boolean;
};

export function AnnotatedPreview({ cameraId, enabled, pollInterval = 0, zoneId, regions = [], restartKey = 0, monitoringReplayAvailable = false }: AnnotatedPreviewProps) {
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const staleUrlsRef = useRef<string[]>([]);
  const stopChainRef = useRef<Promise<void>>(Promise.resolve());
  const [purpose, setPurpose] = useState('PREVIEW');
  const [annotationContext, setAnnotationContext] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timer: number | undefined;
    let failures = 0;
    let lastSequence = 0;
    let lastSessionId: string | null = null;
    let currentStatus: AiPreviewStatus | null = null;
    let lastStatusAt = 0;
    const leaseRef: { current: string | null } = { current: null };
    let reattachUsedForLease = false;
    let reattachPromise: Promise<boolean> | null = null;
    const pendingRevoke = staleUrlsRef.current;
    const controller = new AbortController();
    const precedingStop = stopChainRef.current;
    let monitoringAttached = false;
    let startPromise: Promise<AiPreviewStatus | null>;

    const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

    const acquireLease = async (): Promise<AiPreviewStatus | null> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const started = zoneId ? await startAiPreview(cameraId, undefined, zoneId) : await startAiPreview(cameraId);
          leaseRef.current = started.viewerLeaseId!;
          reattachUsedForLease = false;
          if (active) {
            monitoringAttached = started.purpose === 'MONITORING';
            setPurpose(started.purpose ?? 'PREVIEW');
            setAnnotationContext(started.annotationContext ?? null);
          }
          return started;
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'AI_MONITORING_START_PENDING' || attempt === 2 || !active) throw error;
          if (active) setViewState('starting');
          await wait(100);
        }
      }
      return null;
    };

    startPromise = (async () => {
      await precedingStop;
      if (!active) return null;
      return acquireLease();
    })();

    const replaceImage = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (imageUrlRef.current) pendingRevoke.push(imageUrlRef.current);
      while (pendingRevoke.length > 8) URL.revokeObjectURL(pendingRevoke.shift()!);
      imageUrlRef.current = next;
      setImageUrl(next);
      setViewState('live');
    };

    const schedule = (delay = pollInterval) => {
      if (active) timer = window.setTimeout(poll, Math.max(0, delay));
    };

    const reattachExpiredLease = async (): Promise<boolean> => {
      if (reattachPromise) return reattachPromise;
      if (!leaseRef.current || reattachUsedForLease) return false;
      reattachUsedForLease = true;
      leaseRef.current = null;
      currentStatus = null;
      lastStatusAt = 0;
      lastSequence = 0;
      lastSessionId = null;
      if (active) setViewState('starting');
      startPromise = acquireLease();
      reattachPromise = startPromise
        .then((started) => Boolean(started?.viewerLeaseId))
        .finally(() => { reattachPromise = null; });
      return reattachPromise;
    };

    const poll = async () => {
      try {
        const viewerLeaseId = leaseRef.current;
        if (!viewerLeaseId) throw new ApiError(409, 'AI_VIEWER_LEASE_EXPIRED', 'AI viewer lease is missing or expired.');
        if (!currentStatus || Date.now() - lastStatusAt >= 1000) {
          currentStatus = await getAiPreviewStatus(cameraId, viewerLeaseId, controller.signal);
          lastStatusAt = Date.now();
        }
        const current = currentStatus;
        if (!active) return;
        if (current.sessionId && current.sessionId !== lastSessionId) {
          lastSessionId = current.sessionId;
          lastSequence = 0;
        }
        if (current.purpose === 'MONITORING') { monitoringAttached = true; setPurpose('MONITORING'); }
        if (current.annotationContext) setAnnotationContext(current.annotationContext);
        if (current.state === 'STOPPED' && monitoringAttached) {
          setViewState('starting'); lastStatusAt = 0; schedule(100); return;
        }
        setViewState(statusView(current.state));
        if (current.state === 'ERROR' || current.state === 'STOPPED') {
          setErrorCode(current.errorCode);
          if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
          pendingRevoke.splice(0).forEach((url) => URL.revokeObjectURL(url));
          imageUrlRef.current = null;
          setImageUrl(null);
          return;
        }
        if (current.state === 'LIVE' || current.state === 'COMPLETED') {
          try {
            const frame = await getAiPreviewFrame(cameraId, viewerLeaseId, controller.signal, lastSequence, lastSessionId);
            if (!active || controller.signal.aborted) return;
            const freshFrame = frame && (frame.sessionId !== lastSessionId || frame.frameSequence > lastSequence);
            if (freshFrame) {
              lastSequence = frame.frameSequence;
              lastSessionId = frame.sessionId;
              replaceImage(frame.blob);
            }
            if (current.state === 'COMPLETED') {
              setViewState('completed');
              return;
            }
            failures = 0;
            if (!freshFrame) {
              lastStatusAt = 0;
              schedule(100);
              return;
            }
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            if (error instanceof ApiError && error.code === 'AI_VIEWER_LEASE_EXPIRED') {
              if (await reattachExpiredLease()) schedule(0);
              else setViewState('unavailable');
              return;
            } else if (error instanceof ApiError && error.code === 'AI_FRAME_NOT_READY') {
              setViewState('waiting');
              lastStatusAt = 0;
              schedule(100);
              return;
            } else if (error instanceof ApiError && error.code === 'AI_PREVIEW_NOT_RUNNING') {
              setViewState('starting');
              currentStatus = null;
              schedule(100);
              return;
            } else {
              throw error;
            }
          }
        } else {
          lastStatusAt = 0;
          schedule(100);
          return;
        }
        schedule();
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.code === 'AI_VIEWER_LEASE_EXPIRED') {
          if (await reattachExpiredLease()) schedule(0);
          else setViewState('unavailable');
          return;
        }
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
      setErrorCode(null);
      setImageUrl(null);
      try {
        await startPromise;
        if (active) await poll();
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setErrorCode(error instanceof ApiError ? error.code : null);
        setViewState(error instanceof ApiError && error.status === 401 ? 'unauthorized' : error instanceof ApiError && error.code === 'AI_SESSION_MONITORING_OWNED' ? 'monitoring-owned' : 'unavailable');
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
      pendingRevoke.splice(0).forEach((url) => URL.revokeObjectURL(url));
      stopChainRef.current = (async () => {
        let pending = startPromise;
        await pending.catch(() => undefined);
        while (pending !== startPromise) {
          pending = startPromise;
          await pending.catch(() => undefined);
        }
        const viewerLeaseId = leaseRef.current;
        leaseRef.current = null;
        if (!viewerLeaseId) return;
        try {
          await stopAiPreview(cameraId, viewerLeaseId);
        } catch {
          // The server-side lease timeout is the final cleanup guard if auth has expired.
        }
      })();
    };
  }, [cameraId, enabled, pollInterval, zoneId, restartKey]);

  const visibleState = enabled ? viewState : 'idle';
  const replayHint = purpose !== 'MONITORING' ? 'Stop then start to replay'
    : monitoringReplayAvailable ? 'Select Replay with AI' : 'Deactivate → Activate to replay monitoring';
  return (
    <div className={s.preview} aria-live="polite">
      {enabled && imageUrl && (
        <img
          className={s.image}
          src={imageUrl}
          alt="Tracked preview for camera"
          onLoad={(event) => {
            staleUrlsRef.current.splice(0).forEach((url) => URL.revokeObjectURL(url));
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            if (width > 0 && height > 0) setFrameSize((current) => (current?.width === width && current.height === height ? current : { width, height }));
          }}
        />
      )}
      {enabled && imageUrl && frameSize && regions.length > 0 && <PreviewRegions regions={regions} {...frameSize} />}
      {visibleState !== 'live' && visibleState !== 'completed' && <div className={s.state}>{stateLabel(visibleState, errorCode)}</div>}
      {visibleState === 'live' && <span className={s.badge}>YOLO · BYTETRACK · LIVE{annotationContext ? ' · ' + annotationContext : ''}</span>}
      {visibleState === 'completed' && <span className={s.badge}>Video completed · {replayHint}{annotationContext ? ' · ' + annotationContext : ''}</span>}
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

function stateLabel(state: ViewState, errorCode: string | null): string {
  if (state === 'idle') return 'AI preview is stopped';
  if (state === 'starting') return 'Starting YOLO + ByteTrack…';
  if (state === 'waiting') return 'Waiting for first tracked frame…';
  if (state === 'reconnecting') return 'Camera disconnected · reconnecting…';
  if (state === 'unauthorized') return 'Session expired';
  if (state === 'error') {
    if (errorCode === 'AI_RECORDED_VIDEO_INVALID') return 'AI could not open the uploaded recording.';
    if (errorCode === 'AI_RECORDED_VIDEO_DOWNLOAD_FAILED') return 'AI could not download the recording from the backend.';
    return 'AI preview stopped after a camera error';
  }
  if (state === 'unavailable') {
    if (errorCode === 'ZONE_NOT_MAPPED') return 'Save an enabled ROI mapping for this camera and zone, then retry.';
    if (errorCode === 'ROI_INVALID' || errorCode === 'INVALID_POLYGON') return 'Save a valid camera ROI, then retry.';
    if (errorCode === 'AI_PREVIEW_CONFIGURATION_CONFLICT') return 'Close the other preview for this camera, then retry.';
    return 'AI preview is unavailable';
  }
  if (state === 'monitoring-owned') return 'This camera is used by active monitoring in this or another Zone. Deactivate every active configuration using the camera, then retry.';
  return '';
}
