import type { Booking } from '@prisma/client';
import { Alert, Badge } from '@/components/ui';
import { formatNok } from '@/lib/money';
import { fmtDate } from '@/lib/datetime';

/**
 * What the guest actually gets back: the deposit less the power bill and any
 * other deductions. Derived on the fly rather than stored, so it can never
 * drift out of step with the figures it is built from.
 */
export function settleDeposit(booking: Booking) {
  const deposit = booking.depositOre;
  const power = booking.powerFromDeposit ? (booking.powerChargedOre ?? 0) : 0;
  const other = booking.depositWithheldOre;
  const balance = deposit - power - other;

  return {
    deposit,
    power,
    other,
    /** Paid back to the guest; zero when the deductions swallow the deposit. */
    payout: Math.max(0, balance),
    /** Still owed by the guest when the deductions exceed the deposit. */
    shortfall: Math.max(0, -balance),
    hasDeductions: power > 0 || other > 0,
  };
}

type Segment = { label: string; ore: number; bar: string; dot: string };

export function DepositSettlement({ booking }: { booking: Booking }) {
  const s = settleDeposit(booking);

  if (s.deposit === 0) {
    return <p className="text-sm text-muted">Ingen depositum er avtalt for denne bookingen.</p>;
  }

  const segments: Segment[] = [
    { label: 'Til utbetaling', ore: s.payout, bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { label: 'Strøm', ore: s.power, bar: 'bg-amber-400', dot: 'bg-amber-400' },
    { label: 'Andre trekk', ore: s.other, bar: 'bg-rose-400', dot: 'bg-rose-400' },
  ].filter((seg) => seg.ore > 0);

  // The bar shows proportions of the deposit; a shortfall is called out separately.
  const barTotal = Math.max(s.deposit, s.power + s.other);

  return (
    <div className="space-y-4">
      {!booking.depositPaid && (
        <Alert kind="warning">
          Depositumet er ikke registrert som innbetalt ennå. Tallene under viser hva oppgjøret blir når det er det.
        </Alert>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted">Depositum</span>
          <span className="tnum text-sm">{formatNok(s.deposit)}</span>
        </div>

        <div className="mt-2 flex h-6 w-full overflow-hidden rounded-md bg-black/[0.06] dark:bg-white/[0.08]">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={seg.bar}
              style={{ width: `${Math.max(2, (seg.ore / barTotal) * 100)}%` }}
              title={`${seg.label}: ${formatNok(seg.ore)}`}
            />
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {segments.map((seg) => (
            <span key={seg.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${seg.dot}`} />
              {seg.label}
            </span>
          ))}
        </div>
      </div>

      <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
        <Line label="Depositum innbetalt" ore={s.deposit} />

        {s.power > 0 && (
          <Line
            label="Strøm"
            ore={-s.power}
            note={booking.powerKwh != null ? `${booking.powerKwh} kWh` : undefined}
          />
        )}
        {booking.powerChargedOre != null && !booking.powerFromDeposit && (
          <p className="pt-0.5 text-xs text-muted">
            Strøm på {formatNok(booking.powerChargedOre)} faktureres separat, ikke trukket fra depositumet.
          </p>
        )}

        {s.other > 0 && <Line label="Andre trekk" ore={-s.other} note={booking.depositNote ?? undefined} />}

        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <dt className="text-sm font-medium">{s.shortfall > 0 ? 'Gjesten skylder' : 'Til utbetaling'}</dt>
          <dd className={`tnum text-lg font-semibold ${s.shortfall > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
            {formatNok(s.shortfall > 0 ? s.shortfall : s.payout)}
          </dd>
        </div>
      </dl>

      {s.shortfall > 0 && (
        <Alert kind="error" title="Trekkene overstiger depositumet">
          Depositumet dekker ikke strøm og øvrige trekk. Differansen på {formatNok(s.shortfall)} må kreves inn
          særskilt.
        </Alert>
      )}

      {booking.depositReturned ? (
        <Badge className="bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300">
          Tilbakebetalt{booking.depositReturnedAt ? ` ${fmtDate(booking.depositReturnedAt)}` : ''}
        </Badge>
      ) : (
        booking.depositPaid &&
        s.payout > 0 && (
          <p className="text-xs text-muted">
            Marker depositumet som tilbakebetalt i skjemaet over når {formatNok(s.payout)} er utbetalt.
          </p>
        )
      )}
    </div>
  );
}

function Line({ label, ore, note }: { label: string; ore: number; note?: string }) {
  const negative = ore < 0;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">
        {label}
        {note && <span className="ml-1.5 text-muted/70">({note})</span>}
      </dt>
      <dd className={`tnum text-sm ${negative ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {negative ? `− ${formatNok(-ore)}` : formatNok(ore)}
      </dd>
    </div>
  );
}
