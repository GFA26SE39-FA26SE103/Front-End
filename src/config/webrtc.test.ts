import { afterEach, describe, expect, it, vi } from 'vitest';
import { appTokenEnabledForWebRtc, cameraWhepUrl } from './webrtc';

describe('WebRTC configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('maps an RTSP camera code to its MediaMTX WHEP endpoint', () => {
    vi.stubEnv('VITE_WEBRTC_BASE_URL', 'https://stream.example.test/');
    vi.stubEnv('VITE_WEBRTC_STREAM_PATHS', '{"CAM-01":"entrance"}');

    expect(cameraWhepUrl('camera-id', 'CAM-01', 'RTSP')).toBe('https://stream.example.test/entrance/whep');
  });

  it('prefers the stable camera id and rejects unsupported or unmapped sources', () => {
    vi.stubEnv('VITE_WEBRTC_BASE_URL', 'https://stream.example.test');
    vi.stubEnv('VITE_WEBRTC_STREAM_PATHS', '{"camera-id":"stable-path","CAM-01":"legacy-path"}');

    expect(cameraWhepUrl('camera-id', 'CAM-01', 'RTSP')).toBe('https://stream.example.test/stable-path/whep');
    expect(cameraWhepUrl('camera-id', 'CAM-01', 'FILE')).toBeNull();
    expect(cameraWhepUrl('other-id', 'CAM-02', 'RTSP')).toBeNull();
  });

  it('fails closed for malformed path configuration and enables tokens explicitly', () => {
    vi.stubEnv('VITE_WEBRTC_BASE_URL', 'https://stream.example.test');
    vi.stubEnv('VITE_WEBRTC_STREAM_PATHS', 'not-json');
    vi.stubEnv('VITE_WEBRTC_USE_APP_TOKEN', 'true');

    expect(cameraWhepUrl('camera-id', 'CAM-01', 'RTSP')).toBeNull();
    expect(appTokenEnabledForWebRtc()).toBe(true);
  });
});
