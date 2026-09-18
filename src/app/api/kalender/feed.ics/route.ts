import { prisma } from '@/lib/db';
import { handle, requireApiUser } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { bookingsToIcsFeed } from '@/lib/ics';

export const dynamic = 'force-dynamic';

/** Full calendar export. Requires a signed-in session — no public token. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiUser();

    const url = new URL(request.url);
    const includeCancelled = url.searchParams.get('kansellerte') === '1';

    const [bookings, caldav, property] = await Promise.all([
      prisma.booking.findMany({
        where: includeCancelled ? {} : { status: { not: 'CANCELLED' } },
        orderBy: { checkIn: 'asc' },
      }),
      getSettings('caldav'),
      getSettings('property'),
    ]);

    const ics = bookingsToIcsFeed(bookings, {
      prefix: caldav.eventPrefix,
      includeGuestDetails: caldav.includeGuestDetails,
      calendarName: property.name || 'Hytteutleie',
    });

    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="hytteutleie.ics"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
