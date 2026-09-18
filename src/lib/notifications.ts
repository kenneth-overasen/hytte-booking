import 'server-only';
import type { Booking } from '@prisma/client';
import { prisma } from './db';
import { getSettings, NOTIFICATION_LABELS, type EventConfig, type NotificationEvent } from './settings';
import { sendMail, splitRecipients } from './mail';
import { fmtDate, fmtDateTime, nightsBetween, osloTime } from './datetime';
import { formatNok } from './money';
import { STATUS_LABELS } from './bookings';

export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject: string; body: string }> = {
  'booking.created': {
    subject: 'Ny booking {{referanse}} — {{gjestNavn}}',
    body: `Ny booking er registrert.

Referanse: {{referanse}}
Gjest: {{gjestNavn}} ({{gjestTelefon}}, {{gjestEpost}})
Periode: {{innsjekk}} → {{utsjekk}} ({{antallNetter}} netter)
Leiesum: {{leiesum}}
Depositum: {{depositum}}
Status: {{status}}`,
  },
  'booking.updated': {
    subject: 'Booking {{referanse}} er endret',
    body: `Bookingen er oppdatert.

Referanse: {{referanse}}
Gjest: {{gjestNavn}}
Periode: {{innsjekk}} → {{utsjekk}}
Leiesum: {{leiesum}}
Status: {{status}}`,
  },
  'booking.cancelled': {
    subject: 'Booking {{referanse}} er kansellert',
    body: `Bookingen for {{gjestNavn}} i perioden {{innsjekk}} → {{utsjekk}} er kansellert.`,
  },
  'deposit.paid': {
    subject: 'Depositum mottatt — {{referanse}}',
    body: `Vi har registrert innbetalt depositum på {{depositum}} for booking {{referanse}}.

Periode: {{innsjekk}} → {{utsjekk}}

Takk!`,
  },
  'deposit.returned': {
    subject: 'Depositum tilbakebetalt — {{referanse}}',
    body: `Depositumet på {{depositum}} for booking {{referanse}} er tilbakebetalt.

{{depositumNotat}}`,
  },
  'contract.sent': {
    subject: 'Leieavtale for {{hytteNavn}} — {{referanse}}',
    body: `Hei {{gjestNavn}},

Vedlagt følger leieavtalen for oppholdet {{innsjekk}} → {{utsjekk}}.

Leiesum: {{leiesum}}
Depositum: {{depositum}}

Ta kontakt hvis noe er uklart.

Vennlig hilsen
{{utleierNavn}}`,
  },
  'contract.signed': {
    subject: 'Leieavtale signert — {{referanse}}',
    body: `Leieavtalen for booking {{referanse}} ({{gjestNavn}}) er signert.`,
  },
  'checkin.reminder': {
    subject: 'Påminnelse: innsjekk {{innsjekkDato}} — {{hytteNavn}}',
    body: `Hei {{gjestNavn}},

Dette er en påminnelse om oppholdet på {{hytteNavn}}.

Innsjekk: {{innsjekk}}
Utsjekk: {{utsjekk}}

Vennlig hilsen
{{utleierNavn}}`,
  },
  'checkout.reminder': {
    subject: 'Påminnelse: utsjekk {{utsjekkDato}} — {{hytteNavn}}',
    body: `Hei {{gjestNavn}},

Husk at utsjekk er {{utsjekk}}. Hytta skal være ryddet og forlatt innen dette tidspunktet.

Vennlig hilsen
{{utleierNavn}}`,
  },
  'power.reading': {
    subject: 'Strømavlesning for {{referanse}}',
    body: `Strømforbruk for booking {{referanse}} ({{innsjekk}} → {{utsjekk}}):

Forbruk: {{strømKwh}} kWh
Kostnad: {{strømKostnad}}`,
  },
};

async function context(booking: Booking): Promise<Record<string, string>> {
  const property = await getSettings('property');
  return {
    referanse: booking.reference,
    gjestNavn: booking.guestName,
    gjestTelefon: booking.phone ?? '',
    gjestEpost: booking.email ?? '',
    innsjekk: `${fmtDate(booking.checkIn)} kl. ${osloTime(booking.checkIn)}`,
    utsjekk: `${fmtDate(booking.checkOut)} kl. ${osloTime(booking.checkOut)}`,
    innsjekkDato: fmtDate(booking.checkIn),
    utsjekkDato: fmtDate(booking.checkOut),
    antallNetter: String(nightsBetween(booking.checkIn, booking.checkOut)),
    leiesum: formatNok(booking.priceOre),
    depositum: formatNok(booking.depositOre),
    depositumNotat: booking.depositNote ?? '',
    status: STATUS_LABELS[booking.status],
    hytteNavn: property.name,
    utleierNavn: property.ownerName,
    utleierEpost: property.ownerEmail,
    utleierTelefon: property.ownerPhone,
    strømKwh: booking.powerKwh ? String(booking.powerKwh) : '—',
    strømKostnad: booking.powerCostOre != null ? formatNok(booking.powerCostOre) : '—',
    tidspunkt: fmtDateTime(new Date()),
  };
}

