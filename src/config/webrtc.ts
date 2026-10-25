export function appTokenEnabledForWebRtc(): boolean {
  return import.meta.env.VITE_WEBRTC_USE_APP_TOKEN?.toLowerCase() === 'true';
}
