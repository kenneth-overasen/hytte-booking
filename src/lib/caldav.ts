import 'server-only';
import type { Booking } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import { bookingToIcsObject } from './ics';

type Cfg = Awaited<ReturnType<typeof getSettings<'caldav'>>>;

function authHeader(cfg: Cfg): string {
  return 'Basic ' + Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64');
}

async function dav(
  cfg: Cfg,
  url: string,
  method: string,
  body?: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; text: string; headers: Headers; url: string }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(cfg),
      'User-Agent': 'hytte-booking/1.0',
      ...(body ? { 'Content-Type': extraHeaders['Content-Type'] ?? 'application/xml; charset=utf-8' } : {}),
      ...extraHeaders,
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });

  // iCloud redirects the generic host to a per-user shard; fetch would downgrade
  // PROPFIND to GET on a 3xx, so follow it explicitly.
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (location) {
      const next = new URL(location, url).toString();
      return dav(cfg, next, method, body, extraHeaders);
    }
  }
  return { status: res.status, text: await res.text(), headers: res.headers, url };
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!.trim());
  return out;
}

function extractHref(xml: string): string | null {
  return extractAll(xml, 'href')[0]?.trim() ?? null;
}

export type DiscoveredCalendar = { href: string; displayName: string; supportsEvents: boolean };

/** Walk principal → calendar-home-set → calendar collections. */
export async function discoverCalendars(cfgOverride?: Partial<Cfg>): Promise<DiscoveredCalendar[]> {
  const cfg = { ...(await getSettings('caldav')), ...cfgOverride } as Cfg;
  if (!cfg.username || !cfg.appPassword) throw new Error('Brukernavn og app-passord må være satt.');

  const root = cfg.serverUrl.replace(/\/$/, '');
  const principalRes = await dav(
    cfg,
    `${root}/`,
    'PROPFIND',
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    { Depth: '0' },
  );
  if (principalRes.status === 401) throw new Error('Innlogging avvist. Bruk Apple-ID og et app-spesifikt passord.');
  if (principalRes.status >= 400) throw new Error(`Kunne ikke finne prinsipal (HTTP ${principalRes.status}).`);

  const principalBlock = extractAll(principalRes.text, 'current-user-principal')[0] ?? '';
  const principalHref = extractHref(principalBlock);
  if (!principalHref) throw new Error('Fant ingen brukerprinsipal på serveren.');
  const principalUrl = new URL(principalHref, principalRes.url).toString();

  const homeRes = await dav(
    cfg,
    principalUrl,
    'PROPFIND',
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    { Depth: '0' },
  );
  const homeHref = extractHref(extractAll(homeRes.text, 'calendar-home-set')[0] ?? '');
  if (!homeHref) throw new Error('Fant ingen kalenderhjemmemappe.');
  const homeUrl = new URL(homeHref, homeRes.url).toString();

  const listRes = await dav(
    cfg,
    homeUrl,
    'PROPFIND',
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
    { Depth: '1' },
  );

  const responses = extractAll(listRes.text, 'response');
  const calendars: DiscoveredCalendar[] = [];
  for (const block of responses) {
    const href = extractHref(block);
    if (!href) continue;
    const resourceType = extractAll(block, 'resourcetype')[0] ?? '';
    if (!/calendar/i.test(resourceType)) continue;
    const supportsEvents = !/supported-calendar-component-set/i.test(block) || /VEVENT/i.test(block);
    if (!supportsEvents) continue;
    calendars.push({
      href: new URL(href, listRes.url).toString(),
      displayName: (extractAll(block, 'displayname')[0] ?? href).replace(/<[^>]+>/g, '').trim() || href,
      supportsEvents,
    });
  }
  return calendars;
}

export async function testConnection(cfgOverride?: Partial<Cfg>): Promise<{ ok: boolean; message: string; calendars?: DiscoveredCalendar[] }> {
  try {
    const calendars = await discoverCalendars(cfgOverride);
    return {
      ok: true,
      message: `Tilkoblet. Fant ${calendars.length} kalender${calendars.length === 1 ? '' : 'e'}.`,
      calendars,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ukjent feil' };
  }
}

function eventUrl(cfg: Cfg, booking: Booking): string {
  const base = cfg.calendarUrl.replace(/\/$/, '');
  return `${base}/${booking.calendarUid}.ics`;
}

export type SyncOutcome = { bookingId: string; reference: string; action: 'upserted' | 'deleted' | 'skipped'; error?: string };

/** Push one booking to the remote calendar. */
export async function pushBooking(booking: Booking, cfg?: Cfg): Promise<SyncOutcome> {
  const c = cfg ?? (await getSettings('caldav'));
  const base = { bookingId: booking.id, reference: booking.reference };

  if (!c.enabled || !c.calendarUrl) return { ...base, action: 'skipped', error: 'Kalendersynk er ikke aktivert.' };

  const url = eventUrl(c, booking);
  try {
    if (booking.status === 'CANCELLED' && c.deleteOnCancel) {
      const res = await dav(c, url, 'DELETE', undefined, booking.calendarEtag ? { 'If-Match': booking.calendarEtag } : {});
      if (res.status >= 400 && res.status !== 404 && res.status !== 412) {
        throw new Error(`HTTP ${res.status}`);
      }
      await prisma.booking.update({
        where: { id: booking.id },
        data: { calendarSyncedAt: new Date(), calendarEtag: null, calendarHref: null, calendarDirty: false },
      });
      return { ...base, action: 'deleted' };
    }

    const ics = bookingToIcsObject(booking, {
      prefix: c.eventPrefix,
      includeGuestDetails: c.includeGuestDetails,
    });
    const res = await dav(c, url, 'PUT', ics, { 'Content-Type': 'text/calendar; charset=utf-8' });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} ${res.text.slice(0, 200)}`);

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        calendarSyncedAt: new Date(),
        calendarEtag: res.headers.get('etag'),
        calendarHref: url,
        calendarDirty: false,
      },
    });
    return { ...base, action: 'upserted' };
  } catch (err) {
    return { ...base, action: 'skipped', error: err instanceof Error ? err.message : 'Ukjent feil' };
  }
}

/** Push every booking whose calendar copy is out of date. */
export async function syncDirtyBookings(limit = 200): Promise<SyncOutcome[]> {
  const cfg = await getSettings('caldav');
  if (!cfg.enabled || !cfg.calendarUrl) return [];
  const dirty = await prisma.booking.findMany({
    where: { calendarDirty: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });
  const results: SyncOutcome[] = [];
  for (const b of dirty) results.push(await pushBooking(b, cfg));
  return results;
}

export async function syncAllBookings(): Promise<SyncOutcome[]> {
  await prisma.booking.updateMany({ data: { calendarDirty: true } });
  return syncDirtyBookings(1000);
}
