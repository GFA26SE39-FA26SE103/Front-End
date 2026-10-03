import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { updateCamera, type CreateCameraRequest } from './cameras';

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
});
