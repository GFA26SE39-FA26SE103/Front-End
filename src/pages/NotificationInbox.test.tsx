import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { ManagerNotifications, OperatorNotifications } from './NotificationInbox';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const notifications = [{ notificationId: 'n-1', type: 'TASK_NEEDS_ASSIGNMENT', title: 'Task needs assignment', message: 'Checkout queue requires an assignee.', severity: 'WARNING', taskId: 'task-1', eventId: 'event-1', createdAt: '2026-10-28T08:00:00Z', readAt: null }];

describe('role notification inboxes', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(notifications));
  });

  it('shows the Operator recipient feed, marks it read, and opens current task state', async () => {
    saveSession({ accessToken: 'operator-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'op', email: 'op@test', fullName: 'Operator', roleId: 'r-op', role: 'OPERATOR', status: 'ACTIVE' } }, false);
    render(<MemoryRouter initialEntries={['/operator/notifications']}><Routes><Route path="/operator/notifications" element={<OperatorNotifications />} /><Route path="/operator/tasks/:taskId" element={<p>Task detail destination</p>} /></Routes></MemoryRouter>);

    expect(await screen.findByText('Task needs assignment')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('link', { name: /Task needs assignment/ }));
    expect(await screen.findByText('Task detail destination')).toBeInTheDocument();
  });

  it('routes Manager swap notifications to the current swap queue', async () => {
    saveSession({ accessToken: 'manager-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'mgr', email: 'mgr@test', fullName: 'Manager', roleId: 'r-mgr', role: 'MANAGER', status: 'ACTIVE' } }, false);
    vi.mocked(globalThis.fetch).mockResolvedValue(json([{ ...notifications[0], type: 'SWAP_PENDING_APPROVAL', title: 'Swap pending approval', taskId: null }]));
    render(<MemoryRouter initialEntries={['/manager/notifications']}><Routes><Route path="/manager/notifications" element={<ManagerNotifications />} /><Route path="/manager/swaps" element={<p>Swap queue destination</p>} /></Routes></MemoryRouter>);

    await userEvent.click(await screen.findByRole('link', { name: /Swap pending approval/ }));
    expect(await screen.findByText('Swap queue destination')).toBeInTheDocument();
  });
});
