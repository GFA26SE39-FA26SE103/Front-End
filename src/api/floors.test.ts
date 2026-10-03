import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { createFloor, createZone, getFloorMap, updateFloorDetails, uploadFloorMap } from './floors';

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

  it('creates floors without a map and edits metadata without submitting a stale map URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ floorId: 'floor-1' }), { headers: { 'Content-Type': 'application/json' } }));
    await createFloor('store-1', { floorNumber: 1, name: 'Ground floor' });
    await updateFloorDetails('floor-1', { floorNumber: 0, name: 'Lobby' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/supermarkets/store-1/floors');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ floorNumber: 1, name: 'Ground floor', mapAssetUrl: null, mapWidth: null, mapHeight: null });
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:5080/api/floors/floor-1/details');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ floorNumber: 0, name: 'Lobby' });
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('allows a slow cloud upload while map downloads still respect explicit cancellation', async () => {
    vi.useFakeTimers();
    try {
      let finishUpload: (response: Response) => void = () => {};
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((resolve, reject) => {
        finishUpload = resolve;
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const uploaded = uploadFloorMap('floor-1', new File(['png'], 'floor.png', { type: 'image/png' })).catch(error => error);
      await vi.advanceTimersByTimeAsync(31000);
      finishUpload(new Response(JSON.stringify({ floorId: 'floor-1' }), { headers: { 'Content-Type': 'application/json' } }));
      expect(await uploaded).toMatchObject({ floorId: 'floor-1' });
      const controller = new AbortController();
      const cancelled = getFloorMap('floor-1', controller.signal).catch(error => error);
      controller.abort();
      expect(await cancelled).toMatchObject({ name: 'AbortError' });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('downloads the authenticated map as a Blob', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('map', { headers: { 'Content-Type': 'application/pdf' } }),
    );

    const result = await getFloorMap('floor-1');

    expect(result.type).toBe('application/pdf');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/floors/floor-1/map');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('creates a zone with normalized polygon, color, and optional area', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ zoneId: 'zone-1' }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    const request = {
      code: 'PRODUCE',
      name: 'Produce',
      zoneType: null,
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
      colorHex: '#22C55E',
      areaM2: 125.5,
      status: 'ACTIVE',
    };

    await createZone('floor-1', request);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/floors/floor-1/zones');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
  });
});
