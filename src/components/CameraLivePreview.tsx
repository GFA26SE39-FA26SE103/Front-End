import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getCameraPreview } from '../api/cameras';
import { loadSession } from '../auth/session';
import { appTokenEnabledForWebRtc } from '../config/webrtc';
import s from './AnnotatedPreview.module.css';

export type CameraLiveViewState = 'idle' | 'starting' | 'live' | 'reconnecting' | 'error' | 'unauthorized';

export type CameraLivePreviewProps = {
  cameraId: string;
  enabled: boolean;
  whepUrl?: string | null;
  pollInterval?: number;
  onStateChange?: (state: CameraLiveViewState, error?: ApiError) => void;
};

/** Uses WebRTC for configured RTSP cameras and preserves JPEG polling as a fallback. */
export function CameraLivePreview(props: CameraLivePreviewProps) {
  return props.whepUrl
    ? <WebRtcLivePreview {...props} whepUrl={props.whepUrl} />
    : <PolledLivePreview {...props} />;
}

function WebRtcLivePreview({ enabled, whepUrl, onStateChange }: CameraLivePreviewProps & { whepUrl: string }) {
  const [viewState, setViewState] = useState<CameraLiveViewState>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let sessionUrl: string | null = null;
    const controller = new AbortController();
    const peer = new RTCPeerConnection();
    const video = videoRef.current;
    const updateState = (next: CameraLiveViewState, error?: ApiError) => {
      if (!active) return;
      setViewState(next);
      onStateChangeRef.current?.(next, error);
    };

    updateState('starting');
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.ontrack = (event) => {
      if (!active || !video) return;
      video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void video.play().catch(() => undefined);
      updateState('live');
    };
    peer.onconnectionstatechange = () => {
      if (!active) return;
      if (peer.connectionState === 'failed') {
        updateState('error', new ApiError(503, 'WEBRTC_CONNECTION_FAILED', 'The WebRTC media connection failed.'));
      } else if (peer.connectionState === 'disconnected') {
        updateState('reconnecting');
      }
    };

    const connect = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await waitForIceGathering(peer, controller.signal);
        if (!peer.localDescription?.sdp) throw new Error('The browser did not create a WebRTC offer.');

        const headers = new Headers({ 'Content-Type': 'application/sdp' });
        if (appTokenEnabledForWebRtc()) {
          const token = loadSession()?.accessToken;
          if (token) headers.set('Authorization', `Bearer ${token}`);
        }
        const response = await fetch(whepUrl, {
          method: 'POST',
          headers,
          body: peer.localDescription.sdp,
          signal: controller.signal,
        });
        if (!response.ok) {
          const unauthorized = response.status === 401 || response.status === 403;
          throw new ApiError(
            response.status,
            unauthorized ? 'WEBRTC_UNAUTHORIZED' : 'WEBRTC_SESSION_FAILED',
            unauthorized ? 'The stream session is not authorized.' : 'The stream server could not create a WebRTC session.',
          );
        }
        const location = response.headers.get('Location');
        if (location) sessionUrl = new URL(location, response.url || whepUrl).toString();
        await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          updateState('unauthorized', error);
        } else {
          updateState('error', error instanceof ApiError
            ? error
            : new ApiError(503, 'WEBRTC_UNAVAILABLE', error instanceof Error ? error.message : 'The WebRTC stream is unavailable.'));
        }
      }
    };

    void connect();
    return () => {
      active = false;
      controller.abort();
      peer.close();
      if (video) video.srcObject = null;
      if (sessionUrl) {
        const headers = new Headers();
        if (appTokenEnabledForWebRtc()) {
          const token = loadSession()?.accessToken;
          if (token) headers.set('Authorization', `Bearer ${token}`);
        }
        void fetch(sessionUrl, { method: 'DELETE', headers, keepalive: true }).catch(() => undefined);
      }
    };
  }, [enabled, whepUrl]);

  const visibleState: CameraLiveViewState = !enabled ? 'idle' : viewState === 'idle' ? 'starting' : viewState;
  return (
    <div className={s.preview} aria-live="polite">
      {enabled && <video ref={videoRef} className={s.image} aria-label="Live camera preview" autoPlay muted playsInline />}
      {visibleState !== 'live' && <div className={s.state}>{stateLabel(visibleState)}</div>}
      {visibleState === 'live' && <span className={s.badge}>WEBRTC · LIVE</span>}
    </div>
  );
}

function PolledLivePreview({ cameraId, enabled, pollInterval = 750, onStateChange }: CameraLivePreviewProps) {
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

function waitForIceGathering(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(done, 5000);
    function done() {
      cleanup();
      resolve();
    }
    function aborted() {
      cleanup();
      reject(new DOMException('WebRTC setup was cancelled.', 'AbortError'));
    }
    function changed() {
      if (peer.iceGatheringState === 'complete') done();
    }
    function cleanup() {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', aborted);
      peer.removeEventListener('icegatheringstatechange', changed);
    }
    signal.addEventListener('abort', aborted, { once: true });
    peer.addEventListener('icegatheringstatechange', changed);
  });
}

function stateLabel(state: CameraLiveViewState): string {
  if (state === 'idle') return 'Live view is stopped';
  if (state === 'starting') return 'Connecting to camera…';
  if (state === 'reconnecting') return 'Camera stream interrupted · reconnecting…';
  if (state === 'unauthorized') return 'Stream access expired';
  if (state === 'error') return 'Live view is unavailable';
  return '';
}
