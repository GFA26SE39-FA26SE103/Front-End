import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../../auth/session';
import type { ResponsePolicy } from '../../api/responsePolicies';
import ResponsePolicies from './ResponsePolicies';

const ruleId = '6288c2c2-1bda-40fb-9e63-72e94c8d8167';
const actionId = '11111111-1111-1111-1111-111111111111';
const policyId = '22222222-2222-2222-2222-222222222222';
const warning: ResponsePolicy = {
  policyId, ruleId, eventPriority: 'WARNING', isEnabled: true, version: 1,
  updatedAt: '2026-10-25T05:00:00Z', readyForAutomaticTask: false, issues: [],
  action: { actionId, isEnabled: true, actionType: 'NOTIFY_OPERATOR', executionMode: 'AUTOMATIC', taskTypeCode: null, title: null, instructions: null },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Response policy administration', () => {
  let requests: Array<{ path: string; method: string; body: unknown }>;
  let policies: ResponsePolicy[];
  let failFirstLoad: boolean;
  let failSave: boolean;
  let loadCount: number;
  let failCatalog: boolean;

  beforeEach(() => {
    requests = [];
    policies = [warning];
    failFirstLoad = false;
    failSave = false;
    loadCount = 0;
    failCatalog = false;
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@example.test', fullName: 'Admin', roleId: 'role-admin', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ path, method, body });
      if (path === '/api/task-types') return failCatalog ? json({ detail: 'Catalog unavailable.' }, 503) : json([
        { taskTypeId: 'type-1', code: 'TT-01', name: 'Queue assistance', description: 'Help customers move through the checkout queue.', requiredSpecialtyId: 'checkout' },
        { taskTypeId: 'type-4', code: 'TT-04', name: 'Congestion assistance', description: null, requiredSpecialtyId: 'floor' },
      ]);
      if (method === 'GET') {
        loadCount += 1;
        if (failFirstLoad && loadCount === 1) return json({ code: 'POLICY_LOAD_FAILED', detail: 'Response policies are temporarily unavailable.' }, 503);
        return json(policies);
      }
      if (method === 'PUT') {
        if (failSave) return json({ code: 'POLICY_SAVE_FAILED', detail: 'Response policy could not be saved.' }, 503);
        const request = body as { isEnabled: boolean; action: { isEnabled: boolean; taskTypeCode: string | null; title: string; instructions: string } };
        const version = (body as { expectedVersion: number }).expectedVersion;
        if (version !== policies[0].version) return json({ code: 'POLICY_VERSION_CONFLICT' }, 409);
        const level = path.endsWith('/CRITICAL') ? 'CRITICAL' : 'WARNING';
        const saved = { ...warning, eventPriority: level, version: version + 1,
          isEnabled: request.isEnabled, action: { ...warning.action, actionId: 'saved-action', ...request.action } } as ResponsePolicy;
        policies = [...policies.filter(p => p.eventPriority !== level).map(p => ({ ...p, version: saved.version })), saved];
        return json(saved);
      }
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  function show() {
    render(<MemoryRouter initialEntries={[`/admin/response-policies/${ruleId}`]}><Routes>
      <Route path="/admin/response-policies/:ruleId" element={<ResponsePolicies />} />
    </Routes></MemoryRouter>);
  }

  it('loads both priority slots and saves a missing critical policy through the versioned contract', async () => {
    show();
    const warningGroup = await screen.findByRole('group', { name: 'WARNING policy' });
    expect(screen.getByRole('link', { name: /Back to AI configuration/ })).toHaveAttribute('href', '/admin/ai-config');
    expect(within(warningGroup).getByText('Notification ready')).toBeInTheDocument();
    expect(within(warningGroup).queryByLabelText('Task title (optional)')).not.toBeInTheDocument();
    expect(within(warningGroup).queryByRole('textbox')).not.toBeInTheDocument();

    const critical = screen.getByRole('group', { name: 'CRITICAL policy' });
    await within(critical).findByRole('option', { name: 'TT-04 — Congestion assistance' });
    expect(within(critical).getByText('Not configured')).toBeInTheDocument();
    fireEvent.change(within(critical).getByLabelText('Task type (required when enabled)'), { target: { value: 'TT-04' } });
    fireEvent.change(within(critical).getByLabelText('Task title (optional)'), { target: { value: 'Urgent congestion response' } });
    fireEvent.change(within(critical).getByLabelText('Staff instructions (optional)'), { target: { value: 'Open a safe route and assist customers.' } });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save critical task dispatch' }));

    expect(await screen.findByText('Critical task dispatch saved.')).toBeInTheDocument();
    await waitFor(() => expect(requests.find((request) => request.method === 'PUT')).toEqual({
      path: `/api/monitoring-rules/${ruleId}/response-policies/CRITICAL`, method: 'PUT',
      body: { isEnabled: true, expectedVersion: 1, action: { isEnabled: true, taskTypeCode: 'TT-04', title: 'Urgent congestion response', instructions: 'Open a safe route and assist customers.' } },
    }));
  });

  it('shows readiness issues returned by the backend', async () => {
    policies = [{ ...warning, readyForAutomaticTask: false, issues: ['RULE_DISABLED', 'ACTION_NOT_AUTOMATIC'] }];
    show();

    const warningGroup = await screen.findByRole('group', { name: 'WARNING policy' });
    expect(within(warningGroup).getByText('Needs attention')).toBeInTheDocument();
    expect(within(warningGroup).getByText('The monitoring rule is disabled.')).toBeInTheDocument();
    expect(within(warningGroup).getByText('The response action is not configured for automatic execution.')).toBeInTheDocument();
  });

  it('uses the advanced shared version when saving the other action and clears warning task parameters', async () => {
    show();
    const warningGroup = await screen.findByRole('group', { name: 'WARNING policy' });
    fireEvent.click(within(warningGroup).getByRole('button', { name: 'Save warning notification' }));
    await screen.findByText('Warning notification saved.');
    const critical = screen.getByRole('group', { name: 'CRITICAL policy' });
    await within(critical).findByRole('option', { name: 'TT-01 — Queue assistance' });
    fireEvent.change(within(critical).getByLabelText('Task type (required when enabled)'), { target: { value: 'TT-01' } });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save critical task dispatch' }));
    await screen.findByText('Critical task dispatch saved.');
    const puts = requests.filter(r => r.method === 'PUT');
    expect(puts[0].body).toEqual({ isEnabled: true, expectedVersion: 1,
      action: { isEnabled: true, taskTypeCode: null, title: null, instructions: null } });
    expect(puts[1].body).toMatchObject({ expectedVersion: 2 });
  });

  it('validates critical TaskType before sending a request', async () => {
    show();
    const critical = await screen.findByRole('group', { name: 'CRITICAL policy' });
    await within(critical).findByRole('option', { name: 'TT-01 — Queue assistance' });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save critical task dispatch' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select an available task type');
    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  });

  it('labels inactive configuration without treating a notification-only action as broken', async () => {
    policies = [{ ...warning, issues: ['CONFIGURATION_NOT_ACTIVE'] }, { ...warning, eventPriority: 'CRITICAL', issues: ['CONFIGURATION_NOT_ACTIVE'] }];
    show();
    const group = await screen.findByRole('group', { name: 'WARNING policy' });
    expect(screen.getAllByText('Configuration inactive.')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Activate it in AI configuration');
    expect(within(group).queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('shows the task name and description and recovers a failed catalog without losing the draft', async () => {
    failCatalog = true;
    show();
    const critical = await screen.findByRole('group', { name: 'CRITICAL policy' });
    await within(critical).findByText(/Could not load task types/);
    expect(within(critical).getByRole('combobox')).toBeDisabled();
    expect(within(critical).getByRole('button', { name: 'Save critical task dispatch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save warning notification' })).toBeEnabled();
    fireEvent.change(within(critical).getByLabelText('Task title (optional)'), { target: { value: 'Keep draft title' } });
    failCatalog = false;
    fireEvent.click(within(critical).getByRole('button', { name: 'Retry task types' }));
    await within(critical).findByRole('option', { name: 'TT-01 — Queue assistance' });
    fireEvent.change(within(critical).getByRole('combobox'), { target: { value: 'TT-01' } });
    expect(within(critical).getByText('Help customers move through the checkout queue.')).toBeInTheDocument();
    expect(within(critical).getByLabelText('Task title (optional)')).toHaveValue('Keep draft title');
  });

  it('does not allow inventing a missing shared policy', async () => {
    policies = [];
    show();
    await screen.findByText(/No shared operational SLA policy exists/);
    expect(screen.getByRole('button', { name: 'Save warning notification' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save critical task dispatch' })).toBeDisabled();
  });

  it('shows a backend load error and retries without substituting policy data', async () => {
    failFirstLoad = true;
    show();

    const feedback = await screen.findByRole('alert');
    expect(feedback).toHaveTextContent('Response policies are temporarily unavailable.');
    expect(screen.queryByRole('group', { name: 'WARNING policy' })).not.toBeInTheDocument();
    fireEvent.click(within(feedback).getByRole('button', { name: 'Reload' }));

    expect(await screen.findByRole('group', { name: 'WARNING policy' })).toBeInTheDocument();
    expect(loadCount).toBe(2);
  });

  it('keeps policy drafts visible and retryable when a save fails', async () => {
    failSave = true;
    show();
    const critical = await screen.findByRole('group', { name: 'CRITICAL policy' });
    await within(critical).findByRole('option', { name: 'TT-01 — Queue assistance' });
    fireEvent.change(within(critical).getByLabelText('Task type (required when enabled)'), { target: { value: 'TT-01' } });
    fireEvent.change(within(critical).getByLabelText('Task title (optional)'), { target: { value: 'Keep this draft' } });
    fireEvent.change(within(critical).getByLabelText('Staff instructions (optional)'), { target: { value: 'Retry these instructions.' } });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save critical task dispatch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Response policy could not be saved.');
    expect(screen.getByRole('group', { name: 'WARNING policy' })).toBeInTheDocument();
    expect(within(critical).getByLabelText('Task title (optional)')).toHaveValue('Keep this draft');
    expect(within(critical).getByRole('button', { name: 'Save critical task dispatch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload saved state' })).toBeEnabled();
  });
});
