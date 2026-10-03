import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { updateCamera, uploadRecordedVideo, type CreateCameraRequest } from './cameras';

const user = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.test',
  fullName: 'Admin',
  roleId: '00000000-0000-0000-0000-000000000002',
  role: 'ADMIN',
  status: 'ACTIVE',
};

describe('camera API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5080');
    saveSession({ accessToken: 'jwt-token', expiresAt: '2099-01-01T00:00:00Z', user }, true);
  });

  it('patches the full camera request including placement', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ cameraId: 'camera-1' }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const request: CreateCameraRequest = {
      code: 'CAM-01',
      name: 'Front camera',
      manufacturer: 'Acme',
      model: 'Vision',
      serialNumber: 'SN-01',
      installedAt: '2026-10-01T00:00:00Z',
      warrantyExpiresAt: '2027-10-01T00:00:00Z',
      mapX: 0.25,
      mapY: 0.75,
      mapRotationDeg: 315,
      status: 'ACTIVE',
    };

    await updateCamera('camera-1', request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:5080/api/cameras/camera-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('lets a recorded video upload finish beyond the normal API timeout', async () => {
    vi.useFakeTimers();
    try {
      let completeUpload!: (response: Response) => void;
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise<Response>((resolve, reject) => {
        completeUpload = resolve;
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }));
      const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' });
      const result = uploadRecordedVideo('camera-1', file).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(16000);

      const [url, init] = fetchMock.mock.calls[0];
      const body = init?.body as FormData;
      expect(url).toBe('http://localhost:5080/api/cameras/camera-1/recorded-video');
      expect(init?.signal?.aborted).toBe(false);
      expect(body.get('file')).toBe(file);
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
      completeUpload(new Response(JSON.stringify({ cameraId: 'camera-1', sourceType: 'RECORDED', protocol: 'FILE' })));
      await expect(result).resolves.toEqual({ cameraId: 'camera-1', sourceType: 'RECORDED', protocol: 'FILE' });
    } finally {
      vi.useRealTimers();
    }
  });
});
