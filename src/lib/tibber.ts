import 'server-only';
import type { Booking } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import { osloDateKey, osloTime, stayDateKeys } from './datetime';

type Cfg = Awaited<ReturnType<typeof getSettings<'tibber'>>>;

export type PowerReading = {
  kwh: number;
  costOre: number | null;
  raw: unknown;
  source: 'tibber' | 'mock';
  /** Which price basis produced costOre — shown so the figure is never ambiguous. */
  basis: 'spot' | 'fixed';
  fixedPricePerKwh: number | null;
  fetchedAt: Date;
};

/**
 * Resolve a dot-path into a JSON response. A `[]` segment maps over an array and
 * sums the numbers found beneath it — enough to handle both flat totals and
 * hourly/daily series without writing code per endpoint.
 */
export function resolvePath(input: unknown, path: string): number | null {
  if (!path) return null;
  const walk = (node: unknown, segments: string[]): number | null => {
    if (node == null) return null;
    if (segments.length === 0) {
      const n = typeof node === 'string' ? Number(node) : node;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    }
    const [head, ...rest] = segments;
    if (head!.endsWith('[]')) {
      const key = head!.slice(0, -2);
      const arr = key ? (node as Record<string, unknown>)[key] : node;
      if (!Array.isArray(arr)) return null;
      let sum = 0;
      let found = false;
      for (const item of arr) {
        const v = walk(item, rest);
        if (v != null) {
          sum += v;
          found = true;
        }
      }
      return found ? sum : null;
    }
    if (typeof node !== 'object') return null;
    return walk((node as Record<string, unknown>)[head!], rest);
  };
  return walk(input, path.split('.').filter(Boolean));
}

function applyPlaceholders(template: string, from: Date, to: Date): string {
  return template
    .replaceAll('{{from}}', from.toISOString())
    .replaceAll('{{to}}', to.toISOString())
    // Oslo wall clock. tibber-report prints the period back using whatever it
    // was given, so sending local time makes its PDF read 15:00–14:00 like the
    // contract, rather than the equivalent UTC instants.
    .replaceAll('{{fromLocal}}', `${osloDateKey(from)}T${osloTime(from)}`)
    .replaceAll('{{toLocal}}', `${osloDateKey(to)}T${osloTime(to)}`)
    .replaceAll('{{fromDate}}', osloDateKey(from))
    .replaceAll('{{toDate}}', osloDateKey(to))
    .replaceAll('{{fromEpoch}}', String(Math.floor(from.getTime() / 1000)))
    .replaceAll('{{toEpoch}}', String(Math.floor(to.getTime() / 1000)));
}

/**
 * Deterministic stand-in so the whole flow is testable before the real endpoint
 * is configured. Consumption is seasonal — a Norwegian cabin burns far more in January.
 */
function mockReading(from: Date, to: Date): PowerReading {
  const days = stayDateKeys(from, to);
  let kwh = 0;
  for (const key of days) {
    const month = Number(key.slice(5, 7));
    const winter = month <= 3 || month >= 11;
    const shoulder = month === 4 || month === 10;
    const base = winter ? 42 : shoulder ? 24 : 11;
    // Stable pseudo-variation from the date string, so repeat calls agree.
    const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
    kwh += base * (0.8 + ((seed % 40) / 100));
  }
  kwh = Math.round(kwh * 1000) / 1000;
  const costOre = Math.round(kwh * 145); // ≈ 1,45 kr/kWh
  return {
    kwh,
    costOre,
    raw: { mock: true, days: days.length, kwh, costOre },
    source: 'mock',
    basis: 'spot',
    fixedPricePerKwh: null,
    fetchedAt: new Date(),
  };
}

type RawResponse = {
  ok: boolean;
  status: number;
  body: Buffer;
  contentType: string | null;
  contentDisposition: string | null;
};

/**
 * Node's global fetch cannot be told to accept a self-signed certificate, so
 * that one case goes through the http/https modules directly. Everything else
 * uses fetch.
 */
