import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { SidebarAccount } from './AccountMenu';
import { ThemeToggle } from './ThemeToggle';
import a from './AdminLayout.module.css';
import s from './OperatorLayout.module.css';

const NAV = [
  { to: '/operator/floor-map', label: 'Floor map', icon: 'layers' },
  { to: '/operator/tasks', label: 'Tasks', icon: 'nav-file' },
  { to: '/operator/events', label: 'Events', icon: 'nav-activity' },
  { to: '/operator/recommendations', label: 'Recommendations', icon: 'nav-sliders', activeIcon: 'nav-sliders-active' },
  { to: '/operator/incidents', label: 'Incidents', icon: 'nav-tag', activeIcon: 'nav-tag-active' },
  { to: '/operator/notifications', label: 'Notifications', icon: 'nav-bell', activeIcon: 'nav-bell-active' },
];

export function OperatorLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className={a.shell}>
      <nav className={a.nav} aria-label="Operator">
        <div className={a.brand}>
          <Icon name="brand-grid" size={18} />
          <p>
            <span>SUPERMARKET</span>
            <span>OPS</span>
          </p>
        </div>
        <p className={a.section}>OPERATOR</p>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `${a.link} ${isActive ? a.active : ''}`}>
            {({ isActive }) => (
              <>
                <Icon name={isActive && item.activeIcon ? item.activeIcon : item.icon} size={16} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        <div className={a.navFooter}>
          <SidebarAccount />
        </div>
      </nav>
      <div className={a.main}>
        <header className={a.header}>
          <div>
            <h1 className={a.title}>{title}</h1>
            {subtitle && <p className={a.subtitle}>{subtitle}</p>}
          </div>
          <div style={{ flex: 1 }} />
          <ThemeToggle />
        </header>
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
