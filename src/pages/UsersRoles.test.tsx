import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, saveSession } from '../auth/session';
import type { AccountRecord } from '../api/accounts';
import UsersRoles from './UsersRoles';

const roles = ['ADMIN', 'OPERATOR', 'MANAGER', 'STAFF'].map((name) => ({ roleId: `role-${name}`, name }));
const account = (userId: string, role: string, status = 'ACTIVE'): AccountRecord => ({
  userId, email: `${userId}@example.test`, fullName: userId, roleId: `role-${role}`, role, status,
});
const admin = account('admin', 'ADMIN');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let users: AccountRecord[];
let writeError: { code: string; detail: string } | null;
let requests: { path: string; method: string; body: Record<string, string> | null; bearer: string | null }[];

function show() {
  render(<MemoryRouter initialEntries={['/admin/users']}><Routes>
    <Route path="/admin/users" element={<UsersRoles />} />
    <Route path="/login" element={<p>Signed out after access change</p>} />
  </Routes></MemoryRouter>);
}

describe('Users & Roles account integration', () => {
  beforeEach(() => {
    users = [admin, account('second-admin', 'ADMIN'), account('operator', 'OPERATOR')];
    writeError = null;
    requests = [];
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: admin }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : null;
      requests.push({ path, method, body, bearer: new Headers(init?.headers).get('Authorization') });
      if (method === 'GET' && path === '/api/users') return json(users);
      if (method === 'GET' && path === '/api/roles') return json(roles);
      if (writeError) return json(writeError, 409);
      if (method === 'POST' && path === '/api/users' && body) {
        const created = { ...account('created', roles.find((role) => role.roleId === body.roleId)!.name), email: body.email, fullName: body.fullName };
        users = [...users, created];
        return json(created, 201);
      }
      const id = path.split('/')[3];
      const current = users.find((user) => user.userId === id);
      if (current && method === 'PATCH' && body) {
        const updated = { ...current, fullName: body.fullName, roleId: body.roleId, role: roles.find((role) => role.roleId === body.roleId)!.name };
        users = users.map((user) => user.userId === id ? updated : user);
        return json(updated);
      }
      if (current && method === 'POST' && /\/(enable|disable)$/.test(path)) {
        const updated = { ...current, status: path.endsWith('/enable') ? 'ACTIVE' : 'DISABLED' };
        users = users.map((user) => user.userId === id ? updated : user);
        return json(updated);
      }
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  it('loads backend accounts/roles, creates with a password, edits without resending it, and disables/enables', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('button', { name: 'Edit operator@example.test' });
    expect(screen.queryByRole('button', { name: /Invite|Save permissions/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Full name'), 'New Operator');
    await user.type(screen.getByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText(/Password/), 'TestPassword123!');
    await user.selectOptions(screen.getByLabelText('Role'), 'role-OPERATOR');
    await user.click(screen.getAllByRole('button', { name: 'Create account' })[1]);
    await screen.findByText('Account created. The user can now sign in.');
    expect(requests.find((request) => request.method === 'POST' && request.path === '/api/users')).toMatchObject({
      bearer: 'Bearer admin-token', body: { email: 'new@example.test', fullName: 'New Operator', password: 'TestPassword123!', roleId: 'role-OPERATOR' },
    });
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    await user.clear(screen.getByLabelText('Full name'));
    await user.type(screen.getByLabelText('Full name'), 'New Manager');
    await user.selectOptions(screen.getByLabelText('Role'), 'role-MANAGER');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Account changes saved.');
    expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({ path: '/api/users/created', body: { fullName: 'New Manager', roleId: 'role-MANAGER' } });
    await user.click(screen.getByRole('button', { name: 'Disable account' }));
    await screen.findByRole('button', { name: 'Enable account' });
    await user.click(screen.getByRole('button', { name: 'Enable account' }));
    await screen.findByText('Account enabled.');
    expect(requests.filter((request) => request.path.startsWith('/api/users/created') && request.method === 'POST').map((request) => request.path))
      .toEqual(['/api/users/created/disable', '/api/users/created/enable']);
  });

  it('preserves the draft and shows duplicate-email errors, then allows retry', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('button', { name: 'Edit operator@example.test' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Full name'), 'Keep my draft');
    await user.type(screen.getByLabelText('Email'), 'admin@example.test');
    await user.type(screen.getByLabelText(/Password/), 'TestPassword123!');
    writeError = { code: 'DUPLICATE', detail: 'Duplicate account' };
    await user.click(screen.getAllByRole('button', { name: 'Create account' })[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(screen.getByLabelText('Full name')).toHaveValue('Keep my draft');
    expect(screen.getByLabelText(/Password/)).toHaveValue('TestPassword123!');
    expect(screen.queryByRole('button', { name: 'Edit created@example.test' })).not.toBeInTheDocument();
    writeError = null;
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'retry@example.test');
    await user.click(screen.getAllByRole('button', { name: 'Create account' })[1]);
    await screen.findByText('Account created. The user can now sign in.');
  });

  it('protects the last active Admin in the UI and handles a backend race rejection', async () => {
    const user = userEvent.setup();
    users = [admin, account('operator', 'OPERATOR')];
    show();
    await screen.findByRole('button', { name: 'Edit operator@example.test' });
    expect(screen.getByRole('button', { name: 'Disable account' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Operator' })).toBeDisabled();
    users = [admin, account('second-admin', 'ADMIN')];
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('button', { name: 'Edit second-admin@example.test' });
    writeError = { code: 'LAST_ACTIVE_ADMIN', detail: 'Last Admin' };
    await user.click(screen.getByRole('button', { name: 'Disable account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('last active Administrator cannot be disabled');
    expect(loadSession()).not.toBeNull();
  });

  it.each(['role', 'status'])('clears the session immediately after changing its own %s', async (change) => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('button', { name: 'Edit second-admin@example.test' });
    if (change === 'role') {
      await user.selectOptions(screen.getByLabelText('Role'), 'role-MANAGER');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
    } else await user.click(screen.getByRole('button', { name: 'Disable account' }));
    await screen.findByText('Signed out after access change');
    expect(loadSession()).toBeNull();
  });

  it('updates its own display name without changing Remember me storage', async () => {
    const user = userEvent.setup();
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: admin }, false);
    show();
    await screen.findByRole('button', { name: 'Edit second-admin@example.test' });
    await user.clear(screen.getByLabelText('Full name'));
    await user.type(screen.getByLabelText('Full name'), 'Renamed Admin');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(loadSession()?.user.fullName).toBe('Renamed Admin'));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
  });

  it('can retry a failed initial load and signs out with token storage cleared', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    show();
    await screen.findByRole('button', { name: 'Retry loading accounts' });
    await user.click(screen.getByRole('button', { name: 'Retry loading accounts' }));
    await screen.findByRole('button', { name: 'Edit operator@example.test' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(loadSession()).toBeNull();
  });
});