function fill(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([\wæøåÆØÅ]+)\s*\}\}/g, (_m, k: string) => ctx[k] ?? '');
}

export async function resolveEventConfig(event: NotificationEvent): Promise<EventConfig> {
  const cfg = await getSettings('notifications');
  const stored = (cfg.events as Record<string, EventConfig | undefined>)[event];
  const defaults = DEFAULT_TEMPLATES[event];
  return {
    enabled: stored?.enabled ?? false,
    toGuest: stored?.toGuest ?? false,
    toOperator: stored?.toOperator ?? true,
    extraRecipients: stored?.extraRecipients ?? '',
    leadDays: stored?.leadDays ?? 2,
    subject: stored?.subject?.trim() || defaults.subject,
    body: stored?.body?.trim() || defaults.body,
  };
}

export type DispatchResult = { sent: boolean; reason?: string; recipients?: string[] };

/**
 * Fire a notification for an event. Always logged, whether or not it goes out,
 * so the operator can see what the system decided and why.
 */
export async function notify(
  event: NotificationEvent,
  booking: Booking,
  opts: { attachments?: { filename: string; content: Buffer; contentType?: string }[]; force?: boolean } = {},
): Promise<DispatchResult> {
  const [eventCfg, smtp] = await Promise.all([resolveEventConfig(event), getSettings('smtp')]);

  const log = async (status: 'SENT' | 'FAILED' | 'SKIPPED', recipient: string, subject: string, error?: string) => {
    await prisma.notificationLog
      .create({
        data: {
          event,
          bookingId: booking.id,
          recipient,
          subject,
          status,
          error: error ?? null,
          sentAt: status === 'SENT' ? new Date() : null,
        },
      })
      .catch(() => {});
  };

  if (!smtp.enabled) {
    await log('SKIPPED', '-', NOTIFICATION_LABELS[event], 'E-post er ikke aktivert.');
    return { sent: false, reason: 'E-post er ikke aktivert.' };
  }
  if (!eventCfg.enabled && !opts.force) {
    await log('SKIPPED', '-', NOTIFICATION_LABELS[event], 'Varselet er slått av.');
    return { sent: false, reason: 'Varselet er slått av.' };
  }

  const recipients = [
    ...(eventCfg.toGuest && booking.email ? [booking.email] : []),
    ...(eventCfg.toOperator ? splitRecipients(smtp.operatorRecipients) : []),
    ...splitRecipients(eventCfg.extraRecipients),
  ];
  const unique = [...new Set(recipients.filter(Boolean))];
  if (unique.length === 0) {
    await log('SKIPPED', '-', NOTIFICATION_LABELS[event], 'Ingen mottakere konfigurert.');
    return { sent: false, reason: 'Ingen mottakere konfigurert.' };
  }

  const ctx = await context(booking);
  const subject = fill(eventCfg.subject, ctx);
  const body = fill(eventCfg.body, ctx);

  try {
    await sendMail({ to: unique, subject, text: body, attachments: opts.attachments });
    await log('SENT', unique.join(', '), subject);
    return { sent: true, recipients: unique };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ukjent feil';
    await log('FAILED', unique.join(', '), subject, message);
    return { sent: false, reason: message };
  }
}

/** Fire-and-forget: a failed notification must never fail the booking operation. */
export function notifyAsync(event: NotificationEvent, booking: Booking): void {
  void notify(event, booking).catch((err) => console.error('[notify]', event, err));
}

/** Run the reminder events. Intended to be called from a scheduled request once a day. */
export async function runReminders(): Promise<{ event: NotificationEvent; reference: string; result: DispatchResult }[]> {
  const out: { event: NotificationEvent; reference: string; result: DispatchResult }[] = [];

  for (const event of ['checkin.reminder', 'checkout.reminder'] as const) {
    const cfg = await resolveEventConfig(event);
    if (!cfg.enabled) continue;

    const field = event === 'checkin.reminder' ? 'checkIn' : 'checkOut';
    const target = new Date(Date.now() + cfg.leadDays * 86_400_000);
    const dayStart = new Date(target);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
        [field]: { gte: dayStart, lt: dayEnd },
        // Do not send the same reminder twice.
        notifications: { none: { event, status: 'SENT' } },
      },
    });

    for (const b of bookings) {
      out.push({ event, reference: b.reference, result: await notify(event, b) });
    }
  }
  return out;
}
