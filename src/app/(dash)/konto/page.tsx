import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Alert, Card } from '@/components/ui';
import { fmtDateTime } from '@/lib/datetime';
import { passwordPolicy } from '@/lib/password';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Min konto' };
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ forste?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/logg-inn');
  const { forste } = await searchParams;
  const policy = passwordPolicy();

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    take: 10,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Min konto</h1>
        <p className="mt-0.5 text-sm text-muted">
          {user.name} · {user.email} · {user.role === 'ADMIN' ? 'Administrator' : 'Operatør'}
        </p>
      </div>

      {forste === '1' && (
        <Alert kind="warning" title="Velg et nytt passord">
          Kontoen bruker fortsatt passordet fra oppsettet. Sett et eget passord før du går videre.
        </Alert>
      )}

      <Card title="Endre passord">
        <PasswordForm policy={policy} />
      </Card>

      <Card title="Aktive pålogginger" subtitle="Å endre passordet logger ut alle andre økter.">
        <ul className="divide-y divide-border text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="tnum text-muted">{fmtDateTime(s.lastSeenAt)}</span>
              <span className="text-xs text-muted">{s.ip ?? 'ukjent adresse'}</span>
              <span className="w-full truncate text-xs text-muted sm:w-auto sm:max-w-md">{s.userAgent ?? '—'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
