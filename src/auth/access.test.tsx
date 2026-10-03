import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { getCurrentUser, signIn } from '../api/auth';
import { ApiError } from '../api/client';
import { AdminLayout } from '../components/AdminLayout';
import { clearSession, loadSession, saveSession, type AuthUser } from './session';

vi.mock('../api/auth', () => ({ getCurrentUser: vi.fn(), signIn: vi.fn(), MAX_FAILED_ATTEMPTS: 5, LOCK_SECONDS: 900 }));
vi.mock('../pages/SetupHealth', () => ({ default: () => <AdminLayout title="Dashboard" subtitle="Setup"><p>Admin dashboard content</p></AdminLayout> }));
vi.mock('../pages/UsersRoles', () => ({ default: () => <p>Account admin content</p> }));
vi.mock('../pages/operator/OperatorFloorMap', () => ({ default: () => <p>Admin floor-map preview</p> }));
vi.mock('../pages/operator/OperatorCameraLive', () => ({ default: () => <p>Admin camera preview</p> }));

const makeUser = (role = 'ADMIN', status = 'ACTIVE'): AuthUser => ({
  userId: 'user-1', email: 'account@example.test', fullName: 'Test Account', roleId: `role-${role}`, role, status,
});
function session(user: AuthUser, expiresAt = '2099-01-01T00:00:00Z') {
  saveSession({ accessToken: 'signed-token', expiresAt, user }, true);
}
function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
function show(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>);
}

describe('role routing and authenticated access', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset().mockResolvedValue(makeUser());
    vi.mocked(signIn).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['ADMIN', '/admin/dashboard', 'Dashboard'],
    ['OPERATOR', '/operator/dashboard', 'Operator workspace'],
    ['MANAGER', '/manager/dashboard', 'Manager workspace'],
    ['STAFF', '/staff/dashboard', 'Staff workspace'],
  ])('sends %s login to its own workspace', async (role, path, heading) => {
    const user = userEvent.setup();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser(role));
    vi.mocked(signIn).mockImplementation(async (_email, _password, remember) => {
      saveSession({ accessToken: 'signed-token', expiresAt: '2099-01-01T00:00:00Z', user: makeUser(role) }, remember);
      return 'ok';
    });
    show('/login');
    await user.type(screen.getByPlaceholderText('you@store.com'), 'account@example.test');
    await user.type(screen.getByPlaceholderText('••••••••••'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: heading });
    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(getCurrentUser).toHaveBeenCalled();
  });

  it.each(['OPERATOR', 'MANAGER', 'STAFF'])('blocks %s from a direct Admin URL before rendering the screen', async (role) => {
    session(makeUser(role));
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser(role));
    show('/admin/users');
    await screen.findByRole('heading', { name: 'Access denied' });
    expect(screen.queryByText('Account admin content')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/access-denied');
  });

  it.each([
    ['ADMIN', '/manager/dashboard'], ['MANAGER', '/staff/dashboard'],
    ['STAFF', '/operator/dashboard'], ['OPERATOR', '/operator/floor-map'],
    ['MANAGER', '/operator/cameras/camera-1'],
  ])('blocks %s from %s when the route requires another role', async (role, path) => {
    session(makeUser(role));
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser(role));
    show(path);
    await screen.findByRole('heading', { name: 'Access denied' });
    expect(screen.queryByText(/Admin .* preview/)).not.toBeInTheDocument();
  });

  it('uses the backend role even if the stored user has been changed to ADMIN', async () => {
    session(makeUser('ADMIN'));
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser('STAFF'));
    show('/admin/users');
    await screen.findByRole('heading', { name: 'Access denied' });
    expect(loadSession()?.user.role).toBe('STAFF');
    expect(screen.queryByText('Account admin content')).not.toBeInTheDocument();
  });

  it('keeps protected content hidden while access is being verified', async () => {
    session(makeUser());
    let resolve!: (user: AuthUser) => void;
    vi.mocked(getCurrentUser).mockReturnValue(new Promise<AuthUser>((done) => { resolve = done; }));
    show('/admin/users');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    expect(screen.queryByText('Account admin content')).not.toBeInTheDocument();
    await act(async () => resolve(makeUser()));
    await screen.findByText('Account admin content');
  });

  it('clears revoked sessions and redirects to sign-in', async () => {
    session(makeUser());
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Revoked'));
    show('/admin/users');
    await screen.findByText('Session expired');
    expect(loadSession()).toBeNull();
    expect(screen.queryByText('Account admin content')).not.toBeInTheDocument();
  });

  it('rejects disabled accounts even if /me returns a user', async () => {
    session(makeUser());
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser('ADMIN', 'DISABLED'));
    show('/admin/users');
    await screen.findByText('Session expired');
    expect(loadSession()).toBeNull();
  });

  it('fails closed on a network error and allows verification retry', async () => {
    const user = userEvent.setup();
    session(makeUser());
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new TypeError('offline'));
    show('/admin/users');
    await screen.findByRole('heading', { name: 'Access check unavailable' });
    expect(screen.queryByText('Account admin content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry access check' }));
    await screen.findByText('Account admin content');
  });

  it('does not accept an invalid expiry or make an authenticated request', async () => {
    session(makeUser(), 'invalid-date');
    show('/admin/users');
    await screen.findByText('Session expired');
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(loadSession()).toBeNull();
  });

  it('expires an idle session while the protected screen is open', async () => {
    vi.useFakeTimers();
    session(makeUser(), new Date(Date.now() + 10_000).toISOString());
    show('/admin/users');
    await act(async () => {});
    expect(screen.getByText('Account admin content')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(10_001));
    expect(screen.getByText('Session expired')).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });

  it('reacts to logout in another tab', async () => {
    session(makeUser());
    show('/admin/users');
    await screen.findByText('Account admin content');
    act(() => {
      clearSession();
      window.dispatchEvent(new StorageEvent('storage', { key: 'shepherd.auth.session', newValue: null }));
    });
    await screen.findByText('Session expired');
  });

  it('allows Admin preview access and clears the token on Admin sign-out', async () => {
    const user = userEvent.setup();
    session(makeUser());
    const rendered = show('/operator/floor-map');
    await screen.findByText('Admin floor-map preview');
    rendered.unmount();
    show('/admin/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(loadSession()).toBeNull();
  });

  it('denies unknown roles without falling back to the Admin dashboard', async () => {
    session(makeUser('UNKNOWN'));
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser('UNKNOWN'));
    show('/');
    await screen.findByRole('heading', { name: 'Access denied' });
    expect(screen.queryByText('Admin dashboard content')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to my workspace' })).not.toBeInTheDocument();
  });
});
