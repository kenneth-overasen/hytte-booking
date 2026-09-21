'use client';

import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

/** localStorage key. Also read by the inline script in the root layout. */
export const THEME_KEY = 'tema';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABELS: Record<Theme, string> = { system: 'System', light: 'Lys', dark: 'Mørk' };

function apply(theme: Theme): void {
  const root = document.documentElement;
  // Removing the attribute hands control back to prefers-color-scheme; the
  // palette in globals.css is written so that absence means "follow the system".
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

function stored(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    // Private mode, or storage blocked: the toggle still works for this page view.
    return 'system';
  }
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  // The server cannot know the stored choice, so the first paint says "System"
  // and the effect corrects it. The inline script has already set the attribute
  // by then, so nothing flashes — only this button's own label settles.
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => setTheme(stored()), []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to persist to; the choice lasts until the page is reloaded.
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Tema: ${LABELS[theme]} — klikk for å bytte`}
      aria-label={`Tema: ${LABELS[theme]}. Klikk for å bytte.`}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg ${className}`}
    >
      <ThemeIcon theme={theme} />
      <span className="hidden sm:inline">{LABELS[theme]}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </svg>
  );
}
