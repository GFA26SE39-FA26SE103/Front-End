import { Link, Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { isAppRole, roleHome, roleLabel } from '../auth/roles';
import { clearSession, type AuthUser } from '../auth/session';
import { Button } from '../components/ui';
import s from './RoleWorkspace.module.css';

export function RoleRedirect() {
  const user = useOutletContext<AuthUser>();
  return <Navigate to={roleHome(user.role)} replace />;
}

export default function RoleWorkspace({ denied = false }: { denied?: boolean }) {
  const user = useOutletContext<AuthUser>();
  const navigate = useNavigate();
  return <main className={s.shell}><section className={s.card}>
    <span className={s.role}>{roleLabel(user.role).toUpperCase()}</span>
    <h1>{denied ? 'Access denied' : `${roleLabel(user.role)} workspace`}</h1>
    <p>{user.fullName} · {user.email}</p>
    <p>{denied
      ? 'Your account does not have permission to open this page.'
      : 'You are signed in. The operational screens for your role are not available yet. Contact your administrator if you need help.'}</p>
    {denied && isAppRole(user.role) && <Link className={s.link} to={roleHome(user.role)}>Go to my workspace</Link>}
    <Button variant="secondary" onClick={() => { clearSession(); navigate('/login', { replace: true }); }}>Sign out</Button>
  </section></main>;
}
