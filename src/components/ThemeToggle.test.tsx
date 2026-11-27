import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => { document.documentElement.removeAttribute('data-theme'); window.localStorage.removeItem('shepherd.theme'); });

it('switches and persists the selected theme', () => {
  document.documentElement.dataset.theme = 'light';
  render(<ThemeToggle />);
  const toggle = screen.getByRole('switch', { name: 'Dark mode' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(window.localStorage.getItem('shepherd.theme')).toBe('dark');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(document.documentElement.dataset.theme).toBe('light');
});
