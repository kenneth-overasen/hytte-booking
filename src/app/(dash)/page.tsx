import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { annualReport } from '@/lib/reports';
import { getSettings } from '@/lib/settings';
import { Alert, Badge, Card, Empty, LinkButton, Stat } from '@/components/ui';
import { STATUS_CLASSES, STATUS_LABELS } from '@/lib/bookings';
import { fmtDate, nightsBetween, osloDateKey } from '@/lib/datetime';
import { formatNok } from '@/lib/money';
import { easterWindow } from '@/lib/holidays';

export const metadata: Metadata = { title: 'Oversikt' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ feil?: string }> }) {
  const user = await requireUser();
  const { feil } = await searchParams;
  const now = new Date();
  const year = now.getFullYear();

  const [upcoming, current, report, unpaidDeposits, unsyncedCount, season, smtp] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: { gte: now }, status: { in: ['TENTATIVE', 'CONFIRMED'] } },
      orderBy: { checkIn: 'asc' },
      take: 6,
    }),
    prisma.booking.findMany({
      where: { checkIn: { lte: now }, checkOut: { gte: now }, status: { not: 'CANCELLED' } },
    }),
    annualReport(year),
    prisma.booking.findMany({
      where: { depositPaid: false, depositOre: { gt: 0 }, status: { in: ['TENTATIVE', 'CONFIRMED'] }, checkOut: { gte: now } },
      orderBy: { checkIn: 'asc' },
      take: 5,
    }),
    prisma.booking.count({ where: { calendarDirty: true, status: { not: 'CANCELLED' } } }),
    getSettings('season'),
    getSettings('smtp'),
  ]);

  const easter = easterWindow(year + (now > new Date(`${year}-06-01`) ? 1 : 0), season);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Oversikt</h1>
          <p className="mt-0.5 text-sm text-muted">Hei {user.name.split(' ')[0]} — her er status akkurat nå.</p>
        </div>
        <LinkButton href="/bookinger/ny" variant="primary">
          Ny booking
        </LinkButton>
      </div>

      {feil === 'admin-kreves' && (
        <Alert kind="warning">Den siden krever administratortilgang. Du er logget inn som operatør.</Alert>
      )}

      {current.length > 0 && (
        <Alert kind="info" title="Gjester på hytta nå">
          {current.map((b) => (
            <p key={b.id}>
              <Link href={`/bookinger/${b.id}`} className="underline">
                {b.guestName}
              </Link>{' '}
              — reiser {fmtDate(b.checkOut)}
            </p>
          ))}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Inntekt ${year}`} value={formatNok(report.totalOre)} hint={`${report.bookings} bookinger`} />
        <Stat label="Belegg" value={`${report.occupancyPercent} %`} hint={`${report.nights} netter`} />
        <Stat
          label="Utestående leie"
          value={formatNok(report.outstandingOre)}
          hint={report.outstandingOre > 0 ? 'Følg opp betaling' : 'Alt betalt'}
        />
        <Stat label="Depositum holdt" value={formatNok(report.depositHeldOre)} hint="Skal tilbakebetales" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Kommende bookinger" actions={<Link href="/bookinger" className="text-xs text-accent underline">Se alle</Link>}>
          {upcoming.length === 0 ? (
            <Empty title="Ingen kommende bookinger">
              <Link href="/bookinger/ny" className="underline">
                Registrer den første
              </Link>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/bookinger/${b.id}`} className="text-sm font-medium hover:underline">
                      {b.guestName}
                    </Link>
                    <span className="tnum block text-xs text-muted">
                      {fmtDate(b.checkIn)} – {fmtDate(b.checkOut)} · {nightsBetween(b.checkIn, b.checkOut)} netter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-sm">{formatNok(b.priceOre)}</span>
                    <Badge className={STATUS_CLASSES[b.status]}>{STATUS_LABELS[b.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Trenger oppfølging">
            <ul className="space-y-2 text-sm">
              {unpaidDeposits.length === 0 && unsyncedCount === 0 && !smtp.enabled && (
                <li className="text-muted">Ingenting haster akkurat nå.</li>
              )}
              {unpaidDeposits.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    Depositum utestående —{' '}
                    <Link href={`/bookinger/${b.id}`} className="underline">
                      {b.guestName}
                    </Link>
                  </span>
                  <span className="tnum text-xs text-muted">
                    {formatNok(b.depositOre)} · innsjekk {fmtDate(b.checkIn)}
                  </span>
                </li>
              ))}
              {unsyncedCount > 0 && (
                <li>
                  {unsyncedCount} booking(er) er ikke synkronisert til kalenderen —{' '}
                  <Link href="/innstillinger?fane=kalender" className="underline">
                    synkroniser
                  </Link>
                </li>
              )}
              {!smtp.enabled && (
                <li className="text-muted">
                  E-postvarsling er ikke satt opp.{' '}
                  {user.role === 'ADMIN' ? (
                    <Link href="/innstillinger?fane=epost" className="underline">
                      Konfigurer
                    </Link>
                  ) : (
                    'Be en administrator om å sette det opp.'
                  )}
                </li>
              )}
            </ul>
          </Card>

          <Card title="Nyttig å vite">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Påske neste gang</dt>
                <dd className="tnum">
                  {fmtDate(new Date(`${easter.start}T12:00:00Z`))} – {fmtDate(new Date(`${easter.end}T12:00:00Z`))}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Sommerperiode</dt>
                <dd className="tnum">
                  {season.summerStart.split('-').reverse().join('.')} – {season.summerEnd.split('-').reverse().join('.')}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">I dag</dt>
                <dd className="tnum">{osloDateKey(now).split('-').reverse().join('.')}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
