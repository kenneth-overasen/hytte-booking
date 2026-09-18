'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { saveBookingAction, type BookingFormState } from './actions';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { formatKroner, formatNok, parseKronerToOre } from '@/lib/money';

export type PresetOption = {
  id: string;
  name: string;
  season: string;
  pricingMode: string;
  priceOre: number;
  depositOre: number | null;
  minNights: number | null;
  maxNights: number | null;
  startWeekday: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
};

export type BookingFormValues = {
  guestName: string;
  phone: string;
  email: string;
  address: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  guests: number | null;
  status: string;
  presetId: string;
  priceOre: number;
  priceOverridden: boolean;
  overrideReason: string;
  depositOre: number;
  depositPaid: boolean;
  depositReturned: boolean;
  depositWithheldOre: number;
  depositNote: string;
  powerFromDeposit: boolean;
  rentPaid: boolean;
  notes: string;
};

type QuoteResponse = {
  nights: number;
  season: string;
  seasonExplanation: string;
  holidays: { date: string; name: string }[];
  priceOre: number;
  depositOre: number;
  checkInTime: string;
  checkOutTime: string;
  source: 'preset' | 'fallback';
  breakdown: string;
  preset: { id: string; name: string } | null;
  candidates: { id: string; name: string; eligible: boolean; priceOre: number; reasons: string[] }[];
  conflicts: { reference: string; guestName: string; checkIn: string; checkOut: string }[];
  adjacent: { reference: string; guestName: string; checkIn: string; checkOut: string; endsBefore: boolean }[];
};

const SEASON_LABELS: Record<string, string> = {
  SUMMER: 'Sommer',
  EASTER: 'Påske',
  CHRISTMAS: 'Jul/nyttår',
  OFFSEASON: 'Lavsesong',
  ANY: 'Alle',
};

const MIN_NIGHTS = 2;

