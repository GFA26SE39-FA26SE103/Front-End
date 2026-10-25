import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  getAiPreviewFrame,
  getAiPreviewStatus,
  startAiPreview,
  stopAiPreview,
  type AiPreviewState,
  type AiPreviewStatus,
  type MapPoint,
} from '../api/cameras';
import s from './AnnotatedPreview.module.css';

type ViewState = 'idle' | 'starting' | 'waiting' | 'live' | 'completed' | 'reconnecting' | 'error' | 'unauthorized' | 'unavailable' | 'monitoring-owned';

/** A zone ROI drawn over the frame; points are normalized to the camera image (0..1). */
export type PreviewRegion = {
  id: string;
  label: string;
  color: string;
  points: MapPoint[];
};

export type AnnotatedPreviewProps = {
  cameraId: string;
  enabled: boolean;
  pollInterval?: number;
  zoneId?: string;
  regions?: PreviewRegion[];
};

export function AnnotatedPreview({ cameraId, enabled, pollInterval = 0, zoneId, regions = [] }: AnnotatedPreviewProps) {
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const staleUrlsRef = useRef<string[]>([]);
  const stopChainRef = useRef<Promise<void>>(Promise.resolve());
  const [purpose, setPurpose] = useState('PREVIEW');
  const [annotationContext, setAnnotationContext] = useState<string | null>(null);

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
      setImageUrl(null);
      try {
        await startPromise;
        if (active) await poll();
      } catch (error) {
        if (!active || controller.signal.aborted) return;
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
  }, [cameraId, enabled, pollInterval, zoneId]);

  const visibleState = enabled ? viewState : 'idle';
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
      {enabled && imageUrl && frameSize && regions.length > 0 && <RegionLayer regions={regions} {...frameSize} />}
      {visibleState !== 'live' && visibleState !== 'completed' && <div className={s.state}>{stateLabel(visibleState)}</div>}
      {visibleState === 'live' && <span className={s.badge}>YOLO · BYTETRACK · LIVE{annotationContext ? ' · ' + annotationContext : ''}</span>}
      {visibleState === 'completed' && <span className={s.badge}>Video completed · {purpose === 'MONITORING' ? 'Deactivate → Activate to replay monitoring' : 'Stop then start to replay'}{annotationContext ? ' · ' + annotationContext : ''}</span>}
    </div>
  );
}

// The viewBox matches the frame's pixel size and uses "meet", so the overlay lines up with the
// letterboxed image (object-fit: contain) at any panel size.
function RegionLayer({ regions, width, height }: { regions: PreviewRegion[]; width: number; height: number }) {
  const fontSize = Math.max(12, Math.round(width * 0.016));
  return (
    <svg className={s.regions} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" data-testid="roi-overlay" aria-hidden="true">
      {regions.map((region) => {
        const anchor = region.points.reduce((top, point) => (point.y < top.y || (point.y === top.y && point.x < top.x) ? point : top));
        return (
          <g key={region.id}>
            <polygon
              className={s.region}
              points={region.points.map(({ x, y }) => `${x * width},${y * height}`).join(' ')}
              fill={region.color}
              stroke={region.color}
            />
            <text
              className={s.regionLabel}
              x={anchor.x * width + fontSize * 0.4}
              y={anchor.y * height + fontSize * 1.3}
              fontSize={fontSize}
              strokeWidth={fontSize * 0.3}
            >
              {region.label}
            </text>
          </g>
        );
      })}
    </svg>
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
  if (state === 'monitoring-owned') return 'Deactivate monitoring before testing Draft confidence. Active monitoring has not been interrupted.';
  return '';
}
