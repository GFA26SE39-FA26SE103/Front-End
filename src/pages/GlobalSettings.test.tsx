import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import GlobalSettings from './GlobalSettings';

const settings = { pushEnabled: false, taskOfferPushEnabled: true, taskUpdatePushEnabled: true, shiftSwapPushEnabled: true, pushConfigured: true, updatedAt: '2026-10-28T08:00:00Z' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('Global notification settings', () => {
  beforeEach(() => {
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@test', fullName: 'Admin', roleId: 'r-admin', role: 'ADMIN', status: 'ACTIVE' } }, false);
  });

  it('loads effective values, keeps categories while master is off, and saves a typed policy', async () => {
    const calls: { method: string; body?: Record<string, unknown> }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined });
      return json(method === 'PUT' ? { ...settings, pushEnabled: true, taskUpdatePushEnabled: false, updatedAt: '2026-10-28T08:05:00Z' } : settings);
    });
    render(<MemoryRouter><GlobalSettings /></MemoryRouter>);

    expect(await screen.findByRole('switch', { name: 'Enable FCM push notifications' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Task offers' })).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Enable FCM push notifications' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Task updates' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ method: 'PUT', body: { pushEnabled: true, taskOfferPushEnabled: true, taskUpdatePushEnabled: false, shiftSwapPushEnabled: true, expectedUpdatedAt: settings.updatedAt } });
    expect(await screen.findByRole('status')).toHaveTextContent('Notification settings saved');
  });

  it('explains why push controls are unavailable when FCM is not configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...settings, pushConfigured: false }));
    render(<MemoryRouter><GlobalSettings /></MemoryRouter>);

    expect(await screen.findByText(/FCM is not configured on the server/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable FCM push notifications' })).toBeDisabled();
    expect(screen.getByText(/in-app records and web inboxes remain enabled/i)).toBeInTheDocument();
  });
});
