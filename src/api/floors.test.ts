import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { getFloorMap, uploadFloorMap } from './floors';

const user = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.test',
  fullName: 'Admin',
  roleId: '00000000-0000-0000-0000-000000000002',
  role: 'ADMIN',
  status: 'ACTIVE',
};

describe('floor API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5080');
    saveSession({ accessToken: 'jwt-token', expiresAt: '2099-01-01T00:00:00Z', user }, true);
  });

  it('uploads the file as multipart without overriding the browser boundary', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      floorId: 'floor-1',
      mapUrl: 'http://localhost:5080/api/floors/floor-1/map?v=one.png',
      mapWidth: 1,
      mapHeight: 1,
      contentType: 'image/png',
      updatedAt: '2026-10-03T00:00:00Z',
    }), { headers: { 'Content-Type': 'application/json' } }));
    const file = new File(['png'], 'floor.png', { type: 'image/png' });

    await uploadFloorMap('floor-1', file);

    const [url, init] = fetchMock.mock.calls[0];
    const body = init?.body as FormData;
    expect(url).toBe('http://localhost:5080/api/floors/floor-1/map');
    expect(init?.method).toBe('POST');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('downloads the authenticated map as a Blob', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['map'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } }),
    );

    const result = await getFloorMap('floor-1');

    expect(result.type).toBe('application/pdf');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/floors/floor-1/map');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });
});
