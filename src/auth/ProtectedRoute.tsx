import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { loadSession } from './session';

export function ProtectedRoute() {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(() => Boolean(loadSession()));

  useEffect(() => {
    const expire = () => setAuthenticated(false);
    window.addEventListener('auth:expired', expire);
    return () => window.removeEventListener('auth:expired', expire);
  }, []);

  if (!authenticated) {
    return <Navigate to="/login?reason=session-expired" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

