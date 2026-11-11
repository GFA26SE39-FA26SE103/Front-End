import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSlaEscalation, listOperationalEventSlaPolicies, listSlaPolicies, listTaskTypeSlaPolicies, saveOperationalEventSlaPolicy, saveSlaEscalation,
  saveTaskTypeSlaPolicy, type OperationalEventSlaPolicy, type SlaPolicySummary,
} from '../../api/slaPolicies';
import { listIncidentTypes } from '../../api/monitoring';
import { saveSession } from '../../auth/session';
import SlaPolicies from './SlaPolicies';

vi.mock('../../api/slaPolicies', () => ({
  slaPriorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], listOperationalEventSlaPolicies: vi.fn(), saveOperationalEventSlaPolicy: vi.fn(),
  listTaskTypeSlaPolicies: vi.fn(), saveTaskTypeSlaPolicy: vi.fn(), listSlaPolicies: vi.fn(), saveSlaPolicy: vi.fn(), getSlaEscalation: vi.fn(), saveSlaEscalation: vi.fn(),
}));
vi.mock('../../api/monitoring', () => ({ listIncidentTypes: vi.fn() }));

const summary: SlaPolicySummary = { policyId: 'policy-1', isEnabled: true, version: 3, priorityCode: 'HIGH', responseTargetSec: 120, resolutionTargetSec: 1800,
  offerTimeoutSec: 60, warningPercent: 80, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
const queue: OperationalEventSlaPolicy = { eventTypeId: 'event-1', code: 'LONG_QUEUE', name: 'Long Queue', measurementType: 'QUEUE_LENGTH', status: 'ACTIVE', policy: null, issues: ['POLICY_MISSING'] };
const crowd: OperationalEventSlaPolicy = { eventTypeId: 'event-2', code: 'CONGESTION', name: 'Overcrowding', measurementType: 'CROWD_DENSITY', status: 'ACTIVE', policy: summary, issues: [] };

function page() { return render(<MemoryRouter><SlaPolicies /></MemoryRouter>); }

describe('SLA policy administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSession({ accessToken: 't', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'a@test', fullName: 'Admin', roleId: 'r', role: 'ADMIN', status: 'ACTIVE' } }, false);
    vi.mocked(listOperationalEventSlaPolicies).mockResolvedValue([queue, crowd]);
    vi.mocked(listTaskTypeSlaPolicies).mockResolvedValue([{ taskTypeId: 'task-type-1', code: 'TT-11', name: 'Clean Affected Area', sourceCategory: 'Cleanliness Problems', policy: null, issues: ['POLICY_MISSING'] }]);
    vi.mocked(listIncidentTypes).mockResolvedValue([]);
    vi.mocked(listSlaPolicies).mockResolvedValue([]);
    vi.mocked(getSlaEscalation).mockResolvedValue({ policyId: 'policy-1', problemDomain: 'OPERATIONAL_EVENT', version: 3, warningRoles: ['OPERATOR'], breachRoles: ['OPERATOR', 'MANAGER'], usesDefault: true });
  });

  it('creates a missing OperationalEvent SLA policy with LOW–CRITICAL priority and validated timing', async () => {
    vi.mocked(saveOperationalEventSlaPolicy).mockResolvedValue({ ...queue, policy: { ...summary, version: 1 }, issues: [] });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Long Queue' }));
    expect(screen.getByText('Create the policy first to configure who is notified at the warning milestone and at breach.')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Priority')).getAllByRole('option').map(option => option.textContent)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    fireEvent.change(screen.getByLabelText('Resolution target (seconds)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create SLA policy' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Resolution target cannot be shorter');
    expect(saveOperationalEventSlaPolicy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Resolution target (seconds)'), { target: { value: '900' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'CRITICAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create SLA policy' }));
    await waitFor(() => expect(saveOperationalEventSlaPolicy).toHaveBeenCalledWith('event-1', { expectedVersion: null, isEnabled: true, priorityCode: 'CRITICAL',
      responseTargetSec: 120, resolutionTargetSec: 900, offerTimeoutSec: 60, warningPercent: 80 }));
    expect(await screen.findByText('SLA policy created.')).toBeInTheDocument();
  });

  it('edits escalation roles of an existing policy with its version', async () => {
    vi.mocked(saveSlaEscalation).mockResolvedValue({ policyId: 'policy-1', problemDomain: 'OPERATIONAL_EVENT', version: 4, warningRoles: ['MANAGER'], breachRoles: ['OPERATOR', 'MANAGER'], usesDefault: false });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Overcrowding' }));
    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeInTheDocument();
    expect(await screen.findByText(/Using the default/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Warning milestone OPERATOR'));
    fireEvent.click(screen.getByRole('button', { name: 'Save escalation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role');
    fireEvent.click(screen.getByLabelText('Warning milestone MANAGER'));
    fireEvent.click(screen.getByRole('button', { name: 'Save escalation' }));
    await waitFor(() => expect(saveSlaEscalation).toHaveBeenCalledWith('policy-1', { expectedVersion: 3, warningRoles: ['MANAGER'], breachRoles: ['OPERATOR', 'MANAGER'] }));
    expect(await screen.findByText('Escalation saved.')).toBeInTheDocument();
  });

  it('configures TaskType SLA for StaffReport and manual Tasks', async () => {
    vi.mocked(saveTaskTypeSlaPolicy).mockResolvedValue({ taskTypeId: 'task-type-1', code: 'TT-11', name: 'Clean Affected Area', sourceCategory: 'Cleanliness Problems', policy: summary, issues: [] });
    page();
    fireEvent.click(await screen.findByRole('tab', { name: 'Task types' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clean Affected Area' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create SLA policy' }));
    await waitFor(() => expect(saveTaskTypeSlaPolicy).toHaveBeenCalledWith('task-type-1', expect.objectContaining({ expectedVersion: null, priorityCode: 'HIGH' })));
  });
});
