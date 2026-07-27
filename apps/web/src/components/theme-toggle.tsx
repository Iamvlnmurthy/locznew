'use client';

import { Icon } from './icons';

const THEME_KEY = 'locz-theme';

export function ThemeToggle({ label, className = '' }: { label: string; className?: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
  }

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle__sun">
        <Icon name="sun" width="17" height="17" />
      </span>
      <span className="theme-toggle__moon">
        <Icon name="moon" width="17" height="17" />
      </span>
    </button>
  );
}
