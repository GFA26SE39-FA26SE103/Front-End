import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { AccountMenu } from './AccountMenu';
import s from './AdminLayout.module.css';

const NAV = [
  { to: '/manager/schedule', label: 'Schedule', icon: 'nav-grid', activeIcon: 'nav-grid-active' },
  { to: '/manager/swaps', label: 'Swap requests', icon: 'nav-users', activeIcon: 'nav-users-active' },
  { to: '/manager/leave', label: 'Leave', icon: 'nav-file' },
  { to: '/manager/shifts', label: 'Shift templates', icon: 'rule-clock' },
];

/** The Manager console: same shell as the Admin console, with the MF-04 planning pages. */
export function ManagerLayout({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.shell}>
      <nav className={s.nav} aria-label="Manager">
        <div className={s.brand}>
          <Icon name="brand-grid" size={18} />
          <p>
            <span>SUPERMARKET</span>
            <span>OPS</span>
          </p>
        </div>
        <p className={s.section}>MANAGER</p>
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
          {actions}
          <AccountMenu />
        </header>
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