function nightsBetween(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!, 12);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function BookingForm({
  presets,
  initial,
  bookingId,
}: {
  presets: PresetOption[];
  initial: BookingFormValues;
  bookingId?: string;
}) {
  const [state, action, pending] = useActionState<BookingFormState, FormData>(saveBookingAction, {});

  const [checkInDate, setCheckInDate] = useState(initial.checkInDate);
  const [checkInTime, setCheckInTime] = useState(initial.checkInTime);
  const [checkOutDate, setCheckOutDate] = useState(initial.checkOutDate);
  const [checkOutTime, setCheckOutTime] = useState(initial.checkOutTime);
  const [presetId, setPresetId] = useState(initial.presetId);

  const [override, setOverride] = useState(initial.priceOverridden);
  const [price, setPrice] = useState(formatKroner(initial.priceOre));
  const [deposit, setDeposit] = useState(formatKroner(initial.depositOre));
  const [depositTouched, setDepositTouched] = useState(Boolean(bookingId));
  // An existing booking keeps the times it was agreed on; a new one follows the
  // matched rule until the operator edits a time field.
  const [timesTouched, setTimesTouched] = useState(Boolean(bookingId));

  const [depositPaid, setDepositPaid] = useState(initial.depositPaid);
  const [depositReturned, setDepositReturned] = useState(initial.depositReturned);

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const selectedPreset = useMemo(() => presets.find((p) => p.id === presetId) ?? null, [presets, presetId]);
  const fieldErrors = state.fieldErrors ?? {};

  /** Selecting a preset pulls in its times and, for fixed-length stays, its end date. */
  const applyPreset = useCallback(
    (id: string) => {
      setPresetId(id);
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      if (preset.checkInTime) setCheckInTime(preset.checkInTime);
      if (preset.checkOutTime) setCheckOutTime(preset.checkOutTime);
      // Use the shortest allowed stay as the suggested length; the operator can
      // extend it afterwards and the price follows.
      if (preset.minNights && checkInDate) setCheckOutDate(addDays(checkInDate, preset.minNights));
    },
    [presets, checkInDate],
  );

  /**
   * Moving the check-in date drags the check-out date with it, keeping the
   * current length of stay (never fewer than two nights). Without this the end
   * date is left behind and every date change needs two edits.
   */
  const changeCheckIn = useCallback(
    (next: string) => {
      setCheckInDate(next);
      if (!next) return;
      const current = checkOutDate ? nightsBetween(checkInDate, checkOutDate) : 0;
      const preset = presets.find((p) => p.id === presetId);
      const nights = Math.max(MIN_NIGHTS, preset?.minNights ?? current ?? MIN_NIGHTS);
      setCheckOutDate(addDays(next, nights));
    },
    [checkInDate, checkOutDate, presetId, presets],
  );

  // Debounced live quote whenever the stay definition changes.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!checkInDate || !checkOutDate || !checkInTime || !checkOutTime) return;
    if (`${checkOutDate}T${checkOutTime}` <= `${checkInDate}T${checkInTime}`) {
      setQuote(null);
      setQuoteError('Utsjekk må være etter innsjekk.');
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingQuote(true);
      try {
        const res = await fetch('/api/kvote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkInDate,
            checkInTime,
            checkOutDate,
            checkOutTime,
            presetId: presetId || null,
            excludeBookingId: bookingId ?? null,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Kunne ikke beregne pris.');
        setQuote(data as QuoteResponse);
        setQuoteError(null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setQuoteError(err instanceof Error ? err.message : 'Kunne ikke beregne pris.');
      } finally {
        setLoadingQuote(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [checkInDate, checkInTime, checkOutDate, checkOutTime, presetId, bookingId]);

  // Auto-fill from the quote unless the operator has taken control. The preset
  // dropdown is deliberately NOT auto-selected: leaving it on "Automatisk" lets
  // the rule be re-evaluated every time the dates change. The matched rule is
  // shown in the calculation panel instead.
  useEffect(() => {
    if (!quote) return;
    if (!override) setPrice(formatKroner(quote.priceOre));
    if (!depositTouched) setDeposit(formatKroner(quote.depositOre));
    if (!timesTouched) {
      if (quote.checkInTime !== checkInTime) setCheckInTime(quote.checkInTime);
      if (quote.checkOutTime !== checkOutTime) setCheckOutTime(quote.checkOutTime);
    }
  }, [quote, override, depositTouched, timesTouched, checkInTime, checkOutTime]);

  const priceOre = parseKronerToOre(price) ?? 0;
  const differsFromSuggestion = quote != null && priceOre !== quote.priceOre;

  return (
    <form action={action} className="space-y-5">
      {bookingId && <input type="hidden" name="id" value={bookingId} />}

      {state.error && (
        <Alert kind="error" title={state.error}>
          {state.conflicts && state.conflicts.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {state.conflicts.map((c) => (
                <li key={c.reference}>
                  {c.reference} — {c.guestName}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card title="Gjest">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Navn" required error={fieldErrors.guestName} className="sm:col-span-2">
                <Input name="guestName" defaultValue={initial.guestName} required autoComplete="off" />
              </Field>
              <Field label="Telefon" error={fieldErrors.phone}>
                <Input name="phone" type="tel" defaultValue={initial.phone} autoComplete="off" />
              </Field>
              <Field
                label="E-post"
                error={fieldErrors.email}
                hint="Trengs for å sende kontrakt og varsler."
              >
                <Input name="email" type="email" defaultValue={initial.email} autoComplete="off" />
              </Field>
              <Field label="Adresse" hint="Tas med i kontrakten." className="sm:col-span-2">
                <Input name="address" defaultValue={initial.address} autoComplete="off" />
              </Field>
              <Field label="Antall personer" error={fieldErrors.guests}>
                <Input name="guests" type="number" min={1} max={60} defaultValue={initial.guests ?? ''} />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={initial.status}>
                  <option value="TENTATIVE">Foreløpig</option>
                  <option value="CONFIRMED">Bekreftet</option>
                  <option value="COMPLETED">Fullført</option>
                  <option value="CANCELLED">Kansellert</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Periode" subtitle="Velg prisregel først — da fylles klokkeslett og varighet inn automatisk.">
            <div className="space-y-4">
              <Field
                label="Prisregel"
                hint={
                  selectedPreset
                    ? 'Låst til denne regelen. Sett tilbake til «Automatisk» for å la datoene bestemme.'
                    : quote?.preset
                      ? `Automatisk valgt: ${quote.preset.name}.`
                      : 'Systemet velger regel ut fra datoene.'
                }
              >
                <Select name="presetId" value={presetId} onChange={(e) => applyPreset(e.target.value)}>
                  <option value="">Automatisk</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatNok(p.priceOre)}
                      {p.pricingMode === 'PER_NIGHT' ? ' per natt' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Innsjekk" required error={fieldErrors.checkInDate}>
                  <div className="flex gap-2">
                    <Input
                      name="checkInDate"
                      type="date"
                      value={checkInDate}
                      onChange={(e) => changeCheckIn(e.target.value)}
                      required
                    />
                    <Input
                      name="checkInTime"
                      type="time"
                      value={checkInTime}
                      onChange={(e) => {
                        setCheckInTime(e.target.value);
                        setTimesTouched(true);
                      }}
                      required
                      className="w-32"
                    />
                  </div>
                </Field>
                <Field label="Utsjekk" required error={fieldErrors.checkOutDate}>
                  <div className="flex gap-2">
                    <Input
                      name="checkOutDate"
                      type="date"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      required
                    />
                    <Input
                      name="checkOutTime"
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => {
                        setCheckOutTime(e.target.value);
                        setTimesTouched(true);
                      }}
                      required
                      className="w-32"
                    />
                  </div>
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Økonomi">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Leiesum (kr)"
                  required
                  error={fieldErrors.priceOre}
                  hint={
                    quote && !override
                      ? `Foreslått av «${quote.preset?.name ?? 'standard døgnpris'}».`
                      : override
                        ? 'Manuelt satt.'
                        : undefined
                  }
                >
                  <Input
                    name="price"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    onFocus={() => setOverride(true)}
                    required
                    className="tnum"
                  />
                </Field>
                <Field label="Depositum (kr)" error={fieldErrors.depositOre}>
                  <Input
                    name="deposit"
                    inputMode="decimal"
                    value={deposit}
                    onChange={(e) => {
                      setDeposit(e.target.value);
                      setDepositTouched(true);
                    }}
                    className="tnum"
                  />
                </Field>
              </div>

              <Checkbox
                name="priceOverridden"
                checked={override}
                onChange={(e) => {
                  const on = e.target.checked;
                  setOverride(on);
                  if (!on && quote) setPrice(formatKroner(quote.priceOre));
                }}
                label="Overstyr foreslått pris"
                hint={
                  differsFromSuggestion && quote
                    ? `Avviker fra forslaget på ${formatNok(quote.priceOre)}.`
                    : 'Slå av for å følge prisregelen automatisk.'
                }
              />

              {(override || differsFromSuggestion) && (
                <Field label="Begrunnelse for avvik" hint="Vises i historikken og på rapporter.">
                  <Input name="overrideReason" defaultValue={initial.overrideReason} maxLength={300} />
                </Field>
              )}

              <div className="space-y-1 border-t border-border pt-3">
                <Checkbox name="rentPaid" defaultChecked={initial.rentPaid} label="Leie betalt" />
                <Checkbox
                  name="depositPaid"
                  checked={depositPaid}
                  onChange={(e) => {
                    setDepositPaid(e.target.checked);
                    if (!e.target.checked) setDepositReturned(false);
                  }}
                  label="Depositum innbetalt"
                />
                <Checkbox
                  name="depositReturned"
                  checked={depositReturned}
                  disabled={!depositPaid}
                  onChange={(e) => setDepositReturned(e.target.checked)}
                  label="Depositum tilbakebetalt"
                  hint={depositPaid ? undefined : 'Krever at depositumet er registrert som innbetalt.'}
                />
                <Checkbox
                  name="powerFromDeposit"
                  defaultChecked={initial.powerFromDeposit}
                  label="Trekk strøm fra depositumet"
                  hint="Slå av hvis strømmen faktureres separat i stedet."
                />
              </div>

              {depositReturned && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tilbakeholdt beløp (kr)" hint="Trekk for skade, vask eller strøm.">
                    <Input
                      name="depositWithheld"
                      inputMode="decimal"
                      defaultValue={formatKroner(initial.depositWithheldOre)}
                      className="tnum"
                    />
                  </Field>
                  <Field label="Notat om depositum">
                    <Input name="depositNote" defaultValue={initial.depositNote} maxLength={500} />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card title="Notater">
            <Textarea name="notes" rows={4} defaultValue={initial.notes} placeholder="Interne notater om oppholdet." />
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <QuotePanel quote={quote} loading={loadingQuote} error={quoteError} />

          <div className="flex flex-col gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Lagrer …' : bookingId ? 'Lagre endringer' : 'Opprett booking'}
            </Button>
            <Link
              href={bookingId ? `/bookinger/${bookingId}` : '/bookinger'}
              className="rounded-lg border border-border px-3 py-2 text-center text-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Avbryt
            </Link>
          </div>
        </aside>
      </div>
    </form>
  );
}

function QuotePanel({
  quote,
  loading,
  error,
}: {
  quote: QuoteResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Beregning</h2>
        {loading && <span className="text-xs text-muted">oppdaterer …</span>}
      </header>

      <div className="space-y-3 px-4 py-3 text-sm">
        {error && <Alert kind="warning">{error}</Alert>}

        {!quote && !error && <p className="text-xs text-muted">Velg datoer for å se pris og sesong.</p>}

        {quote && (
          <>
            <dl className="space-y-1.5">
              <Row label="Netter" value={String(quote.nights)} />
              <Row label="Sesong" value={SEASON_LABELS[quote.season] ?? quote.season} />
              <Row label="Prisregel" value={quote.preset?.name ?? 'Standard døgnpris'} />
              <Row label="Foreslått leie" value={formatNok(quote.priceOre)} strong />
              <Row label="Foreslått depositum" value={formatNok(quote.depositOre)} />
            </dl>

            <p className="border-t border-border pt-2 text-xs text-muted">{quote.breakdown}</p>
            <p className="text-xs text-muted">{quote.seasonExplanation}</p>

            {quote.holidays.length > 0 && (
              <div className="rounded-lg bg-black/[0.03] px-2.5 py-2 text-xs dark:bg-white/[0.04]">
                <p className="font-medium">Helligdager i perioden</p>
                <ul className="mt-0.5 text-muted">
                  {quote.holidays.map((h) => (
                    <li key={h.date}>
                      {h.date.slice(8)}.{h.date.slice(5, 7)}. {h.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {quote.conflicts.length > 0 ? (
              <Alert kind="error" title="Perioden er opptatt">
                <ul className="mt-0.5 list-disc pl-4 text-xs">
                  {quote.conflicts.map((c) => (
                    <li key={c.reference}>
                      {c.reference} — {c.guestName}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert kind="success" title="Perioden er ledig">
                {quote.adjacent.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 text-xs">
                    {quote.adjacent.map((c) => (
                      <li key={c.reference}>
                        {c.endsBefore ? 'Gjest reiser' : 'Neste gjest kommer'} {formatStamp(c.endsBefore ? c.checkOut : c.checkIn)} —{' '}
                        {c.guestName} ({c.reference}). Kort tid til klargjøring.
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            {quote.candidates.some((c) => !c.eligible) && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none">Hvorfor ikke de andre reglene?</summary>
                <ul className="mt-1.5 space-y-1.5">
                  {quote.candidates
                    .filter((c) => !c.eligible)
                    .map((c) => (
                      <li key={c.id}>
                        <span className="font-medium text-fg">{c.name}</span>
                        <span className="block">{c.reasons.join('. ')}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "16.10 kl. 12:00" in the browser's local zone, which is Oslo for this tool. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  return `${date} kl. ${time}`;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tnum text-right ${strong ? 'text-base font-semibold' : 'text-sm'}`}>{value}</dd>
    </div>
  );
}
