import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import {
  getAiPreviewFrame,
  getCameraPreview,
  removeCameraMapping,
  saveCameraMapping,
  updateCamera,
  uploadRecordedVideo,
  type CreateCameraRequest,
} from './cameras';

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
      status: 'ACTIVE' as const,
    };

    await updateCamera('camera-1', request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:5080/api/cameras/camera-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('loads a camera preview frame as a blob', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('frame', { headers: { 'Content-Type': 'image/jpeg' } }),
    );

    const frame = await getCameraPreview('camera-1');

    expect(frame).toMatchObject({ size: 5, type: 'image/jpeg' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/cameras/camera-1/preview');
  });

  it('loads only a new tracked frame and handles no-content replies', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000001';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg', 'X-Frame-Sequence': '12', 'X-Session-Id': sessionId } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const first = await getAiPreviewFrame('camera-1', undefined, 11, sessionId);
    const unchanged = await getAiPreviewFrame('camera-1', undefined, 12, sessionId);

    expect(first?.frameSequence).toBe(12);
    expect(first?.sessionId).toBe(sessionId);
    expect(first?.blob.size).toBe(4);
    expect(unchanged).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:5080/api/cameras/camera-1/ai-preview/frame/next?afterSequence=11&afterSessionId=${sessionId}`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('saves and removes a camera-zone ROI mapping', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ cameraZoneId: 'mapping-1' }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const request = {
      roiPolygon: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.7, y: 0.9 }],
      status: 'ACTIVE' as const,
    };

    await saveCameraMapping('camera-1', 'zone-1', request);
    await removeCameraMapping('camera-1', 'zone-1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/cameras/camera-1/zones/zone-1');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:5080/api/cameras/camera-1/zones/zone-1');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
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
