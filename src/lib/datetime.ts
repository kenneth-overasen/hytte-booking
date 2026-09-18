import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export const TZ = 'Europe/Oslo';

/** Build a UTC instant from an Oslo-local date ("2026-04-03") and time ("16:00"). */
export function osloInstant(dateKey: string, time: string): Date {
  const [h = '00', m = '00'] = time.split(':');
  const stamp = `${dateKey}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  return fromZonedTime(stamp, TZ);
}

/** The Oslo calendar date of an instant, as "YYYY-MM-DD". */
export function osloDateKey(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd');
}

/** The Oslo wall-clock time of an instant, as "HH:mm". */
export function osloTime(d: Date): string {
  return formatInTimeZone(d, TZ, 'HH:mm');
}

export function osloWeekday(d: Date): number {
  // ISO weekday: 1 = Monday .. 7 = Sunday
  const n = Number(formatInTimeZone(d, TZ, 'i'));
  return n;
}

export function fmtDate(d: Date): string {
  return formatInTimeZone(d, TZ, 'dd.MM.yyyy');
}

export function fmtDateTime(d: Date): string {
  return formatInTimeZone(d, TZ, 'dd.MM.yyyy HH:mm');
}

export function fmtLongDate(d: Date): string {
  const s = formatInTimeZone(d, TZ, 'd. MMMM yyyy', { locale: undefined });
  return translateMonth(s);
}

const MONTHS_NB = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function translateMonth(s: string): string {
  MONTHS_EN.forEach((en, i) => {
    s = s.replace(en, MONTHS_NB[i]!);
  });
  return s;
}

export const WEEKDAY_NAMES_NB = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

/** Number of nights between two instants, counted in Oslo calendar days. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const a = dateKeyToUtcNoon(osloDateKey(checkIn));
  const b = dateKeyToUtcNoon(osloDateKey(checkOut));
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Anchor a date key at UTC noon so DST shifts can never move it across a day boundary. */
export function dateKeyToUtcNoon(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

export function addDaysToKey(key: string, days: number): string {
  const d = dateKeyToUtcNoon(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every calendar date a stay occupies, excluding the check-out day. */
export function stayDateKeys(checkIn: Date, checkOut: Date): string[] {
  const keys: string[] = [];
  let cur = osloDateKey(checkIn);
  const end = osloDateKey(checkOut);
  let guard = 0;
  while (cur < end && guard++ < 1000) {
    keys.push(cur);
    cur = addDaysToKey(cur, 1);
  }
  return keys;
}

export function isValidDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(dateKeyToUtcNoon(key).getTime());
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
