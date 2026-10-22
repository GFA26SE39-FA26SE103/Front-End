const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const stripOuterSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

function streamPaths(): Record<string, string> {
  const raw = import.meta.env.VITE_WEBRTC_STREAM_PATHS?.trim();
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

/**
 * Resolves the MediaMTX WHEP endpoint without exposing the camera's RTSP URL.
 * A camera UUID is preferred; the camera code key is convenient during a POC.
 */
export function cameraWhepUrl(cameraId: string, cameraCode: string, protocol?: string): string | null {
  if (protocol !== 'RTSP') return null;
  const baseUrl = import.meta.env.VITE_WEBRTC_BASE_URL?.trim();
  if (!baseUrl) return null;

  const paths = streamPaths();
  const path = stripOuterSlashes(paths[cameraId]?.trim() || paths[cameraCode]?.trim() || '');
  if (!path) return null;
  return `${stripTrailingSlash(baseUrl)}/${path}/whep`;
}

export function appTokenEnabledForWebRtc(): boolean {
  return import.meta.env.VITE_WEBRTC_USE_APP_TOKEN?.toLowerCase() === 'true';
}
