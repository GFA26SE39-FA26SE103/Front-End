import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { dismissIncident } from './incidents';

describe('incident actions API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5080');
    saveSession({ accessToken: 'jwt-token', expiresAt: '2099-01-01T00:00:00Z', user: {
      userId: 'operator', email: 'operator@example.test', fullName: 'Operator', roleId: 'role', role: 'OPERATOR', status: 'ACTIVE',
    } }, true);
  });

  it('dismisses an incident with the required reason', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ incidentId: 'incident-1', status: 'DISMISSED' }), {
      headers: { 'Content-Type': 'application/json' },
    }));

    await dismissIncident('incident/1', 'False alarm after operator review');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5080/api/incidents/incident%2F1/dismiss');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ reason: 'False alarm after operator review' });
  });
});
