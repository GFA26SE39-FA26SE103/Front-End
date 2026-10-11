import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, loadSession } from '../auth/session';
import { Icon } from './Icon';
import s from './AccountMenu.module.css';

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const logout = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const navigate = useNavigate();
  const user = loadSession()?.user;

  useEffect(() => {
    if (!open) return;
    logout.current?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && root.current?.contains(document.activeElement)) {
        event.preventDefault();
        logout.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [open]);

  return <div className={s.root} ref={root}>
    <button
      type="button" className={s.trigger} ref={trigger} aria-label="Account menu" title="Account menu"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          logout.current?.focus();
        }
      }}
    ><Icon name="header-user" size={19} /></button>
    {open && <div className={s.menu} id={menuId} role="menu" aria-label="Account">
      <div className={s.identity} role="presentation">
        <p className={s.name}>{user?.fullName || 'Account'}</p>
        {user?.email && <p className={s.email}>{user.email}</p>}
      </div>
      <button type="button" className={s.logout} ref={logout} role="menuitem" onClick={() => {
        clearSession();
        setOpen(false);
        navigate('/login', { replace: true });
      }}>Logout</button>
    </div>}
  </div>;
}
