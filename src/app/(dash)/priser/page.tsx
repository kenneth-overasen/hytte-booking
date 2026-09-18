import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { Alert, Badge, Card, Empty, LinkButton } from '@/components/ui';
import { ConfirmForm } from '@/components/action-form';
import { formatNok } from '@/lib/money';
import { seasonLabel } from '@/lib/pricing';
import { WEEKDAY_NAMES_NB } from '@/lib/datetime';
import { describeWindow, easterWindow } from '@/lib/holidays';
import { deletePresetAction } from './actions';

export const metadata: Metadata = { title: 'Priser' };
export const dynamic = 'force-dynamic';

export default async function PresetsPage({
  searchParams,
}: {
  searchParams: Promise<{ lagret?: string; slettet?: string; deaktivert?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const [presets, season, defaults] = await Promise.all([
    prisma.preset.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { bookings: true } } },
    }),
    getSettings('season'),
    getSettings('bookingDefaults'),
  ]);

  const year = new Date().getFullYear();
  const easter = easterWindow(year, season);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Priser og regler</h1>
          <p className="mt-0.5 text-sm text-muted">
            Reglene avgjør hvilken pris og hvilke klokkeslett som foreslås når en booking registreres.
          </p>
        </div>
        <LinkButton href="/priser/ny" variant="primary">
          Ny prisregel
        </LinkButton>
      </div>

      {sp.lagret === '1' && <Alert kind="success">Prisregelen er lagret.</Alert>}
      {sp.slettet === '1' && <Alert kind="success">Prisregelen er slettet.</Alert>}
      {sp.deaktivert === '1' && (
        <Alert kind="info">
          Regelen er i bruk av eksisterende bookinger og ble derfor deaktivert i stedet for slettet.
        </Alert>
      )}

      <Card
        title="Sesongdefinisjoner"
        subtitle="Brukes til å avgjøre hvilken sesong et opphold faller i."
        actions={
          <Link href="/innstillinger?fane=sesong" className="text-xs text-accent underline">
            Endre
          </Link>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Sommer</dt>
            <dd className="tnum">{describeWindow(`2000-${season.summerStart}`, `2000-${season.summerEnd}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Jul og nyttår</dt>
            <dd className="tnum">{describeWindow(`2000-${season.christmasStart}`, `2000-${season.christmasEnd}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Påske {year} (beregnet)</dt>
            <dd className="tnum">{describeWindow(easter.start, easter.end)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Påsken beregnes automatisk for hvert år. En sesong gjelder når minst{' '}
          {Math.round(season.seasonThreshold * 100)} % av nettene faller innenfor perioden.
        </p>
      </Card>

      {presets.length === 0 ? (
        <Empty title="Ingen prisregler ennå">
          <Link href="/priser/ny" className="underline">
            Opprett den første
          </Link>
          , eller start appen på nytt for å få inn standardreglene.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Navn</th>
                <th className="px-4 py-2.5 font-medium">Sesong</th>
                <th className="px-4 py-2.5 text-right font-medium">Pris</th>
                <th className="px-4 py-2.5 text-right font-medium">Depositum</th>
                <th className="px-4 py-2.5 font-medium">Vilkår</th>
                <th className="px-4 py-2.5 font-medium">Tider</th>
                <th className="px-4 py-2.5 text-right font-medium">Prio</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {presets.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'opacity-55'}>
                  <td className="px-4 py-2.5">
                    <Link href={`/priser/${p.id}`} className="font-medium text-accent hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <Badge className="ml-2 bg-black/[0.06] dark:bg-white/[0.1]">Inaktiv</Badge>}
                    {p.description && <span className="block text-xs text-muted">{p.description}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{seasonLabel(p.season)}</td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {formatNok(p.priceOre)}
                    {p.pricingMode === 'PER_NIGHT' && <span className="block text-xs text-muted">per natt</span>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-muted">
                    {p.depositOre != null ? formatNok(p.depositOre) : formatNok(defaults.defaultDepositOre)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{describeConditions(p)}</td>
                  <td className="tnum px-4 py-2.5 text-xs text-muted">
                    {p.checkInTime ?? defaults.checkInTime} → {p.checkOutTime ?? defaults.checkOutTime}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-muted">{p.priority}</td>
                  <td className="px-4 py-2.5 text-right">
                    <ConfirmForm
                      action={deletePresetAction}
                      hidden={{ id: p.id }}
                      variant="ghost"
                      label="Slett"
                      confirm={
                        p._count.bookings > 0
                          ? `«${p.name}» brukes av ${p._count.bookings} booking(er) og blir deaktivert i stedet for slettet. Fortsette?`
                          : `Slette prisregelen «${p.name}»?`
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function describeConditions(p: {
  minNights: number | null;
  maxNights: number | null;
  startWeekday: number | null;
}): string {
  const parts: string[] = [];
  if (p.minNights != null && p.maxNights != null) {
    parts.push(p.minNights === p.maxNights ? `${p.minNights} netter` : `${p.minNights}–${p.maxNights} netter`);
  } else if (p.minNights != null) parts.push(`fra ${p.minNights} netter`);
  else if (p.maxNights != null) parts.push(`inntil ${p.maxNights} netter`);

  if (p.startWeekday != null) parts.push(`start ${WEEKDAY_NAMES_NB[p.startWeekday - 1]?.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'ingen begrensninger';
}
