import { afterEach, describe, expect, it, vi } from 'vitest';
import { appTokenEnabledForWebRtc } from './webrtc';

describe('WebRTC configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('enables application-token forwarding only when explicitly configured', () => {
    vi.stubEnv('VITE_WEBRTC_USE_APP_TOKEN', 'true');

    expect(appTokenEnabledForWebRtc()).toBe(true);
  });
});
