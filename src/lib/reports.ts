import 'server-only';
import type { BookingStatus } from '@prisma/client';
import { prisma } from './db';
import { osloInstant, osloDateKey, nightsBetween, fmtDate } from './datetime';
import { formatKroner } from './money';
import { STATUS_LABELS } from './bookings';

/** Statuses that count as realised income. */
export const INCOME_STATUSES: BookingStatus[] = ['CONFIRMED', 'COMPLETED'];

export type MonthRow = {
  month: number;
  label: string;
  bookings: number;
  nights: number;
  rentOre: number;
  powerOre: number;
  totalOre: number;
};

export type AnnualReport = {
  year: number;
  bookings: number;
  nights: number;
  rentOre: number;
  powerOre: number;
  depositHeldOre: number;
  depositWithheldOre: number;
  outstandingOre: number;
  totalOre: number;
  occupancyPercent: number;
  months: MonthRow[];
  rows: ReportRow[];
};

export type ReportRow = {
  reference: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  status: BookingStatus;
  presetName: string | null;
  rentOre: number;
  powerOre: number;
  depositOre: number;
  depositPaid: boolean;
  depositReturned: boolean;
  rentPaid: boolean;
};

const MONTH_LABELS = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];

/**
 * Income is attributed to the year the stay ends in, which is when the
 * obligation is complete — consistent with how the annual export is used.
 */
export async function annualReport(year: number, statuses: BookingStatus[] = INCOME_STATUSES): Promise<AnnualReport> {
  const from = osloInstant(`${year}-01-01`, '00:00');
  const to = osloInstant(`${year + 1}-01-01`, '00:00');

  const bookings = await prisma.booking.findMany({
    where: { status: { in: statuses }, checkOut: { gte: from, lt: to } },
    orderBy: { checkIn: 'asc' },
  });

  const months: MonthRow[] = MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    bookings: 0,
    nights: 0,
    rentOre: 0,
    powerOre: 0,
    totalOre: 0,
  }));

  const rows: ReportRow[] = [];
  let nights = 0;
  let rentOre = 0;
  let powerOre = 0;
  let depositHeldOre = 0;
  let depositWithheldOre = 0;
  let outstandingOre = 0;

  for (const b of bookings) {
    const n = nightsBetween(b.checkIn, b.checkOut);
    const power = b.powerChargedOre ?? 0;
    const monthIdx = Number(osloDateKey(b.checkOut).slice(5, 7)) - 1;
    const m = months[monthIdx]!;

    m.bookings++;
    m.nights += n;
    m.rentOre += b.priceOre;
    m.powerOre += power;
    m.totalOre += b.priceOre + power;

    nights += n;
    rentOre += b.priceOre;
    powerOre += power;
    if (b.depositPaid && !b.depositReturned) depositHeldOre += b.depositOre;
    depositWithheldOre += b.depositWithheldOre;
    if (!b.rentPaid) outstandingOre += b.priceOre + power;

    rows.push({
      reference: b.reference,
      guestName: b.guestName,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: n,
      status: b.status,
      presetName: b.presetName,
      rentOre: b.priceOre,
      powerOre: power,
      depositOre: b.depositOre,
      depositPaid: b.depositPaid,
      depositReturned: b.depositReturned,
      rentPaid: b.rentPaid,
    });
  }

  const daysInYear = (new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / 86_400_000;

  return {
    year,
    bookings: bookings.length,
    nights,
    rentOre,
    powerOre,
    depositHeldOre,
    depositWithheldOre,
    outstandingOre,
    // Withheld deposit is retained income on top of rent and power.
    totalOre: rentOre + powerOre + depositWithheldOre,
    occupancyPercent: Math.round((nights / daysInYear) * 1000) / 10,
    months,
    rows,
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-delimited CSV with a BOM — what Norwegian Excel expects. */
export function annualReportCsv(report: AnnualReport): string {
  const lines: string[] = [];
  lines.push(`Inntektsrapport ${report.year}`);
  lines.push('');
  lines.push(
    ['Referanse', 'Gjest', 'Innsjekk', 'Utsjekk', 'Netter', 'Status', 'Prisregel', 'Leie (kr)', 'Strøm (kr)', 'Depositum (kr)', 'Depositum betalt', 'Depositum tilbakebetalt', 'Leie betalt']
      .map(csvCell)
      .join(';'),
  );
  for (const r of report.rows) {
    lines.push(
      [
        r.reference,
        r.guestName,
        fmtDate(r.checkIn),
        fmtDate(r.checkOut),
        r.nights,
        STATUS_LABELS[r.status],
        r.presetName ?? '',
        formatKroner(r.rentOre),
        formatKroner(r.powerOre),
        formatKroner(r.depositOre),
        r.depositPaid ? 'Ja' : 'Nei',
        r.depositReturned ? 'Ja' : 'Nei',
        r.rentPaid ? 'Ja' : 'Nei',
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  lines.push('');
  lines.push(['Sum leie', formatKroner(report.rentOre)].join(';'));
  lines.push(['Sum strøm', formatKroner(report.powerOre)].join(';'));
  lines.push(['Tilbakeholdt depositum', formatKroner(report.depositWithheldOre)].join(';'));
  lines.push(['Sum inntekt', formatKroner(report.totalOre)].join(';'));
  lines.push(['Antall bookinger', report.bookings].join(';'));
  lines.push(['Antall netter', report.nights].join(';'));
  lines.push(['Beleggsprosent', `${report.occupancyPercent}`.replace('.', ',')].join(';'));
  lines.push(['Utestående', formatKroner(report.outstandingOre)].join(';'));

  return '﻿' + lines.join('\r\n');
}

export async function availableYears(): Promise<number[]> {
  const rows = await prisma.booking.findMany({ select: { checkOut: true }, orderBy: { checkOut: 'asc' } });
  const years = new Set(rows.map((r) => Number(osloDateKey(r.checkOut).slice(0, 4))));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
