import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSession, saveSession } from '../auth/session';
import { AccountMenu } from './AccountMenu';

function show() {
  render(<MemoryRouter initialEntries={['/admin/users']}><Routes>
    <Route path="/admin/users" element={<><AccountMenu /><button type="button">Outside action</button></>} />
    <Route path="/login" element={<p>Login page</p>} />
  </Routes></MemoryRouter>);
}

describe('Account menu', () => {
  beforeEach(() => {
    saveSession({ accessToken: 'private-token', expiresAt: '2099-01-01T00:00:00Z', user: {
      userId: 'user-1', fullName: 'System Admin', email: 'admin@example.test', roleId: 'role-1', role: 'ADMIN', status: 'ACTIVE',
    } }, true);
  });

  it('opens account information without logging out and logs out only on Logout', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();
    expect(screen.getByText('System Admin')).toBeVisible();
    expect(screen.getByText('admin@example.test')).toBeVisible();
    expect(screen.queryByText('private-token')).not.toBeInTheDocument();
    expect(loadSession()).not.toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    await screen.findByText('Login page');
    expect(loadSession()).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('closes on an outside click and toggles from the profile button', async () => {
    const user = userEvent.setup();
    show();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside action' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(loadSession()).not.toBeNull();
  });

  it('supports keyboard opening, Escape focus return, and Tab dismissal', async () => {
    const user = userEvent.setup();
    show();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Outside action' })).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
