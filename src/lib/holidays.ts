import { addDaysToKey, dateKeyToUtcNoon, stayDateKeys } from './datetime';

/**
 * Easter Sunday for a Gregorian year (Meeus/Jones/Butcher algorithm).
 * Computed locally — no network call, identical result every time.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type Holiday = { date: string; name: string; redDay: boolean };

/** Norwegian public holidays ("røde dager") plus the notable non-red days. */
export function norwegianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const rel = (days: number) => addDaysToKey(easter, days);
  return [
    { date: `${year}-01-01`, name: '1. nyttårsdag', redDay: true },
    { date: rel(-7), name: 'Palmesøndag', redDay: true },
    { date: rel(-3), name: 'Skjærtorsdag', redDay: true },
    { date: rel(-2), name: 'Langfredag', redDay: true },
    { date: rel(-1), name: 'Påskeaften', redDay: false },
    { date: rel(0), name: '1. påskedag', redDay: true },
    { date: rel(1), name: '2. påskedag', redDay: true },
    { date: `${year}-05-01`, name: 'Arbeidernes dag', redDay: true },
    { date: `${year}-05-17`, name: 'Grunnlovsdag', redDay: true },
    { date: rel(39), name: 'Kristi himmelfartsdag', redDay: true },
    { date: rel(49), name: '1. pinsedag', redDay: true },
    { date: rel(50), name: '2. pinsedag', redDay: true },
    { date: `${year}-12-24`, name: 'Julaften', redDay: false },
    { date: `${year}-12-25`, name: '1. juledag', redDay: true },
    { date: `${year}-12-26`, name: '2. juledag', redDay: true },
    { date: `${year}-12-31`, name: 'Nyttårsaften', redDay: false },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export type SeasonConfig = {
  /** Offsets in days from Easter Sunday. Default -8 = the Saturday before Palm Sunday. */
  easterStartOffset: number;
  /** Default +1 = Easter Monday (2. påskedag). */
  easterEndOffset: number;
  /** "MM-DD" — the Christmas window may wrap across new year. */
  christmasStart: string;
  christmasEnd: string;
  /** "MM-DD" — the manually defined summer period. */
  summerStart: string;
  summerEnd: string;
  /** Share of nights that must fall inside a window for the season to apply (0-1). */
  seasonThreshold: number;
};

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  easterStartOffset: -8,
  easterEndOffset: 1,
  christmasStart: '12-20',
  christmasEnd: '01-02',
  summerStart: '06-20',
  summerEnd: '08-10',
  seasonThreshold: 0.5,
};

export type SeasonName = 'SUMMER' | 'EASTER' | 'CHRISTMAS' | 'OFFSEASON';

/** The Easter window for a given year, as inclusive date keys. */
export function easterWindow(year: number, cfg: SeasonConfig): { start: string; end: string } {
  const easter = easterSunday(year);
  return {
    start: addDaysToKey(easter, cfg.easterStartOffset),
    end: addDaysToKey(easter, cfg.easterEndOffset),
  };
}

function inMonthDayWindow(dateKey: string, startMd: string, endMd: string): boolean {
  const md = dateKey.slice(5);
  // A window like 12-20 → 01-02 wraps the year boundary.
  if (startMd <= endMd) return md >= startMd && md <= endMd;
  return md >= startMd || md <= endMd;
}

export function seasonForDate(dateKey: string, cfg: SeasonConfig): SeasonName {
  const year = Number(dateKey.slice(0, 4));
  // Easter can straddle March/April but never a year boundary.
  for (const y of [year - 1, year, year + 1]) {
    const w = easterWindow(y, cfg);
    if (dateKey >= w.start && dateKey <= w.end) return 'EASTER';
  }
  if (inMonthDayWindow(dateKey, cfg.christmasStart, cfg.christmasEnd)) return 'CHRISTMAS';
  if (inMonthDayWindow(dateKey, cfg.summerStart, cfg.summerEnd)) return 'SUMMER';
  return 'OFFSEASON';
}

export type SeasonBreakdown = {
  season: SeasonName;
  counts: Record<SeasonName, number>;
  nights: number;
  /** Human-readable explanation shown in the UI so pricing is never a black box. */
  explanation: string;
};

/**
 * Classify a stay. A special season wins when it covers at least `seasonThreshold`
 * of the nights; Easter beats Christmas beats Summer when several qualify.
 */
export function classifyStay(checkIn: Date, checkOut: Date, cfg: SeasonConfig): SeasonBreakdown {
  const keys = stayDateKeys(checkIn, checkOut);
  const counts: Record<SeasonName, number> = { SUMMER: 0, EASTER: 0, CHRISTMAS: 0, OFFSEASON: 0 };
  for (const k of keys) counts[seasonForDate(k, cfg)]++;
  const nights = keys.length || 1;
  const threshold = Math.max(1, Math.ceil(nights * cfg.seasonThreshold));

  const labels: Record<SeasonName, string> = {
    EASTER: 'påske',
    CHRISTMAS: 'jul/nyttår',
    SUMMER: 'sommer',
    OFFSEASON: 'lavsesong',
  };

  for (const candidate of ['EASTER', 'CHRISTMAS', 'SUMMER'] as const) {
    if (counts[candidate] >= threshold) {
      return {
        season: candidate,
        counts,
        nights: keys.length,
        explanation: `${counts[candidate]} av ${keys.length} netter faller i ${labels[candidate]} (terskel ${threshold}).`,
      };
    }
  }
  return {
    season: 'OFFSEASON',
    counts,
    nights: keys.length,
    explanation:
      counts.OFFSEASON === keys.length
        ? 'Alle netter er i lavsesong.'
        : `Ingen sesong nådde terskelen på ${threshold} netter — regnes som lavsesong.`,
  };
}

/** Named holidays that fall inside a stay — surfaced in the booking UI. */
export function holidaysInStay(checkIn: Date, checkOut: Date): Holiday[] {
  const keys = new Set(stayDateKeys(checkIn, checkOut));
  const years = new Set([...keys].map((k) => Number(k.slice(0, 4))));
  const out: Holiday[] = [];
  for (const y of years) for (const h of norwegianHolidays(y)) if (keys.has(h.date)) out.push(h);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function describeWindow(start: string, end: string): string {
  const f = (k: string) => {
    const d = dateKeyToUtcNoon(k);
    return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  };
  return `${f(start)} – ${f(end)}`;
}
