import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { getNotificationSettings, listNotifications, markAllNotificationsRead, updateNotificationSettings } from './notifications';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('notification APIs', () => {
  beforeEach(() => {
    saveSession({ accessToken: 'token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'u-1', email: 'u@test', fullName: 'User', roleId: 'r-1', role: 'ADMIN', status: 'ACTIVE' } }, false);
  });

  it('uses the admin settings contract and preserves the concurrency token', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ pushEnabled: false, taskOfferPushEnabled: true, taskUpdatePushEnabled: true, shiftSwapPushEnabled: true, pushConfigured: false, updatedAt: null }));
    await getNotificationSettings();
    await updateNotificationSettings({ pushEnabled: true, taskOfferPushEnabled: true, taskUpdatePushEnabled: false, shiftSwapPushEnabled: true, expectedUpdatedAt: '2026-10-28T08:00:00Z' });

    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe('/api/admin/settings/notifications');
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ pushEnabled: true, taskOfferPushEnabled: true, taskUpdatePushEnabled: false, shiftSwapPushEnabled: true, expectedUpdatedAt: '2026-10-28T08:00:00Z' }) });
  });

  it('uses the recipient-scoped inbox without a client-supplied user id', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json([])).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await listNotifications();
    await markAllNotificationsRead();

    expect(fetch.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual(['/api/me/notifications', '/api/me/notifications/read-all']);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });
});
