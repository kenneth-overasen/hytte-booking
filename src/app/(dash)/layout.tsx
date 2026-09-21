import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { ensureBootstrap } from '@/lib/bootstrap';
import { getSettings } from '@/lib/settings';
import { Nav, NAV_ITEMS } from '@/components/nav';
import { Logo } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureBootstrap();
  // The password-change gate lives in requireUser(), which each page calls;
  // doing it here would redirect /konto to itself forever.
  const user = await requireSession();

  const property = await getSettings('property');

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <Link href="/" className="mr-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Logo size={26} />
            {property.name || 'Hytteutleie'}
          </Link>

          <Nav items={NAV_ITEMS} />

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/konto"
              className="hidden text-xs text-muted transition hover:text-fg sm:block"
              title={user.role === 'ADMIN' ? 'Administrator' : 'Operatør'}
            >
              {user.name}
              <span className="ml-1.5 rounded bg-black/[0.06] px-1.5 py-0.5 dark:bg-white/[0.08]">
                {user.role === 'ADMIN' ? 'Admin' : 'Operatør'}
              </span>
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
              >
                Logg ut
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
