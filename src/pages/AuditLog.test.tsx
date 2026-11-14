import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuditLogFacets, listAuditLogs, type AuditLogEntry } from '../api/auditLogs';
import { saveSession } from '../auth/session';
import AuditLog from './AuditLog';

vi.mock('../api/auditLogs', () => ({ listAuditLogs: vi.fn(), getAuditLogFacets: vi.fn() }));

const dismissed: AuditLogEntry = {
  auditLogId: 'a1', createdAt: '2026-11-12T03:15:00Z', userId: 'u1', userName: 'Huy', userEmail: 'huy@test', userRole: 'OPERATOR',
  action: 'DISMISS_INCIDENT', entityType: 'Incident', entityId: 'b6f0c9a2-0000-0000-0000-000000000000', reason: 'Duplicate report', resultStatus: 'SUCCESS',
  ipAddress: null, oldValuesJson: '{"status":"IN_PROGRESS","closedAt":null}', newValuesJson: '{"status":"DISMISSED","closedAt":"2026-11-12T03:15:00Z"}',
};
const setting: AuditLogEntry = { ...dismissed, auditLogId: 'a2', userName: 'Admin', userRole: 'ADMIN', action: 'UPDATE_NOTIFICATION_SETTINGS', entityType: 'SystemSetting',
  entityId: null, reason: null, oldValuesJson: '{"push_enabled":false}', newValuesJson: '{"push_enabled":true}' };

describe('Audit log inspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSession({ accessToken: 't', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'a@test', fullName: 'Admin', roleId: 'r', role: 'ADMIN', status: 'ACTIVE' } }, false);
    vi.mocked(getAuditLogFacets).mockResolvedValue({ actions: ['DISMISS_INCIDENT', 'UPDATE_NOTIFICATION_SETTINGS'], entityTypes: ['Incident', 'SystemSetting'], results: ['SUCCESS'],
      actors: [{ userId: 'u1', fullName: 'Huy', role: 'OPERATOR' }] });
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [dismissed, setting], totalCount: 2, page: 1, pageSize: 50, generatedAt: '2026-11-12T04:00:00Z', timeZone: 'Asia/Ho_Chi_Minh' });
  });

  it('shows real backend entries with the recorded before/after change', async () => {
    render(<MemoryRouter><AuditLog /></MemoryRouter>);
    const details = await screen.findByLabelText('Event details');
    expect(within(details).getByText('Incident dismissed')).toBeInTheDocument();
    expect(within(details).getByText('Duplicate report')).toBeInTheDocument();
    expect(within(details).getByText('IN_PROGRESS')).toBeInTheDocument();
    expect(within(details).getByText('DISMISSED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('row', { name: /Notification settings changed/ }));
    expect(within(screen.getByLabelText('Event details')).getByText('push_enabled')).toBeInTheDocument();
    expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50, from: expect.any(String), to: expect.any(String) }), expect.any(AbortSignal));
    expect(screen.queryByText('Operator Linh')).not.toBeInTheDocument();
  });

  it('sends filters to the server and resets to the first page', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AuditLog /></MemoryRouter>);
    await screen.findByLabelText('Event details');
    await user.selectOptions(screen.getByLabelText('Action'), 'DISMISS_INCIDENT');
    await user.selectOptions(screen.getByLabelText('Actor'), 'u1');
    await user.selectOptions(screen.getByLabelText('Period'), 'all');
    await user.type(screen.getByPlaceholderText(/Search action/), 'duplicate{Enter}');
    await waitFor(() => expect(listAuditLogs).toHaveBeenLastCalledWith({ action: 'DISMISS_INCIDENT', userId: 'u1', search: 'duplicate', page: 1, pageSize: 50,
      entityType: undefined, result: undefined }, expect.any(AbortSignal)));
  });

  it('shows a load failure instead of mock or empty data', async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(new Error('Audit log data is temporarily unavailable. Retry later.'));
    render(<MemoryRouter><AuditLog /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText('No audit events match these filters.')).not.toBeInTheDocument();
  });
});
