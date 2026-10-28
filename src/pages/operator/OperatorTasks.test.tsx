import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { assignTask, getTask, listAssignableStaff, listTasks, type OperationalTask } from '../../api/tasks';
import { saveSession } from '../../auth/session';
import { mockNativeDialogs } from '../../test/dialog';
import OperatorTasks, { OperatorTaskDetail } from './OperatorTasks';
vi.mock('../../api/tasks', () => ({ taskStatuses: ['OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'CANCELLED'], assignTask: vi.fn(), getTask: vi.fn(), listAssignableStaff: vi.fn(), listTasks: vi.fn(),
  getTaskEvidence: vi.fn(() => Promise.resolve({ taskId: 'task-1', taskStatus: 'OFFERED', requiresBeforePhoto: false, requiresAfterPhoto: false, rejectionCount: 0, drafts: [], submissions: [] })),
  getEvidenceImage: vi.fn(() => new Promise(() => {})), verifyTask: vi.fn(), rejectTask: vi.fn() }));
mockNativeDialogs();

const task: OperationalTask = {
  taskId: 'task-1', origin: 'OPERATIONAL_EVENT', sourceCode: 'EVT-12345678', eventTypeCode: 'CONGESTION',
  title: 'Support checkout queue', instructions: 'Check the area and help customers.', priority: 'WARNING', raisedFrom: null,
  zoneId: 'zone-1', zoneName: 'Checkout', cameraCode: 'CAM-03', status: 'OFFERED', assignmentType: 'OFFER',
  assigneeUserId: null, assigneeName: null, createdAt: '2026-10-25T04:00:00Z', assignedAt: null,
  acceptedAt: null, plannedStartAt: null, startedAt: null, submittedAt: null, eventClearedAt: null, needsAssignment: true, updatedAt: '2026-10-25T04:00:00Z',
};
function session(role = 'OPERATOR') {
  saveSession({ accessToken: 'test-only', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { userId: 'operator-1', email: 'operator@test.local', fullName: 'Operator', roleId: 'role-1', role, status: 'ACTIVE' } }, false);
}
function page(path = '/operator/tasks') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/operator/tasks" element={<OperatorTasks />} /><Route path="/operator/tasks/:taskId" element={<OperatorTaskDetail />} />
  </Routes></MemoryRouter>);
}
describe('Operator Task Board', () => {
  beforeEach(() => {
    vi.clearAllMocks(); session();
    vi.mocked(listTasks).mockResolvedValue([task]); vi.mocked(getTask).mockResolvedValue(task);
    vi.mocked(listAssignableStaff).mockResolvedValue([
      { userId: 'staff-1', fullName: 'Linh', assignedToZone: true, activeTasks: 0, shiftEndsAt: '2026-10-25T09:00:00Z' },
      { userId: 'staff-2', fullName: 'Minh', assignedToZone: false, activeTasks: 1, shiftEndsAt: '2026-10-25T09:00:00Z' },
    ]);
  });
  it('loads real API data and applies filters on the server', async () => {
    const user = userEvent.setup(); page();
    expect(await screen.findByRole('link', { name: task.title })).toHaveAttribute('href', '/operator/tasks/task-1');
    expect(screen.getByText('Operational event · EVT-12345678')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'IN_PROGRESS');
    await waitFor(() => expect(listTasks).toHaveBeenLastCalledWith({ status: 'IN_PROGRESS', needsAssignment: false }, expect.any(AbortSignal)));
    await user.click(screen.getByLabelText('Needs assignment only'));
    await waitFor(() => expect(listTasks).toHaveBeenLastCalledWith({ status: 'IN_PROGRESS', needsAssignment: true }, expect.any(AbortSignal)));
  });
  it('shows offered, accepted, in-progress and needs-assignment states after refresh', async () => {
    const user = userEvent.setup();
    const accepted = { ...task, taskId: 'task-2', title: 'Accepted task', status: 'ACCEPTED' as const, assigneeUserId: 'staff-1', assigneeName: 'Linh', needsAssignment: false };
    const inProgress = { ...task, taskId: 'task-3', title: 'In-progress task', status: 'IN_PROGRESS' as const, assigneeUserId: 'staff-2', assigneeName: 'Minh', needsAssignment: false };
    vi.mocked(listTasks).mockResolvedValueOnce([]).mockResolvedValue([task, accepted, inProgress]);
    page();
    expect(await screen.findByText('No tasks match these filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh tasks' }));
    const offeredRow = await screen.findByRole('row', { name: new RegExp(task.title) });
    const acceptedRow = screen.getByRole('row', { name: new RegExp(accepted.title) });
    const inProgressRow = screen.getByRole('row', { name: new RegExp(inProgress.title) });
    expect(within(offeredRow).getByText('Offered')).toBeInTheDocument();
    expect(within(offeredRow).getByText('Needs assignment')).toBeInTheDocument();
    expect(within(acceptedRow).getByText('Accepted')).toBeInTheDocument();
    expect(within(inProgressRow).getByText('In progress')).toBeInTheDocument();
  });
  it('shows a backend failure without substituting mock tasks', async () => {
    vi.mocked(listTasks).mockRejectedValue(new ApiError(503, 'TASK_SCHEMA_NOT_READY', 'Task schema is not ready.'));
    page();
    expect(await screen.findByRole('alert')).toHaveTextContent('Task schema is not ready.');
    expect(screen.queryByRole('link', { name: task.title })).not.toBeInTheDocument();
  });
  it('allows Admin to inspect but never exposes Operator assignment actions', async () => {
    session('ADMIN'); page('/operator/tasks/task-1');
    expect(await screen.findByText('Assignment actions require an Operator account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign task' })).not.toBeInTheDocument();
  });
  it('keeps an event-cleared in-progress task active and prevents reassignment', async () => {
    vi.mocked(getTask).mockResolvedValue({ ...task, status: 'IN_PROGRESS', assigneeUserId: 'staff-1', assigneeName: 'Linh', eventClearedAt: '2026-10-25T04:10:00Z' });
    page('/operator/tasks/task-1');
    expect(await screen.findByText(/The source event cleared/)).toHaveTextContent('Work already accepted remains');
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reassign task' })).not.toBeInTheDocument();
  });
  it('requires an outside-zone reason and sends the viewed Task version', async () => {
    const user = userEvent.setup();
    const saved = { ...task, status: 'ACCEPTED' as const, assigneeUserId: 'staff-2', assigneeName: 'Minh' };
    vi.mocked(assignTask).mockImplementation(async () => { vi.mocked(getTask).mockResolvedValue(saved); return saved; });
    page('/operator/tasks/task-1');
    await user.click(await screen.findByRole('button', { name: 'Assign task' }));
    const dialog = within(screen.getByRole('dialog'));
    await dialog.findByRole('option', { name: /Minh/ });
    await user.selectOptions(dialog.getByLabelText('Staff member'), 'staff-2');
    await user.click(dialog.getByRole('button', { name: 'Confirm assignment' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('A reason is required');
    expect(assignTask).not.toHaveBeenCalled();
    await user.type(dialog.getByLabelText('Reason (required)'), 'Support from nearby Zone');
    await user.click(dialog.getByRole('button', { name: 'Confirm assignment' }));
    await waitFor(() => expect(assignTask).toHaveBeenCalledWith('task-1', { staffUserId: 'staff-2', reason: 'Support from nearby Zone', expectedUpdatedAt: task.updatedAt }));
    expect(await screen.findByText('Task assigned to Minh.')).toBeInTheDocument();
  });
  it('stops resubmitting a conflicted assignment until the latest Task is reviewed', async () => {
    const user = userEvent.setup();
    vi.mocked(assignTask).mockRejectedValue(new ApiError(409, 'TASK_CHANGED', 'This task changed. Reload.'));
    page('/operator/tasks/task-1');
    await user.click(await screen.findByRole('button', { name: 'Assign task' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(await dialog.findByRole('option', { name: 'Linh · Assigned to this zone · No active tasks' })).toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Staff member'), 'staff-1');
    await user.click(dialog.getByRole('button', { name: 'Confirm assignment' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('This task changed.');
    expect(dialog.getByRole('button', { name: 'Confirm assignment' })).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(getTask).toHaveBeenCalledTimes(2));
  });
  it('keeps a non-conflict assignment failure retryable without refreshing the viewed Task', async () => {
    const user = userEvent.setup();
    vi.mocked(assignTask).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Assignment service is unavailable.'));
    page('/operator/tasks/task-1');
    await user.click(await screen.findByRole('button', { name: 'Assign task' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Staff member'), 'staff-1');
    await user.click(dialog.getByRole('button', { name: 'Confirm assignment' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Assignment service is unavailable.');
    expect(dialog.getByRole('button', { name: 'Confirm assignment' })).toBeEnabled();
    expect(dialog.getByRole('button', { name: 'Refresh candidates' })).toBeEnabled();
    expect(getTask).toHaveBeenCalledTimes(1);
  });
  it('keeps a non-version 409 assignment failure retryable', async () => {
    const user = userEvent.setup();
    vi.mocked(assignTask).mockRejectedValue(new ApiError(409, 'WORKLOAD_LIMIT', 'The Staff member reached the workload limit.'));
    page('/operator/tasks/task-1');
    await user.click(await screen.findByRole('button', { name: 'Assign task' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Staff member'), 'staff-1');
    await user.click(dialog.getByRole('button', { name: 'Confirm assignment' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('workload limit');
    expect(dialog.getByRole('button', { name: 'Confirm assignment' })).toBeEnabled();
    expect(getTask).toHaveBeenCalledTimes(1);
  });
  it('shows no eligible Staff without enabling confirmation', async () => {
    const user = userEvent.setup(); vi.mocked(listAssignableStaff).mockResolvedValue([]);
    page('/operator/tasks/task-1');
    await user.click(await screen.findByRole('button', { name: 'Assign task' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(await dialog.findByText(/No eligible Staff available/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirm assignment' })).toBeDisabled();
  });
});
