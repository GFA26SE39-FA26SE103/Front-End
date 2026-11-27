import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../styles/theme';
import s from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState(getTheme);
  const dark = theme === 'dark';

  function toggle() {
    const nextTheme: Theme = dark ? 'light' : 'dark';
    setTheme(nextTheme);
    setCurrentTheme(nextTheme);
  }

  return <button type="button" className={s.toggle} role="switch" aria-label="Dark mode" aria-checked={dark} onClick={toggle}>
    <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42M6.35 17.65l-1.42 1.42"/></svg>
    <span className={s.track}><span className={s.thumb} /></span>
    <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z"/></svg>
  </button>;
}
