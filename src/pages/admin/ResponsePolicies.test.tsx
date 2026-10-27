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
  updatedAt: '2026-10-25T05:00:00Z', readyForAutomaticTask: true, issues: [],
  action: { actionId, isEnabled: true, actionType: 'CREATE_OPERATIONAL_TASK', executionMode: 'AUTOMATIC', title: 'Check congestion', instructions: 'Help customers move safely.' },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Response policy administration', () => {
  let requests: Array<{ path: string; method: string; body: unknown }>;
  let policies: ResponsePolicy[];
  let failFirstLoad: boolean;
  let failSave: boolean;
  let loadCount: number;

  beforeEach(() => {
    requests = [];
    policies = [warning];
    failFirstLoad = false;
    failSave = false;
    loadCount = 0;
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@example.test', fullName: 'Admin', roleId: 'role-admin', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ path, method, body });
      if (method === 'GET') {
        loadCount += 1;
        if (failFirstLoad && loadCount === 1) return json({ code: 'POLICY_LOAD_FAILED', detail: 'Response policies are temporarily unavailable.' }, 503);
        return json(policies);
      }
      if (method === 'PUT' && path.endsWith('/CRITICAL')) {
        if (failSave) return json({ code: 'POLICY_SAVE_FAILED', detail: 'Response policy could not be saved.' }, 503);
        const request = body as { isEnabled: boolean; action: { isEnabled: boolean; title: string; instructions: string } };
        return json({ ...warning, policyId: 'critical-policy', eventPriority: 'CRITICAL', version: 1,
          isEnabled: request.isEnabled, action: { ...warning.action, actionId: 'critical-action', ...request.action } });
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
    expect(within(warningGroup).getByText('Ready for automatic task')).toBeInTheDocument();
    expect(within(warningGroup).getByLabelText('Task title')).toHaveValue('Check congestion');

    const critical = screen.getByRole('group', { name: 'CRITICAL policy' });
    expect(within(critical).getByText('Not configured')).toBeInTheDocument();
    fireEvent.change(within(critical).getByLabelText('Task title'), { target: { value: 'Urgent congestion response' } });
    fireEvent.change(within(critical).getByLabelText('Staff instructions'), { target: { value: 'Open a safe route and assist customers.' } });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save CRITICAL policy' }));

    expect(await screen.findByText('CRITICAL policy saved.')).toBeInTheDocument();
    await waitFor(() => expect(requests.find((request) => request.method === 'PUT')).toEqual({
      path: `/api/monitoring-rules/${ruleId}/response-policies/CRITICAL`, method: 'PUT',
      body: { isEnabled: true, expectedVersion: null, action: { isEnabled: true, title: 'Urgent congestion response', instructions: 'Open a safe route and assist customers.' } },
    }));
  });

  it('shows readiness issues returned by the backend', async () => {
    policies = [{ ...warning, readyForAutomaticTask: false, issues: ['RULE_DISABLED', 'ACTION_NOT_AUTOMATIC'] }];
    show();

    const warningGroup = await screen.findByRole('group', { name: 'WARNING policy' });
    expect(within(warningGroup).getByText('Needs attention')).toBeInTheDocument();
    expect(within(warningGroup).getByText('The monitoring rule is disabled.')).toBeInTheDocument();
    expect(within(warningGroup).getByText('The task action is not configured for automatic execution.')).toBeInTheDocument();
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
    fireEvent.change(within(critical).getByLabelText('Task title'), { target: { value: 'Keep this draft' } });
    fireEvent.change(within(critical).getByLabelText('Staff instructions'), { target: { value: 'Retry these instructions.' } });
    fireEvent.click(within(critical).getByRole('button', { name: 'Save CRITICAL policy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Response policy could not be saved.');
    expect(screen.getByRole('group', { name: 'WARNING policy' })).toBeInTheDocument();
    expect(within(critical).getByLabelText('Task title')).toHaveValue('Keep this draft');
    expect(within(critical).getByRole('button', { name: 'Save CRITICAL policy' })).toBeEnabled();
  });
});
