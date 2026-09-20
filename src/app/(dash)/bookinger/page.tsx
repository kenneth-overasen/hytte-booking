import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { Alert, Badge, Card, Empty, LinkButton } from '@/components/ui';
import { STATUS_CLASSES, STATUS_LABELS } from '@/lib/bookings';
import { fmtDate, nightsBetween, osloDateKey } from '@/lib/datetime';
import { formatNok } from '@/lib/money';
import { BookingFilters } from './booking-filters';

export const metadata: Metadata = { title: 'Bookinger' };
export const dynamic = 'force-dynamic';

type Search = { q?: string; status?: string; periode?: string; slettet?: string };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const { q = '', status = '', periode = 'kommende', slettet } = await searchParams;

  const where: Prisma.BookingWhereInput = {};
  if (q.trim()) {
    where.OR = [
      { guestName: { contains: q.trim(), mode: 'insensitive' } },
      { email: { contains: q.trim(), mode: 'insensitive' } },
      { phone: { contains: q.trim() } },
      { reference: { contains: q.trim(), mode: 'insensitive' } },
    ];
  }
  if (status) where.status = status as Prisma.EnumBookingStatusFilter['equals'];
  if (periode === 'kommende') where.checkOut = { gte: new Date() };
  else if (periode === 'tidligere') where.checkOut = { lt: new Date() };
  else if (/^\d{4}$/.test(periode)) {
    where.checkIn = { gte: new Date(`${periode}-01-01T00:00:00Z`), lt: new Date(`${Number(periode) + 1}-01-01T00:00:00Z`) };
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: periode === 'tidligere' ? { checkIn: 'desc' } : { checkIn: 'asc' },
    take: 300,
  });

  const years = [...new Set(bookings.map((b) => osloDateKey(b.checkIn).slice(0, 4)))];
  const currentYear = new Date().getFullYear();
  const yearOptions = [...new Set([...years, String(currentYear), String(currentYear - 1)])].sort().reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Bookinger</h1>
          <p className="mt-0.5 text-sm text-muted">
            {bookings.length} {bookings.length === 1 ? 'booking' : 'bookinger'} i utvalget
          </p>
        </div>
        <LinkButton href="/bookinger/ny" variant="primary">
          Ny booking
        </LinkButton>
      </div>

      {slettet === '1' && <Alert kind="success">Bookingen er slettet.</Alert>}

      <Card>
        <BookingFilters
          q={q}
          status={status}
          periode={periode}
          statusOptions={Object.entries(STATUS_LABELS)}
          yearOptions={yearOptions}
        />
      </Card>

      {bookings.length === 0 ? (
        <Empty title="Ingen bookinger i dette utvalget">
          Juster filteret, eller <Link href="/bookinger/ny" className="underline">opprett en ny booking</Link>.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Referanse</th>
                <th className="px-4 py-2.5 font-medium">Gjest</th>
                <th className="px-4 py-2.5 font-medium">Periode</th>
                <th className="px-4 py-2.5 text-right font-medium">Netter</th>
                <th className="px-4 py-2.5 text-right font-medium">Leie</th>
                <th className="px-4 py-2.5 font-medium">Depositum</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((b) => (
                <tr key={b.id} className="transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link href={`/bookinger/${b.id}`} className="tnum font-medium text-accent hover:underline">
                      {b.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/bookinger/${b.id}`} className="hover:underline">
                      {b.guestName}
                    </Link>
                    {b.email && <span className="block text-xs text-muted">{b.email}</span>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-muted">
                    {fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-muted">{nightsBetween(b.checkIn, b.checkOut)}</td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {formatNok(b.priceOre)}
                    {b.priceOverridden && <span className="ml-1 text-xs text-muted" title="Manuelt overstyrt">*</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <DepositCell paid={b.depositPaid} returned={b.depositReturned} amountOre={b.depositOre} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={STATUS_CLASSES[b.status]}>{STATUS_LABELS[b.status]}</Badge>
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

function DepositCell({ paid, returned, amountOre }: { paid: boolean; returned: boolean; amountOre: number }) {
  if (amountOre === 0) return <span className="text-xs text-muted">—</span>;
  if (returned) return <Badge className="bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300">Tilbakebetalt</Badge>;
  if (paid) return <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300">Innbetalt</Badge>;
  return <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">Utestående</Badge>;
}
