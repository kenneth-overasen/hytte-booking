import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Hytteutleie', template: '%s · Hytteutleie' },
  description: 'Booking, kontrakter og regnskap for utleie av fritidsbolig.',
  robots: { index: false, follow: false },
  // The logo files double as favicon and touch icon. The browser picks by the
  // system preference only — a tab icon cannot follow the in-app toggle.
  icons: {
    icon: [
      { url: '/logo.png', media: '(prefers-color-scheme: light)' },
      { url: '/logo-dark.png', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#141514' },
  ],
};

/*
 * Applies a pinned theme before the first paint, so a dark-mode user does not
 * get a white flash on every navigation. It has to be inline and it has to run
 * before the body renders, which rules out a component. Absence of the key
 * means "follow the system", which is what the CSS already does on its own.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('tema');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
