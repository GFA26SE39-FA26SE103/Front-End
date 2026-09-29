import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { SearchBox } from './ui';
import s from './AdminLayout.module.css';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'nav-grid', activeIcon: 'nav-grid-active' },
  { to: '/admin/store-layout', label: 'Store layout', icon: 'nav-pin', activeIcon: 'nav-pin-active' },
  { to: '/admin/cameras', label: 'Cameras', icon: 'nav-camera', activeIcon: 'nav-camera-active' },
  { to: '/admin/ai-config', label: 'AI Config', icon: 'nav-sliders', activeIcon: 'nav-sliders-active' },
  { to: '/admin/incident-types', label: 'Incident types', icon: 'nav-tag', activeIcon: 'nav-tag-active' },
  { to: '/admin/routing', label: 'Routing & alerts', icon: 'nav-bell', activeIcon: 'nav-bell-active' },
  { to: '/admin/users', label: 'Users & Roles', icon: 'nav-users', activeIcon: 'nav-users-active' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: 'nav-file' },
  { to: '/admin/system-health', label: 'System Health', icon: 'nav-activity' },
];

export function AdminLayout({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  return (
    <div className={s.shell}>
      <nav className={s.nav} aria-label="Admin">
        <div className={s.brand}>
          <Icon name="brand-grid" size={18} />
          <p>
            <span>SUPERMARKET</span>
            <span>OPS</span>
          </p>
        </div>
        <p className={s.section}>ADMIN</p>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}>
            {({ isActive }) => (
              <>
                <Icon name={isActive && item.activeIcon ? item.activeIcon : item.icon} size={16} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className={s.main}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>{title}</h1>
            <p className={s.subtitle}>{subtitle}</p>
          </div>
          <div style={{ flex: 1 }} />
          {actions ?? <SearchBox value={query} onChange={setQuery} placeholder="Search" width={220} height={34} iconName="header-search" iconSize={14} />}
          <button className={s.avatar} aria-label="Sign out" title="Sign out" onClick={() => navigate('/login')}>
            <Icon name="header-user" size={19} />
          </button>
        </header>
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
