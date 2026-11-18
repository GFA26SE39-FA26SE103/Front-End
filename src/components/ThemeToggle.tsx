import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../styles/theme';
import { Button } from './ui';

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState(getTheme);
  const dark = theme === 'dark';

  function toggle() {
    const nextTheme: Theme = dark ? 'light' : 'dark';
    setTheme(nextTheme);
    setCurrentTheme(nextTheme);
  }

  return <Button variant={dark ? 'primary' : 'secondary'} aria-pressed={dark} onClick={toggle}>Dark mode</Button>;
}
