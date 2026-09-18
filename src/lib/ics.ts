import type { Booking } from '@prisma/client';
import { STATUS_LABELS } from './bookings';
import { formatNok } from './money';
import { nightsBetween } from './datetime';

const PRODID = '-//hytte-booking//Hytteutleie//NO';

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 requires lines of at most 75 octets, continued with a leading space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 73) return line;
  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 73 : 72), bytes.length);
    // Never split a multi-byte character.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push((start === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export type IcsOptions = {
  prefix?: string;
  includeGuestDetails?: boolean;
  calendarName?: string;
};

export function bookingToVevent(b: Booking, opts: IcsOptions = {}): string {
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const summary = `${opts.prefix ?? ''}${b.guestName}`;

  const descLines = [
    `Referanse: ${b.reference}`,
    `Status: ${STATUS_LABELS[b.status]}`,
    `Netter: ${nights}`,
    `Leiesum: ${formatNok(b.priceOre)}`,
    `Depositum: ${formatNok(b.depositOre)} — ${b.depositPaid ? 'betalt' : 'ikke betalt'}${
      b.depositReturned ? ', tilbakebetalt' : ''
    }`,
  ];
  if (opts.includeGuestDetails !== false) {
    if (b.phone) descLines.push(`Telefon: ${b.phone}`);
    if (b.email) descLines.push(`E-post: ${b.email}`);
  }
  if (b.notes) descLines.push('', b.notes);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${b.calendarUid}@hytte-booking`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(b.checkIn)}`,
    `DTEND:${utcStamp(b.checkOut)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(descLines.join('\n'))}`,
    `STATUS:${b.status === 'CANCELLED' ? 'CANCELLED' : b.status === 'TENTATIVE' ? 'TENTATIVE' : 'CONFIRMED'}`,
    `TRANSP:${b.status === 'CANCELLED' ? 'TRANSPARENT' : 'OPAQUE'}`,
    `LAST-MODIFIED:${utcStamp(b.updatedAt)}`,
    `CATEGORIES:${escapeText(b.presetName ?? 'Utleie')}`,
    'END:VEVENT',
  ];
  return lines.map(fold).join('\r\n');
}

/** A single-event calendar object, as required for a CalDAV PUT. */
export function bookingToIcsObject(b: Booking, opts: IcsOptions = {}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    bookingToVevent(b, opts),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A full feed for subscription or download. */
export function bookingsToIcsFeed(bookings: Booking[], opts: IcsOptions = {}): string {
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(opts.calendarName ?? 'Hytteutleie')}`),
    'X-WR-TIMEZONE:Europe/Oslo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  return [...head, ...bookings.map((b) => bookingToVevent(b, opts)), 'END:VCALENDAR', ''].join('\r\n');
}