async function insecureRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<RawResponse> {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const mod = isHttps ? await import('node:https') : await import('node:http');

  return new Promise<RawResponse>((resolve, reject) => {
    const req = mod.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers,
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body: Buffer.concat(chunks),
            contentType: res.headers['content-type'] ?? null,
            contentDisposition: res.headers['content-disposition'] ?? null,
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Tidsavbrudd etter ${timeoutMs} ms`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** URL, headers and body for one call, shared by the JSON and PDF endpoints. */
function buildRequest(cfg: Cfg, from: Date, to: Date, path: string, accept: string) {
  const url = cfg.baseUrl.replace(/\/$/, '') + applyPlaceholders(path, from, to);
  const headers: Record<string, string> = { Accept: accept };

  if (cfg.authType === 'bearer') headers.Authorization = `Bearer ${cfg.token}`;
  if (cfg.authType === 'header') headers[cfg.headerName || 'X-API-Key'] = cfg.token;
  if (cfg.authType === 'basic') {
    headers.Authorization = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  }

  let body: string | undefined;
  if (cfg.method === 'POST' && cfg.body.trim()) {
    body = withFixedPrice(applyPlaceholders(cfg.body, from, to), cfg);
    headers['Content-Type'] = 'application/json';
  }
  return { url, headers, body };
}

/**
 * Add the fixed-price fields to the request body. Keys the operator has already
 * written into the template win, so the body stays the final say.
 */
function withFixedPrice(body: string, cfg: Cfg): string {
  if (!cfg.useFixedPrice || cfg.fixedPrice <= 0) return body;

  let parsed: Record<string, unknown>;
  try {
    const candidate = JSON.parse(body) as unknown;
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return body;
    parsed = candidate as Record<string, unknown>;
  } catch {
    // Not a JSON object — leave a hand-rolled body untouched.
    return body;
  }

  if (!('fixed_price' in parsed)) parsed.fixed_price = cfg.fixedPrice;
  if (!('fixed_price_includes_vat' in parsed)) {
    parsed.fixed_price_includes_vat = cfg.fixedPriceIncludesVat;
  }
  return JSON.stringify(parsed, null, 2);
}

async function performRequest(
  cfg: Cfg,
  req: { url: string; headers: Record<string, string>; body: string | undefined },
): Promise<RawResponse> {
  return (
    cfg.insecureTls
      ? insecureRequest(req.url, cfg.method, req.headers, req.body, cfg.timeoutMs)
      : fetch(req.url, {
          method: cfg.method,
          headers: req.headers,
          body: req.body,
          signal: AbortSignal.timeout(cfg.timeoutMs),
        }).then(async (r) => ({
          ok: r.ok,
          status: r.status,
          body: Buffer.from(await r.arrayBuffer()),
          contentType: r.headers.get('content-type'),
          contentDisposition: r.headers.get('content-disposition'),
        }))
  ).catch((err: unknown) => {
    throw new Error(`Kunne ikke nå tjenesten: ${err instanceof Error ? err.message : String(err)}`);
  });
}

/**
 * A failed call may answer with JSON ({"detail": "..."}), HTML or nothing.
 * Pull out whatever is most useful for the operator.
 */
function describeFailure(res: RawResponse): string {
  const text = res.body.toString('utf8').slice(0, 400);
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const detail = parsed.detail ?? parsed.error;
    if (typeof detail === 'string' && detail.trim()) return `${detail} (HTTP ${res.status})`;
  } catch {
    /* not JSON */
  }
  return `Tjenesten svarte HTTP ${res.status}${text.trim() ? `: ${text}` : ''}`;
}

function requireConfigured(cfg: Cfg): void {
  if (!cfg.enabled) throw new Error('Tibber-integrasjonen er ikke aktivert.');
  if (!cfg.baseUrl) throw new Error('Mangler URL til tibber-report-tjenesten.');
}

export async function fetchReading(from: Date, to: Date, cfgOverride?: Partial<Cfg>): Promise<PowerReading> {
  const cfg = { ...(await getSettings('tibber')), ...cfgOverride } as Cfg;
  if (!cfg.enabled) throw new Error('Tibber-integrasjonen er ikke aktivert.');
  if (cfg.mock) return mockReading(from, to);
  requireConfigured(cfg);

  const usingFixed = cfg.useFixedPrice && cfg.fixedPrice > 0;
  const res = await performRequest(cfg, buildRequest(cfg, from, to, cfg.path, 'application/json'));
  const text = res.body.toString('utf8');
  if (!res.ok) throw new Error(describeFailure(res));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Svaret var ikke gyldig JSON: ${text.slice(0, 200)}`);
  }

  const kwh = resolvePath(parsed, cfg.kwhPath);
  if (kwh == null) {
    throw new Error(`Fant ingen tallverdi på stien "${cfg.kwhPath}". Sjekk feltkartleggingen.`);
  }
  const rawCost = cfg.costPath ? resolvePath(parsed, cfg.costPath) : null;
  const costOre = rawCost == null ? null : Math.round(cfg.costUnit === 'NOK' ? rawCost * 100 : rawCost);

  return {
    kwh: Math.round(kwh * 1000) / 1000,
    costOre,
    raw: parsed,
    source: 'tibber',
    basis: usingFixed ? 'fixed' : 'spot',
    fixedPricePerKwh: usingFixed ? cfg.fixedPrice : null,
    fetchedAt: new Date(),
  };
}

