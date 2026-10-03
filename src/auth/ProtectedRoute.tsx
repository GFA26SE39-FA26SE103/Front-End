import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getCurrentUser } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui';
import { clearSession, loadSession, updateSessionUser, type AuthUser } from './session';
import type { AppRole } from './roles';
import s from '../pages/RoleWorkspace.module.css';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: readonly AppRole[] }) {
  const location = useLocation();
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [verified, setVerified] = useState<{ key: string; user: AuthUser } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const key = `${location.key}:${attempt}`;

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    const controller = new AbortController();
    const expire = () => {
      clearSession();
      setExpired(true);
    };
    const storageChanged = () => {
      setVerified(null);
      setFailure(null);
      setAttempt((value) => value + 1);
    };
    window.addEventListener('auth:expired', expire);
    window.addEventListener('storage', storageChanged);
    const expiry = Date.parse(session.expiresAt);
    const timer = window.setTimeout(() => {
      if (expiry <= Date.now()) expire();
      else setAttempt((value) => value + 1);
    }, Math.min(expiry - Date.now(), 2_147_483_647));
    void getCurrentUser(controller.signal).then((user) => {
      if (controller.signal.aborted) return;
      if (user.status !== 'ACTIVE') {
        expire();
        return;
      }
      updateSessionUser(user);
      setVerified({ key, user });
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 401) expire();
      else setFailure({ key, message: 'Could not verify your access. Check your connection and try again.' });
    });
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener('auth:expired', expire);
      window.removeEventListener('storage', storageChanged);
    };
  }, [key]);

  if (expired || !loadSession()) {
    return <Navigate to="/login?reason=session-expired" replace state={{ from: location.pathname }} />;
  }
  if (failure?.key === key) {
    return <main className={s.shell}><section className={s.card}>
      <h1>Access check unavailable</h1><p role="alert">{failure.message}</p>
      <Button onClick={() => setAttempt((value) => value + 1)}>Retry access check</Button>
      <Button variant="secondary" onClick={() => { clearSession(); setExpired(true); }}>Sign out</Button>
    </section></main>;
  }
  if (verified?.key !== key) {
    return <main className={s.shell}><p role="status">Checking your account and permissions…</p></main>;
  }
  if (allowedRoles && !allowedRoles.some((role) => role === verified.user.role)) {
    return <Navigate to="/access-denied" replace />;
  }
  return <Outlet context={verified.user} />;
}

