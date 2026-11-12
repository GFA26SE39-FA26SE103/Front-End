import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissIncident, listIncidents, type IncidentRow } from '../../api/incidents';
import { saveSession } from '../../auth/session';
import { mockNativeDialogs } from '../../test/dialog';
import OperatorIncidents from './OperatorIncidents';
vi.mock('../../api/incidents', () => ({ listIncidents: vi.fn(), dismissIncident: vi.fn() }));
mockNativeDialogs();

const open: IncidentRow = {
  incidentId: 'inc-1', title: 'Spill at entrance', description: null, sourceType: 'STAFF_REPORTED', incidentTypeCode: 'SPILL', incidentTypeName: 'Spill',
  zoneId: 'zone-1', zoneName: 'Entrance', status: 'IN_PROGRESS', statusReason: null, createdAt: '2026-11-11T03:00:00Z', updatedAt: '2026-11-11T03:00:00Z',
  closedAt: null, mitigatedAt: '2026-11-11T03:05:00Z', resolutionDeadlineAt: '2026-11-11T04:00:00Z', slaPriorityCode: 'HIGH', isOpen: true,
  mandatoryTasks: 2, verifiedMandatoryTasks: 1, tasks: [{ taskId: 'task-1', title: 'Clean spill', status: 'VERIFIED', isMandatory: true, verificationMode: 'MANUAL', assigneeName: 'Linh', verifiedAt: null, taskTypeCode: 'TT-12', isMitigation: true }],
};
const closed: IncidentRow = { ...open, incidentId: 'inc-2', title: 'Old spill', status: 'CLOSED', statusReason: 'ALL_MANDATORY_TASKS_VERIFIED', closedAt: '2026-11-11T02:00:00Z', isOpen: false, verifiedMandatoryTasks: 2, mitigatedAt: null, tasks: [] };

describe('Operator incident board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSession({ accessToken: 't', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { userId: 'op', email: 'op@test', fullName: 'Op', roleId: 'r', role: 'OPERATOR', status: 'ACTIVE' } }, false);
    vi.mocked(listIncidents).mockImplementation(async state => state === 'open' ? [open] : [closed]);
  });

  it('shows mandatory task progress, mitigation and automatic closure', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><OperatorIncidents /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Spill at entrance/ });
    expect(within(row).getByText('1/2 verified')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Clean spill' })).toHaveAttribute('href', '/operator/tasks/task-1');
    expect(within(row).getByText(/mandatory · mitigation/)).toBeInTheDocument();
    expect(within(row).queryByText(/Not yet/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Show'), 'ended');
    expect(await screen.findByText('Closed automatically: every mandatory task was verified')).toBeInTheDocument();
    expect(screen.getByText('No mitigation task')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(listIncidents).toHaveBeenLastCalledWith('ended', expect.any(AbortSignal));
  });

  it('requires a reason before dismissing an open incident', async () => {
    const user = userEvent.setup();
    vi.mocked(dismissIncident).mockResolvedValue({ incidentId: 'inc-1', status: 'DISMISSED', reason: 'Duplicate', closedAt: 'now', updatedAt: 'now' });
    render(<MemoryRouter><OperatorIncidents /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Dismiss incident' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('A reason is required');
    await user.type(dialog.getByLabelText('Reason (required)'), 'Duplicate report');
    await user.click(dialog.getByRole('button', { name: 'Dismiss incident' }));
    await waitFor(() => expect(dismissIncident).toHaveBeenCalledWith('inc-1', 'Duplicate report'));
    expect(await screen.findByText(/dismissed. The reason is recorded/)).toBeInTheDocument();
  });
});
