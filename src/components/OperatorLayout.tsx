import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, loadSession } from '../auth/session';
import { Icon } from './Icon';
import s from './OperatorLayout.module.css';

export function OperatorLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const navigate = useNavigate();
  const isAdmin = loadSession()?.user.role === 'ADMIN';

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <Link to="/operator/floor-map" className={s.brand}>
          <Icon name="brand-grid" size={18} />
          <span>SUPERMARKET</span>
          <span className={s.accent}>OPS</span>
        </Link>
        <span className={s.divider} aria-hidden="true" />
        <div className={s.heading}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <nav className={s.nav} aria-label="Operator">
          <NavLink to="/operator/floor-map" className={({ isActive }) => `${s.navLink} ${isActive ? s.active : ''}`}>Floor map</NavLink>
          {isAdmin && <Link to="/admin/store-layout" className={s.navLink}>Admin setup</Link>}
        </nav>
        <button
          className={s.avatar}
          aria-label="Sign out"
          title="Sign out"
          onClick={() => {
            clearSession();
            navigate('/login');
          }}
        >
          <Icon name="header-user" size={19} />
        </button>
      </header>
      <main className={s.content}>{children}</main>
    </div>
  );
}
