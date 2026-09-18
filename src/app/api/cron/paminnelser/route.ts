import { handle, json, HttpError } from '@/lib/http';
import { env } from '@/lib/env';
import { safeEquals } from '@/lib/crypto';
import { runReminders } from '@/lib/notifications';
import { syncDirtyBookings } from '@/lib/caldav';

export const dynamic = 'force-dynamic';

/**
 * Scheduled maintenance: send due reminders and flush pending calendar changes.
 * Authenticated with APP_SECRET as a bearer token so it can be driven by cron.
 */
async function run(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const presented = auth.replace(/^Bearer\s+/i, '');
  if (!presented || !safeEquals(presented, env().APP_SECRET)) {
    throw new HttpError(401, 'Ugyldig nøkkel.');
  }

  const [reminders, calendar] = await Promise.all([runReminders(), syncDirtyBookings()]);

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    reminders: reminders.map((r) => ({ event: r.event, reference: r.reference, sent: r.result.sent, reason: r.result.reason })),
    calendar: { synced: calendar.filter((c) => !c.error).length, failed: calendar.filter((c) => c.error).length },
  });
}

export async function POST(request: Request) {
  return handle(() => run(request));
}

export async function GET(request: Request) {
  return handle(() => run(request));
}
