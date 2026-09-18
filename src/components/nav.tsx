'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type NavItem = { href: string; label: string; adminOnly?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Oversikt' },
  { href: '/bookinger', label: 'Bookinger' },
  { href: '/kalender', label: 'Kalender' },
  { href: '/priser', label: 'Priser' },
  { href: '/rapporter', label: 'Rapporter' },
  { href: '/innstillinger', label: 'Innstillinger' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hovedmeny"
        className="rounded-lg border border-border px-3 py-1.5 text-sm md:hidden"
      >
        Meny
      </button>

      <nav
        id="hovedmeny"
        className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-1 pt-2 md:flex md:w-auto md:flex-row md:items-center md:gap-1 md:pt-0`}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                active
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
