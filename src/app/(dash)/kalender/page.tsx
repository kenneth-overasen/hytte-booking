import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { Card, LinkButton } from '@/components/ui';
import { addDaysToKey, dateKeyToUtcNoon, osloDateKey, osloInstant, stayDateKeys } from '@/lib/datetime';
import { norwegianHolidays, seasonForDate } from '@/lib/holidays';
import { formatNok } from '@/lib/money';
import { STATUS_LABELS } from '@/lib/bookings';

export const metadata: Metadata = { title: 'Kalender' };
export const dynamic = 'force-dynamic';

const MONTHS = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

const SEASON_TINT: Record<string, string> = {
  EASTER: 'bg-violet-50 dark:bg-violet-500/10',
  CHRISTMAS: 'bg-rose-50 dark:bg-rose-500/10',
  SUMMER: 'bg-amber-50 dark:bg-amber-500/10',
  OFFSEASON: '',
};

const STATUS_BAR: Record<string, string> = {
  TENTATIVE: 'bg-amber-400 dark:bg-amber-500',
  CONFIRMED: 'bg-emerald-500 dark:bg-emerald-500',
  COMPLETED: 'bg-slate-400 dark:bg-slate-500',
  CANCELLED: 'bg-rose-300 dark:bg-rose-500/60',
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ar?: string; maned?: string }> }) {
  await requireUser();
  const sp = await searchParams;

  const today = new Date();
  const year = Number(sp.ar) || today.getFullYear();
  const month = Number(sp.maned) || today.getMonth() + 1;
  const safeMonth = Math.min(12, Math.max(1, month));

  const monthStartKey = `${year}-${String(safeMonth).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, safeMonth, 0)).getUTCDate();
  const monthEndKey = `${year}-${String(safeMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Pad to whole weeks, Monday-first.
  const firstWeekday = ((dateKeyToUtcNoon(monthStartKey).getUTCDay() + 6) % 7) + 1;
  const gridStart = addDaysToKey(monthStartKey, -(firstWeekday - 1));
  const lastWeekday = ((dateKeyToUtcNoon(monthEndKey).getUTCDay() + 6) % 7) + 1;
  const gridEnd = addDaysToKey(monthEndKey, 7 - lastWeekday);

  const [bookings, seasonCfg, caldav] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: { not: 'CANCELLED' },
        checkIn: { lt: osloInstant(addDaysToKey(gridEnd, 1), '00:00') },
        checkOut: { gt: osloInstant(gridStart, '00:00') },
      },
      orderBy: { checkIn: 'asc' },
    }),
    getSettings('season'),
    getSettings('caldav'),
  ]);

  // Map every occupied date to its booking.
  const byDate = new Map<string, typeof bookings>();
  for (const b of bookings) {
    for (const key of stayDateKeys(b.checkIn, b.checkOut)) {
      const list = byDate.get(key) ?? [];
      list.push(b);
      byDate.set(key, list);
    }
  }

  const holidayMap = new Map(
    [year - 1, year, year + 1].flatMap((y) => norwegianHolidays(y)).map((h) => [h.date, h] as const),
  );

  const cells: string[] = [];
  for (let key = gridStart; key <= gridEnd; key = addDaysToKey(key, 1)) cells.push(key);

  const prev = safeMonth === 1 ? { ar: year - 1, maned: 12 } : { ar: year, maned: safeMonth - 1 };
  const next = safeMonth === 12 ? { ar: year + 1, maned: 1 } : { ar: year, maned: safeMonth + 1 };
  const todayKey = osloDateKey(today);

  const monthBookings = bookings.filter((b) =>
    stayDateKeys(b.checkIn, b.checkOut).some((k) => k >= monthStartKey && k <= monthEndKey),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {MONTHS[safeMonth - 1]} {year}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {monthBookings.length} {monthBookings.length === 1 ? 'booking' : 'bookinger'} denne måneden
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/kalender?ar=${prev.ar}&maned=${prev.maned}`}>Forrige</LinkButton>
          <LinkButton href="/kalender">I dag</LinkButton>
          <LinkButton href={`/kalender?ar=${next.ar}&maned=${next.maned}`}>Neste</LinkButton>
          <LinkButton href="/api/kalender/feed.ics" variant="secondary">
            Last ned .ics
          </LinkButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b border-border text-xs text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 font-medium">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((key) => {
              const inMonth = key >= monthStartKey && key <= monthEndKey;
              const dayBookings = byDate.get(key) ?? [];
              const holiday = holidayMap.get(key);
              const season = seasonForDate(key, seasonCfg);
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={`min-h-[5.5rem] border-b border-r border-border p-1.5 ${
                    inMonth ? SEASON_TINT[season] : 'bg-black/[0.02] dark:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <Link
                      href={`/bookinger/ny?dato=${key}`}
                      className={`tnum rounded px-1 text-xs transition hover:bg-black/[0.06] dark:hover:bg-white/[0.08] ${
                        inMonth ? '' : 'text-muted/50'
                      } ${isToday ? 'bg-accent font-semibold text-white hover:bg-accent' : ''} ${
                        holiday?.redDay ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                      title={inMonth ? 'Opprett booking denne dagen' : undefined}
                    >
                      {Number(key.slice(8))}
                    </Link>
                    {holiday && (
                      <span className="truncate text-[10px] leading-tight text-muted" title={holiday.name}>
                        {holiday.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {dayBookings.map((b) => (
                      <Link
                        key={b.id}
                        href={`/bookinger/${b.id}`}
                        className="block truncate rounded px-1 py-0.5 text-[11px] leading-tight text-white transition hover:opacity-90"
                        title={`${b.reference} — ${b.guestName} (${STATUS_LABELS[b.status]})`}
                      >
                        <span className={`block truncate rounded px-1 ${STATUS_BAR[b.status]}`}>{b.guestName}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <Legend className="bg-emerald-500" label="Bekreftet" />
        <Legend className="bg-amber-400" label="Foreløpig" />
        <Legend className="bg-slate-400" label="Fullført" />
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-violet-100 dark:bg-violet-500/25" /> Påske
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-rose-100 dark:bg-rose-500/25" /> Jul/nyttår
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-500/25" /> Sommer
        </span>
      </div>

      <Card title="Bookinger i perioden">
        {monthBookings.length === 0 ? (
          <p className="text-sm text-muted">Ingen bookinger denne måneden.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {monthBookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/bookinger/${b.id}`} className="font-medium hover:underline">
                  {b.guestName}
                </Link>
                <span className="tnum text-xs text-muted">
                  {osloDateKey(b.checkIn).split('-').reverse().join('.')} –{' '}
                  {osloDateKey(b.checkOut).split('-').reverse().join('.')}
                </span>
                <span className="tnum text-xs">{formatNok(b.priceOre)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!caldav.enabled && (
        <p className="text-xs text-muted">
          Tips: aktiver iCloud-synk under{' '}
          <Link href="/innstillinger?fane=kalender" className="underline">
            Innstillinger → Kalender
          </Link>{' '}
          for å få bookingene rett inn i telefonkalenderen.
        </p>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${className}`} /> {label}
    </span>
  );
}