export type PowerPdf = { pdf: Buffer; filename: string };

/** Only a plain filename survives — never a path or anything that could break the header. */
function safeFilename(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(candidate);
  const raw = match?.[1];
  if (!raw) return fallback;

  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  name = name.split(/[\\/]/).pop() ?? '';
  // Strip control characters, quotes and anything else awkward in a header.
  name = name.replace(/[^\p{L}\p{N}._ -]/gu, '').trim();
  if (!name || name === '.' || name === '..') return fallback;
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  return name.slice(0, 120);
}

/**
 * Fetch the upstream tool's own PDF report for a period and hand it straight
 * through. Nothing is re-rendered locally, so the operator gets exactly the
 * document tibber-report would have produced.
 */
export async function fetchReportPdf(from: Date, to: Date, cfgOverride?: Partial<Cfg>): Promise<PowerPdf> {
  const cfg = { ...(await getSettings('tibber')), ...cfgOverride } as Cfg;
  if (cfg.mock) {
    throw new Error('Simulerte verdier kan ikke lage PDF. Slå av «Bruk simulerte verdier» og pek på den virkelige tjenesten.');
  }
  requireConfigured(cfg);
  if (!cfg.pdfPath.trim()) {
    throw new Error('Ingen sti til PDF-rapport er satt under Innstillinger → Strøm.');
  }

  const res = await performRequest(cfg, buildRequest(cfg, from, to, cfg.pdfPath, 'application/pdf'));
  if (!res.ok) throw new Error(describeFailure(res));

  // A 200 carrying JSON or HTML means the path is wrong — do not pass it off as a PDF.
  const looksLikePdf = res.body.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!looksLikePdf) {
    const type = res.contentType ?? 'ukjent type';
    throw new Error(
      `Svaret var ikke en PDF (${type}). Sjekk at stien «${cfg.pdfPath}» peker på PDF-endepunktet.`,
    );
  }

  return { pdf: res.body, filename: safeFilename(res.contentDisposition, 'stromrapport.pdf') };
}

/** Read consumption for a booking's stay window and cache it on the booking. */
export async function refreshBookingPower(booking: Booking): Promise<PowerReading> {
  const [reading, defaults] = await Promise.all([
    fetchReading(booking.checkIn, booking.checkOut),
    getSettings('bookingDefaults'),
  ]);

  const chargedOre =
    defaults.chargePowerSeparately && reading.costOre != null
      ? Math.round(reading.costOre * (1 + defaults.powerMarkupPercent / 100))
      : null;

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      powerKwh: reading.kwh.toFixed(3),
      powerCostOre: reading.costOre,
      powerFetchedAt: reading.fetchedAt,
      powerRaw: reading.raw as never,
      powerChargedOre: chargedOre,
    },
  });
  return reading;
}

export async function testTibber(cfgOverride?: Partial<Cfg>): Promise<{ ok: boolean; message: string; reading?: PowerReading }> {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86_400_000);
  try {
    const reading = await fetchReading(from, to, cfgOverride);
    return {
      ok: true,
      message: `Hentet ${reading.kwh} kWh${
        reading.costOre != null ? ` (${(reading.costOre / 100).toFixed(2)} kr)` : ''
      } for siste uke — ${
        reading.basis === 'fixed' ? `fastpris ${reading.fixedPricePerKwh} kr/kWh` : 'spotpris'
      }${reading.source === 'mock' ? ', simulert' : ''}.`,
      reading,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ukjent feil' };
  }
}
