import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser, listLoginOperators } from '@/lib/auth';
import { ensureBootstrap } from '@/lib/bootstrap';
import { getSettings } from '@/lib/settings';
import { Alert } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Logg inn' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ gjenopprettet?: string }>;
}) {
  const { gjenopprettet } = await searchParams;
  if (await getCurrentUser()) redirect('/');

  let bootstrapError: string | null = null;
  try {
    await ensureBootstrap();
  } catch (err) {
    bootstrapError = err instanceof Error ? err.message : 'Oppstartskontroll feilet.';
  }

  const property = await getSettings('property').catch(() => ({ name: 'Hytta' }));
  // Tom liste med mindre SHOW_OPERATOR_PICKER er på. Feiler oppslaget, faller
  // skjemaet tilbake til e-postfeltet i stedet for å blokkere pålogging.
  const operators = bootstrapError ? [] : await listLoginOperators().catch(() => []);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{property.name || 'Hytteutleie'}</h1>
          <p className="mt-1 text-sm text-muted">Logg inn for å administrere bookinger</p>
        </div>

        {gjenopprettet && (
          <div className="mb-4">
            <Alert kind="success" title="Sikkerhetskopien er gjenopprettet">
              Brukerkontoene ble erstattet, så alle økter er avsluttet. Logg inn med passordet som gjaldt da
              sikkerhetskopien ble laget.
            </Alert>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-5">
          {bootstrapError ? <Alert kind="error" title="Oppsettet er ikke fullført">{bootstrapError}</Alert> : <LoginForm operators={operators} />}
        </div>
      </div>
    </main>
  );
}
