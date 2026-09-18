import { z } from 'zod';
import { handle, json, requireApiUser, assertSameOrigin } from '@/lib/http';
import { quote } from '@/lib/pricing';
import { findAdjacent, findConflicts } from '@/lib/bookings';
import { osloInstant } from '@/lib/datetime';
import { dateKey, timeOfDay } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const schema = z.object({
  checkInDate: dateKey,
  checkInTime: timeOfDay,
  checkOutDate: dateKey,
  checkOutTime: timeOfDay,
  presetId: z.string().optional().nullable(),
  excludeBookingId: z.string().optional().nullable(),
});

/** Live pricing preview for the booking form. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertSameOrigin();
    await requireApiUser();

    const input = schema.parse(await request.json());
    const checkIn = osloInstant(input.checkInDate, input.checkInTime);
    const checkOut = osloInstant(input.checkOutDate, input.checkOutTime);

    if (checkOut <= checkIn) {
      return json({ error: 'Utsjekk må være etter innsjekk.' }, 422);
    }

    const [q, conflicts, adjacent] = await Promise.all([
      quote(checkIn, checkOut, { forcePresetId: input.presetId || null }),
      findConflicts(checkIn, checkOut, input.excludeBookingId || undefined),
      findAdjacent(checkIn, checkOut, input.excludeBookingId || undefined),
    ]);

    return json({
      nights: q.nights,
      season: q.season,
      seasonExplanation: q.seasonExplanation,
      holidays: q.holidays,
      priceOre: q.priceOre,
      depositOre: q.depositOre,
      checkInTime: q.checkInTime,
      checkOutTime: q.checkOutTime,
      source: q.source,
      breakdown: q.breakdown,
      preset: q.preset ? { id: q.preset.id, name: q.preset.name } : null,
      candidates: q.candidates.map((c) => ({
        id: c.preset.id,
        name: c.preset.name,
        eligible: c.eligible,
        priceOre: c.priceOre,
        reasons: c.reasons,
      })),
      conflicts: conflicts.map((c) => ({
        reference: c.reference,
        guestName: c.guestName,
        checkIn: c.checkIn.toISOString(),
        checkOut: c.checkOut.toISOString(),
      })),
      adjacent: adjacent.map((c) => ({
        reference: c.reference,
        guestName: c.guestName,
        checkIn: c.checkIn.toISOString(),
        checkOut: c.checkOut.toISOString(),
        // Which side it sits on, so the panel can word it precisely.
        endsBefore: c.checkOut <= checkIn,
      })),
    });
  });
}
