import 'server-only';
import { Prisma, type Booking, type BookingStatus } from '@prisma/client';
import { prisma } from './db';
import { osloInstant, osloDateKey, osloTime } from './datetime';
import { quote } from './pricing';
import { getSettings } from './settings';
import type { BookingInput } from './validation';
import { HttpError } from './http';

/** Postgres raises this when the exclusion constraint blocks an overlapping stay. */
const EXCLUSION_VIOLATION = '23P01';

export async function nextReference(): Promise<string> {
  const settings = await getSettings('bookingDefaults');
  const year = new Date().getFullYear();
  const prefix = `${settings.referencePrefix}-${year}-`;
  const last = await prisma.booking.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export type Conflict = { id: string; reference: string; guestName: string; checkIn: Date; checkOut: Date };

/** Pre-flight overlap check so the UI can show who is in the way, not just an error. */
export async function findConflicts(checkIn: Date, checkOut: Date, excludeId?: string): Promise<Conflict[]> {
  return prisma.booking.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      status: { not: 'CANCELLED' },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { id: true, reference: true, guestName: true, checkIn: true, checkOut: true },
    orderBy: { checkIn: 'asc' },
  });
}

/**
 * Bookings that touch this stay without overlapping it — a same-day turnover.
 * Legitimate, but worth saying out loud so an absent conflict warning does not
 * look like the check simply failed to run.
 */
export async function findAdjacent(checkIn: Date, checkOut: Date, excludeId?: string): Promise<Conflict[]> {
  const DAY = 86_400_000;
  const near = await prisma.booking.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      status: { not: 'CANCELLED' },
      checkIn: { lt: new Date(checkOut.getTime() + DAY) },
      checkOut: { gt: new Date(checkIn.getTime() - DAY) },
    },
    select: { id: true, reference: true, guestName: true, checkIn: true, checkOut: true },
    orderBy: { checkIn: 'asc' },
  });
  // Anything that actually overlaps is reported as a conflict instead.
  return near.filter((b) => !(b.checkIn < checkOut && b.checkOut > checkIn));
}

function toInstants(input: BookingInput) {
  return {
    checkIn: osloInstant(input.checkInDate, input.checkInTime),
    checkOut: osloInstant(input.checkOutDate, input.checkOutTime),
  };
}

function mapExclusion<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err: unknown) => {
    const code = (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code;
    if (code === EXCLUSION_VIOLATION || String(err).includes('booking_no_overlap')) {
      throw new HttpError(409, 'Perioden overlapper en eksisterende booking.');
    }
    throw err;
  });
}

export async function createBooking(input: BookingInput, userId: string): Promise<Booking> {
  const { checkIn, checkOut } = toInstants(input);
  const conflicts = await findConflicts(checkIn, checkOut);
  if (conflicts.length && input.status !== 'CANCELLED') {
    throw new HttpError(409, `Perioden overlapper ${conflicts[0]!.reference} (${conflicts[0]!.guestName}).`, conflicts);
  }

  const q = await quote(checkIn, checkOut, { forcePresetId: input.presetId ?? null });
  // Record the rule that was actually applied, whether picked by hand or matched
  // automatically, so the booking history survives later preset edits.
  const preset = q.preset;
  const reference = await nextReference();

  return mapExclusion(() =>
    prisma.booking.create({
      data: {
        reference,
        guestName: input.guestName,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        checkIn,
        checkOut,
        guests: input.guests ?? null,
        status: input.status,
        notes: input.notes || null,
        presetId: preset?.id ?? null,
        presetName: preset?.name ?? null,
        presetLocked: Boolean(input.presetId),
        priceOre: input.priceOre,
        suggestedPriceOre: q.priceOre,
        priceOverridden: input.priceOverridden || input.priceOre !== q.priceOre,
        overrideReason: input.overrideReason || null,
        season: q.season,
        depositOre: input.depositOre,
        depositPaid: input.depositPaid,
        depositPaidAt: input.depositPaid ? new Date() : null,
        depositReturned: input.depositReturned,
        depositReturnedAt: input.depositReturned ? new Date() : null,
        depositWithheldOre: input.depositWithheldOre,
        depositNote: input.depositNote || null,
        powerFromDeposit: input.powerFromDeposit,
        rentPaid: input.rentPaid,
        rentPaidAt: input.rentPaid ? new Date() : null,
        createdBy: userId,
        calendarDirty: true,
      },
    }),
  );
}

