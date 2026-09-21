import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  // Three-way theme: the system preference decides unless <html data-theme>
  // overrides it. Keep these selectors in step with the palette in globals.css.
  // The condition sits on the ancestor rather than on `&`: a utility such as
  // dark:file:bg-white/[0.1] ends in ::file-selector-button, and nothing may
  // follow a pseudo-element — appending :not(...) there is a CSS parse error.
  darkMode: [
    'variant',
    [
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }',
      ':root[data-theme="dark"] &',
    ],
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accentFg: 'rgb(var(--accent-fg) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
