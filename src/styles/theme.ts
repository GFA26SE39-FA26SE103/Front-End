export type Theme = 'light' | 'dark';

const storageKey = 'shepherd.theme';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function initializeTheme(): void {
  let storedTheme: string | null = null;
  try {
    storedTheme = window.localStorage.getItem(storageKey);
  } catch {
    // The system preference still applies when browser storage is unavailable.
  }

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const systemTheme = prefersDark ? 'dark' : 'light';
  document.documentElement.dataset.theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : systemTheme;
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Theme switching still works for the current page.
  }
}