export async function updateBooking(id: string, input: BookingInput, _userId: string): Promise<Booking> {
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Fant ikke bookingen.');

  const { checkIn, checkOut } = toInstants(input);
  if (input.status !== 'CANCELLED') {
    const conflicts = await findConflicts(checkIn, checkOut, id);
    if (conflicts.length) {
      throw new HttpError(409, `Perioden overlapper ${conflicts[0]!.reference} (${conflicts[0]!.guestName}).`, conflicts);
    }
  }

  const q = await quote(checkIn, checkOut, { forcePresetId: input.presetId ?? null });
  const preset = q.preset;

  const datesChanged = existing.checkIn.getTime() !== checkIn.getTime() || existing.checkOut.getTime() !== checkOut.getTime();

  return mapExclusion(() =>
    prisma.booking.update({
      where: { id },
      data: {
        guestName: input.guestName,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        checkIn,
        checkOut,
        guests: input.guests ?? null,
        status: input.status,
        notes: input.notes || null,
        presetId: preset?.id ?? null,
        presetName: preset?.name ?? existing.presetName,
        presetLocked: Boolean(input.presetId),
        priceOre: input.priceOre,
        suggestedPriceOre: q.priceOre,
        priceOverridden: input.priceOverridden || input.priceOre !== q.priceOre,
        overrideReason: input.overrideReason || null,
        season: q.season,
        depositOre: input.depositOre,
        depositPaid: input.depositPaid,
        depositPaidAt: input.depositPaid ? (existing.depositPaidAt ?? new Date()) : null,
        depositReturned: input.depositReturned,
        depositReturnedAt: input.depositReturned ? (existing.depositReturnedAt ?? new Date()) : null,
        depositWithheldOre: input.depositWithheldOre,
        depositNote: input.depositNote || null,
        powerFromDeposit: input.powerFromDeposit,
        rentPaid: input.rentPaid,
        rentPaidAt: input.rentPaid ? (existing.rentPaidAt ?? new Date()) : null,
        calendarDirty: true,
        // A changed stay window invalidates the cached power reading.
        ...(datesChanged ? { powerKwh: null, powerCostOre: null, powerFetchedAt: null, powerRaw: Prisma.DbNull } : {}),
      },
    }),
  );
}

/** Turn a stored booking back into the flat shape the form uses. */
export function bookingToFormValues(b: Booking) {
  return {
    guestName: b.guestName,
    phone: b.phone ?? '',
    email: b.email ?? '',
    address: b.address ?? '',
    checkInDate: osloDateKey(b.checkIn),
    checkInTime: osloTime(b.checkIn),
    checkOutDate: osloDateKey(b.checkOut),
    checkOutTime: osloTime(b.checkOut),
    guests: b.guests ?? null,
    status: b.status,
    // Only a pinned rule pre-selects the dropdown; otherwise it stays automatic.
    presetId: b.presetLocked ? (b.presetId ?? '') : '',
    priceOre: b.priceOre,
    priceOverridden: b.priceOverridden,
    overrideReason: b.overrideReason ?? '',
    depositOre: b.depositOre,
    depositPaid: b.depositPaid,
    depositReturned: b.depositReturned,
    depositWithheldOre: b.depositWithheldOre,
    depositNote: b.depositNote ?? '',
    powerFromDeposit: b.powerFromDeposit,
    rentPaid: b.rentPaid,
    notes: b.notes ?? '',
  };
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  TENTATIVE: 'Foreløpig',
  CONFIRMED: 'Bekreftet',
  CANCELLED: 'Kansellert',
  COMPLETED: 'Fullført',
};

export const STATUS_CLASSES: Record<BookingStatus, string> = {
  TENTATIVE: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  CONFIRMED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300',
  CANCELLED: 'bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300',
  COMPLETED: 'bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300',
};
