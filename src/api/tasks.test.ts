import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { assignTask, getTask, listAssignableStaff, listTasks } from './tasks';
vi.mock('./client', () => ({ apiFetch: vi.fn() }));

describe('Operator task API', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  it('passes server filters and cancellation to the authenticated client', async () => {
    const signal = new AbortController().signal;
    await listTasks({ status: 'OFFERED,ACCEPTED', needsAssignment: true }, signal);
    expect(apiFetch).toHaveBeenCalledWith('/api/tasks?status=OFFERED%2CACCEPTED&needsAssignment=true', { signal });
    await listTasks();
    expect(apiFetch).toHaveBeenLastCalledWith('/api/tasks', { signal: undefined });
  });
  it('uses the Task ID and sends an explicit version guard on assignment', async () => {
    await getTask('task/1');
    expect(apiFetch).toHaveBeenLastCalledWith('/api/tasks/task%2F1', { signal: undefined });
    await listAssignableStaff('task/1');
    expect(apiFetch).toHaveBeenLastCalledWith('/api/tasks/task%2F1/assignable-staff', { signal: undefined });
    const assignment = { staffUserId: 'staff-1', reason: 'Zone support', expectedUpdatedAt: '2026-10-25T05:00:00Z' };
    await assignTask('task/1', assignment);
    expect(apiFetch).toHaveBeenLastCalledWith('/api/tasks/task%2F1/assign', { method: 'POST', body: JSON.stringify(assignment), signal: undefined });
  });
});
