import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { annualReport, availableYears } from '@/lib/reports';
import { Card, Empty, LinkButton, Stat } from '@/components/ui';
import { formatNok } from '@/lib/money';
import { fmtDate } from '@/lib/datetime';
import { STATUS_LABELS } from '@/lib/bookings';

export const metadata: Metadata = { title: 'Rapporter' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  await requireUser();
  const sp = await searchParams;

  const years = await availableYears();
  const year = Number(sp.ar) || years[0] || new Date().getFullYear();
  const report = await annualReport(year);

  const maxMonth = Math.max(1, ...report.months.map((m) => m.totalOre));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Inntektsrapport {year}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Bekreftede og fullførte bookinger, ført på året oppholdet avsluttes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.slice(0, 5).map((y) => (
            <Link
              key={y}
              href={`/rapporter?ar=${y}`}
              className={`tnum rounded-lg border px-3 py-2 text-sm transition ${
                y === year
                  ? 'border-accent bg-accent/10 font-medium text-accent'
                  : 'border-border hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              }`}
            >
              {y}
            </Link>
          ))}
          <LinkButton href={`/api/rapporter/${year}.csv`} variant="primary">
            Last ned CSV
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sum inntekt" value={formatNok(report.totalOre)} hint="Leie + strøm + tilbakeholdt depositum" />
        <Stat label="Leieinntekt" value={formatNok(report.rentOre)} hint={`${report.bookings} bookinger`} />
        <Stat label="Netter utleid" value={String(report.nights)} hint={`${report.occupancyPercent} % belegg`} />
        <Stat
          label="Utestående"
          value={formatNok(report.outstandingOre)}
          hint={report.outstandingOre > 0 ? 'Leie ikke registrert betalt' : 'Alt er betalt'}
        />
      </div>

      {report.depositHeldOre > 0 && (
        <Card title="Depositum">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Holdes for gjester nå</p>
              <p className="tnum text-lg font-semibold">{formatNok(report.depositHeldOre)}</p>
              <p className="text-xs text-muted">Skal tilbakebetales — ikke inntekt.</p>
            </div>
            <div>
              <p className="text-xs text-muted">Tilbakeholdt (trukket)</p>
              <p className="tnum text-lg font-semibold">{formatNok(report.depositWithheldOre)}</p>
              <p className="text-xs text-muted">Regnes som inntekt i summen over.</p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Per måned">
        <div className="space-y-1.5">
          {report.months.map((m) => (
            <div key={m.month} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted">{m.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-black/[0.04] dark:bg-white/[0.06]">
                {m.totalOre > 0 && (
                  <div
                    className="h-full rounded bg-accent/70"
                    style={{ width: `${Math.max(2, (m.totalOre / maxMonth) * 100)}%` }}
                  />
                )}
              </div>
              <span className="tnum w-14 shrink-0 text-right text-xs text-muted">{m.nights} n</span>
              <span className="tnum w-28 shrink-0 text-right">{m.totalOre > 0 ? formatNok(m.totalOre) : '—'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Bookinger" subtitle={`${report.rows.length} i rapporten`}>
        {report.rows.length === 0 ? (
          <Empty title={`Ingen bekreftede bookinger i ${year}`}>
            Bookinger telles med når status er Bekreftet eller Fullført.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Referanse</th>
                  <th className="py-2 pr-3 font-medium">Gjest</th>
                  <th className="py-2 pr-3 font-medium">Periode</th>
                  <th className="py-2 pr-3 text-right font-medium">Netter</th>
                  <th className="py-2 pr-3 text-right font-medium">Leie</th>
                  <th className="py-2 pr-3 text-right font-medium">Strøm</th>
                  <th className="py-2 pr-3 font-medium">Betalt</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.rows.map((r) => (
                  <tr key={r.reference}>
                    <td className="tnum py-2 pr-3">{r.reference}</td>
                    <td className="py-2 pr-3">{r.guestName}</td>
                    <td className="tnum py-2 pr-3 text-muted">
                      {fmtDate(r.checkIn)} – {fmtDate(r.checkOut)}
                    </td>
                    <td className="tnum py-2 pr-3 text-right text-muted">{r.nights}</td>
                    <td className="tnum py-2 pr-3 text-right">{formatNok(r.rentOre)}</td>
                    <td className="tnum py-2 pr-3 text-right text-muted">
                      {r.powerOre > 0 ? formatNok(r.powerOre) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs">{r.rentPaid ? 'Ja' : <span className="text-amber-600">Nei</span>}</td>
                    <td className="py-2 text-xs text-muted">{STATUS_LABELS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
