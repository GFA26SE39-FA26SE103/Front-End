import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './client';
import { saveSession } from '../auth/session';

const user = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.test',
  fullName: 'Admin',
  roleId: '00000000-0000-0000-0000-000000000002',
  role: 'ADMIN',
  status: 'ACTIVE',
};

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5080');
    saveSession({ accessToken: 'jwt-token', expiresAt: '2099-01-01T00:00:00Z', user }, true);
  });

  it('uses the API base URL and attaches the bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await apiFetch<{ ok: boolean }>('/api/example');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:5080/api/example');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('handles JSON and Blob responses', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'LIVE' }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), { headers: { 'Content-Type': 'image/jpeg' } }));

    const json = await apiFetch<{ state: string }>('/api/status');
    const blob = await apiFetch<Blob>('/api/frame', { responseType: 'blob' });

    expect(json.state).toBe('LIVE');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('lets the browser set the multipart boundary and keeps bearer authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const body = new FormData();
    body.append('file', new File(['video'], 'sample.mp4'));
    await apiFetch('/api/upload', { method: 'POST', body });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('parses backend ProblemDetails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      title: 'CONNECTION_NOT_READY',
      detail: 'Test the current connection before preview.',
      status: 409,
      code: 'CONNECTION_NOT_READY',
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }));

    const error = await apiFetch('/api/fail').catch((value) => value);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'CONNECTION_NOT_READY' });
  });

  it('clears the session on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch('/api/private')).rejects.toMatchObject({ status: 401 });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('passes the AbortSignal to fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch('/api/example', { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

