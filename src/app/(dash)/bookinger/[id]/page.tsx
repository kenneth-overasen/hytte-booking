import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { Alert, Badge, Card, Input, LinkButton } from '@/components/ui';
import { ActionForm, ConfirmForm } from '@/components/action-form';
import { bookingToFormValues, STATUS_CLASSES, STATUS_LABELS } from '@/lib/bookings';
import { fmtDate, fmtDateTime, nightsBetween } from '@/lib/datetime';
import { formatNok } from '@/lib/money';
import { BookingForm, type PresetOption } from '../booking-form';
import { PowerPdfButton } from '../power-pdf-button';
import { DepositSettlement } from '../deposit-settlement';
import {
  deleteBookingAction,
  markSignedAction,
  refreshPowerAction,
  renderContractAction,
  sendContractAction,
  syncBookingCalendarAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, select: { reference: true, guestName: true } });
  return { title: booking ? `${booking.reference} — ${booking.guestName}` : 'Booking' };
}

const CONTRACT_LABELS: Record<string, string> = {
  NONE: 'Ikke laget',
  DRAFT: 'Utkast',
  SENT: 'Sendt',
  SIGNED: 'Signert',
  DECLINED: 'Avvist',
};

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lagret?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { lagret } = await searchParams;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) notFound();

  const [presets, caldav, tibber, esign] = await Promise.all([
    prisma.preset.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    getSettings('caldav'),
    getSettings('tibber'),
    getSettings('esign'),
  ]);

  const nights = nightsBetween(booking.checkIn, booking.checkOut);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav className="text-xs text-muted">
            <Link href="/bookinger" className="hover:underline">
              Bookinger
            </Link>
            <span className="mx-1">/</span>
            <span className="tnum">{booking.reference}</span>
          </nav>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
            {booking.guestName}
            <Badge className={STATUS_CLASSES[booking.status]}>{STATUS_LABELS[booking.status]}</Badge>
          </h1>
          <p className="tnum mt-0.5 text-sm text-muted">
            {fmtDate(booking.checkIn)} – {fmtDate(booking.checkOut)} · {nights} netter · {formatNok(booking.priceOre)}
          </p>
        </div>
        <LinkButton href={`/api/bookinger/${booking.id}/kontrakt.pdf`} target="_blank" rel="noopener">
          Last ned kontrakt (PDF)
        </LinkButton>
      </div>

      {lagret === '1' && <Alert kind="success">Bookingen er lagret.</Alert>}

      <BookingForm
        bookingId={booking.id}
        presets={presets as PresetOption[]}
        initial={bookingToFormValues(booking)}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Kontrakt"
          subtitle={`Status: ${CONTRACT_LABELS[booking.contractStatus]}${
            booking.contractRendered ? ` · sist generert ${fmtDateTime(booking.contractRendered)}` : ''
          }`}
        >
          <div className="space-y-3">
            {booking.contractSignedAt && (
              <Alert kind="success">
                Signert {fmtDateTime(booking.contractSignedAt)}
                {booking.contractSignedBy ? ` av ${booking.contractSignedBy}` : ''}.
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <LinkButton
                href={`/api/bookinger/${booking.id}/kontrakt.pdf`}
                target="_blank"
                rel="noopener"
                variant="secondary"
              >
                Last ned kontrakt (PDF)
              </LinkButton>
              <ActionForm
                action={renderContractAction}
                hidden={{ id: booking.id }}
                label="Generer fra mal"
                pendingLabel="Genererer …"
              />
              {booking.email ? (
                <ActionForm
                  action={sendContractAction}
                  hidden={{ id: booking.id }}
                  label="Send til signering"
                  pendingLabel="Sender …"
                  variant="primary"
                  confirm={`Send kontrakten til ${booking.email}?`}
                />
              ) : (
                <p className="self-center text-xs text-muted">
                  Legg inn e-postadresse på gjesten for å kunne sende kontrakten.
                </p>
              )}
            </div>

            <p className="text-xs text-muted">
              Signeringsmetode: <strong className="text-fg">{esign.provider === 'manual' ? 'manuell' : 'webhook'}</strong>.
              Endres under Innstillinger → Integrasjoner.
            </p>

            {booking.esignUrl && (
              <p className="text-xs">
                <a href={booking.esignUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  Åpne signeringslenken
                </a>
              </p>
            )}

            {booking.contractStatus !== 'SIGNED' && (
              <div className="border-t border-border pt-3">
                <ActionForm action={markSignedAction} hidden={{ id: booking.id }} label="Marker som signert">
                  <Input
                    name="signedBy"
                    placeholder="Hvem signerte?"
                    defaultValue={booking.guestName}
                    className="max-w-xs"
                  />
                </ActionForm>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Strøm"
          subtitle={
            booking.powerFetchedAt
              ? `Sist hentet ${fmtDateTime(booking.powerFetchedAt)}`
              : 'Ingen avlesning hentet ennå'
          }
        >
          <div className="space-y-3">
            {booking.powerKwh != null ? (
              <dl className="space-y-1.5 text-sm">
                <Row label="Forbruk" value={`${booking.powerKwh} kWh`} />
                <Row label="Kostnad" value={booking.powerCostOre != null ? formatNok(booking.powerCostOre) : '—'} />
                {booking.powerChargedOre != null && (
                  <Row label="Viderefaktureres" value={formatNok(booking.powerChargedOre)} strong />
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                {tibber.enabled
                  ? 'Hent forbruket for oppholdsperioden fra tibber-report.'
                  : 'Tibber-integrasjonen er ikke aktivert. Skru den på under Innstillinger → Integrasjoner.'}
              </p>
            )}

            <ActionForm
              action={refreshPowerAction}
              hidden={{ id: booking.id }}
              label={booking.powerKwh != null ? 'Hent på nytt' : 'Hent forbruk'}
              pendingLabel="Henter …"
            />

            {tibber.enabled && tibber.pdfPath.trim() && (
              <div className="border-t border-border pt-3">
                <PowerPdfButton
                  bookingId={booking.id}
                  disabledReason={
                    tibber.mock ? 'Simulerte verdier kan ikke lage PDF — pek på den virkelige tjenesten.' : undefined
                  }
                />
                <p className="mt-1.5 text-xs text-muted">
                  Rapporten lages av tibber-report for nøyaktig denne oppholdsperioden.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Oppgjør av depositum"
          subtitle="Hva gjesten får tilbake når strøm og eventuelle trekk er hensyntatt."
        >
          <DepositSettlement booking={booking} />
        </Card>

        <Card
          title="Kalender"
          subtitle={
            booking.calendarSyncedAt
              ? `Synkronisert ${fmtDateTime(booking.calendarSyncedAt)}`
              : caldav.enabled
                ? 'Ikke synkronisert ennå'
                : 'iCloud-synk er ikke aktivert'
          }
        >
          <div className="space-y-3">
            {booking.calendarDirty && caldav.enabled && (
              <Alert kind="warning">Bookingen har endringer som ikke er sendt til kalenderen.</Alert>
            )}
            <ActionForm
              action={syncBookingCalendarAction}
              hidden={{ id: booking.id }}
              label="Synkroniser nå"
              pendingLabel="Synkroniserer …"
            />
          </div>
        </Card>

        <Card title="Faresone" subtitle="Sletting kan ikke angres.">
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Vurder å sette status til <strong className="text-fg">Kansellert</strong> i stedet — da beholdes historikken,
              og perioden frigjøres for nye bookinger.
            </p>
            <ConfirmForm
              action={deleteBookingAction}
              hidden={{ id: booking.id }}
              label="Slett bookingen permanent"
              confirm={`Slette ${booking.reference} (${booking.guestName})? Dette kan ikke angres.`}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}
