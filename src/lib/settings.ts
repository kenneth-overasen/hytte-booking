import { z } from 'zod';
import { prisma } from './db';
import { decryptSecret, encryptSecret, isEncrypted, SECRET_MASK } from './crypto';
import { DEFAULT_SEASON_CONFIG } from './holidays';

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Må være på formatet TT:MM');
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Må være på formatet MM-DD');

export const propertySchema = z.object({
  name: z.string().default('Hytta'),
  address: z.string().default(''),
  cadastre: z.string().default(''),
  ownerName: z.string().default(''),
  ownerAddress: z.string().default(''),
  ownerPhone: z.string().default(''),
  ownerEmail: z.string().default(''),
  bankAccount: z.string().default(''),
  maxGuests: z.coerce.number().int().min(1).default(8),
});

export const bookingDefaultsSchema = z.object({
  checkInTime: timeStr.default('16:00'),
  checkOutTime: timeStr.default('12:00'),
  defaultDepositOre: z.coerce.number().int().min(0).default(300000),
  defaultNightlyOre: z.coerce.number().int().min(0).default(120000),
  /** A flat cleaning fee for the stay. 0 leaves {{rengjøringsgebyr}} empty. */
  cleaningFeeOre: z.coerce.number().int().min(0).default(0),
  referencePrefix: z.string().default('HY'),
  /** Bill power on top of rent, using the Tibber reading. */
  chargePowerSeparately: z.boolean().default(false),
  powerMarkupPercent: z.coerce.number().min(0).max(100).default(0),
});

export const seasonSchema = z.object({
  easterStartOffset: z.coerce.number().int().min(-30).max(0).default(DEFAULT_SEASON_CONFIG.easterStartOffset),
  easterEndOffset: z.coerce.number().int().min(0).max(30).default(DEFAULT_SEASON_CONFIG.easterEndOffset),
  christmasStart: monthDay.default(DEFAULT_SEASON_CONFIG.christmasStart),
  christmasEnd: monthDay.default(DEFAULT_SEASON_CONFIG.christmasEnd),
  summerStart: monthDay.default(DEFAULT_SEASON_CONFIG.summerStart),
  summerEnd: monthDay.default(DEFAULT_SEASON_CONFIG.summerEnd),
  seasonThreshold: z.coerce.number().min(0.1).max(1).default(DEFAULT_SEASON_CONFIG.seasonThreshold),
});

export const tibberSchema = z.object({
  enabled: z.boolean().default(false),
  /** Set to true to use the built-in simulator instead of a real endpoint. */
  mock: z.boolean().default(false),
  baseUrl: z.string().default(''),
  /**
   * Defaults target the self-hosted tibber-report tool's POST /api/report.
   * {{fromLocal}}/{{toLocal}} are Oslo wall clock, sent with an explicit
   * timezone so the period reads 15:00-14:00 in that tool's own PDF. The same
   * absolute hours are covered either way; {{from}}/{{to}} send UTC instants
   * instead, and {{fromDate}}/{{toDate}} plain YYYY-MM-DD.
   */
  path: z.string().default('/api/report'),
  /** The same tool's PDF endpoint. Empty disables the download button. */
  pdfPath: z.string().default('/api/report.pdf'),
  method: z.enum(['GET', 'POST']).default('POST'),
  /** JSON body for POST, with the same placeholders. */
  body: z
    .string()
    .default(
      '{\n  "start": "{{fromLocal}}",\n  "end": "{{toLocal}}",\n  "timezone": "Europe/Oslo",\n  "lang": "nb"\n}',
    ),
  authType: z.enum(['none', 'bearer', 'header', 'basic']).default('none'),
  token: z.string().default(''),
  headerName: z.string().default('X-API-Key'),
  username: z.string().default(''),
  password: z.string().default(''),
  /** Dot-paths into the JSON response. Use [] to sum an array of objects. */
  kwhPath: z.string().default('summary.totalConsumption'),
  costPath: z.string().default('summary.spot.inclVat'),
  costUnit: z.enum(['NOK', 'ORE']).default('NOK'),
  /**
   * A fixed price per kWh, passed to the report service so the guest is billed
   * one all-inclusive rate instead of the raw spot price. When this is on,
   * fixed_price and fixed_price_includes_vat are added to the request body.
   */
  useFixedPrice: z.boolean().default(false),
  fixedPrice: z.coerce.number().min(0).max(100).default(0),
  fixedPriceIncludesVat: z.boolean().default(true),
  timeoutMs: z.coerce.number().int().min(1000).max(120000).default(15000),
  /** Skip TLS verification for a self-signed home-lab certificate. */
  insecureTls: z.boolean().default(false),
});

export const caldavSchema = z.object({
  enabled: z.boolean().default(false),
  serverUrl: z.string().default('https://caldav.icloud.com'),
  username: z.string().default(''),
  /** An Apple app-specific password — never the account password. */
  appPassword: z.string().default(''),
  calendarUrl: z.string().default(''),
  eventPrefix: z.string().default('Utleie: '),
  /** Push cancellations as calendar deletions rather than leaving stale events. */
  deleteOnCancel: z.boolean().default(true),
  includeGuestDetails: z.boolean().default(true),
  autoSync: z.boolean().default(true),
});

export const smtpSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default(''),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().default(''),
  password: z.string().default(''),
  from: z.string().default(''),
  replyTo: z.string().default(''),
  /** Where operator-facing alerts go. */
  operatorRecipients: z.string().default(''),
});

export const NOTIFICATION_EVENTS = [
  'booking.created',
  'booking.updated',
  'booking.cancelled',
  'deposit.paid',
  'deposit.returned',
  'contract.sent',
  'contract.signed',
  'checkin.reminder',
  'checkout.reminder',
  'power.reading',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_LABELS: Record<NotificationEvent, string> = {
  'booking.created': 'Ny booking registrert',
  'booking.updated': 'Booking endret',
  'booking.cancelled': 'Booking kansellert',
  'deposit.paid': 'Depositum betalt',
  'deposit.returned': 'Depositum tilbakebetalt',
  'contract.sent': 'Kontrakt sendt',
  'contract.signed': 'Kontrakt signert',
  'checkin.reminder': 'Påminnelse før innsjekk',
  'checkout.reminder': 'Påminnelse før utsjekk',
  'power.reading': 'Strømavlesning hentet',
};

const eventConfig = z.object({
  enabled: z.boolean().default(false),
  toGuest: z.boolean().default(false),
  toOperator: z.boolean().default(true),
  extraRecipients: z.string().default(''),
  /** Days before the event that a reminder fires (reminder events only). */
  leadDays: z.coerce.number().int().min(0).max(60).default(2),
  subject: z.string().default(''),
  body: z.string().default(''),
});
export type EventConfig = z.infer<typeof eventConfig>;

export const notificationsSchema = z.object({
  events: z.record(z.enum(NOTIFICATION_EVENTS), eventConfig).default({} as Record<NotificationEvent, EventConfig>),
});

export const esignSchema = z.object({
  provider: z.enum(['manual', 'webhook']).default('manual'),
  webhookUrl: z.string().default(''),
  apiKey: z.string().default(''),
  /** Displayed in the UI so the operator knows what is wired up. */
  notes: z.string().default(''),
});

export const contractSchema = z.object({
  title: z.string().default('Leieavtale for fritidsbolig'),
  template: z.string().default(''),
  footer: z.string().default(''),
  /** Show the power-consumption clause in the rendered contract. */
  includePowerClause: z.boolean().default(true),
});

/**
 * The landlord's scanned signature, stamped into the contract PDF above the
 * "Utleier" line. The image lives here as base64 rather than on disk so it
 * rides along with the ordinary settings backup and needs no writable volume.
 * pdfkit embeds JPEG and PNG directly, so the upload is stored as it arrived
 * (see lib/signature.ts, which validates it and caps its size).
 */
export const signatureSchema = z.object({
  enabled: z.boolean().default(true),
  /** Base64 JPEG or PNG without the data: prefix. Empty means nothing is stamped. */
  image: z.string().default(''),
  /** Which of the two the bytes are, for the data: URL the settings preview uses. */
  format: z.enum(['png', 'jpeg']).default('png'),
  /** Height of the stamped image in PDF points; the width follows the aspect ratio. */
  heightPt: z.coerce.number().int().min(16).max(120).default(44),
  /** Original file name and pixel size, shown in the UI so the operator knows what is stored. */
  filename: z.string().default(''),
  width: z.coerce.number().int().min(0).default(0),
  height: z.coerce.number().int().min(0).default(0),
});

export const securitySchema = z.object({
  sessionHours: z.coerce.number().int().min(1).max(720).default(12),
  maxFailedLogins: z.coerce.number().int().min(3).max(50).default(8),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440).default(15),
});

/** Registry of every settings group, its schema and which fields are secrets. */
export const SETTINGS = {
  property: { schema: propertySchema, secrets: [] as string[], adminOnly: false },
  bookingDefaults: { schema: bookingDefaultsSchema, secrets: [], adminOnly: false },
  season: { schema: seasonSchema, secrets: [], adminOnly: false },
  contract: { schema: contractSchema, secrets: [], adminOnly: false },
  signature: { schema: signatureSchema, secrets: [], adminOnly: false },
  notifications: { schema: notificationsSchema, secrets: [], adminOnly: false },
  tibber: { schema: tibberSchema, secrets: ['token', 'password'], adminOnly: true },
  caldav: { schema: caldavSchema, secrets: ['appPassword'], adminOnly: true },
  smtp: { schema: smtpSchema, secrets: ['password'], adminOnly: true },
  esign: { schema: esignSchema, secrets: ['apiKey'], adminOnly: true },
  security: { schema: securitySchema, secrets: [], adminOnly: true },
} as const;

export type SettingsKey = keyof typeof SETTINGS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

/** Read a settings group, merged over its defaults, with secrets decrypted. */
export async function getSettings<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const spec = SETTINGS[key];
  const raw = (row?.value ?? {}) as Record<string, unknown>;
  const decrypted: Record<string, unknown> = { ...raw };
  for (const field of spec.secrets) {
    const v = decrypted[field];
    if (isEncrypted(v)) {
      try {
        decrypted[field] = decryptSecret(v);
      } catch {
        decrypted[field] = '';
      }
    }
  }
  return spec.schema.parse(decrypted) as SettingsValue<K>;
}

/** Read a settings group for display: secrets replaced with a mask. */
export async function getSettingsMasked<K extends SettingsKey>(
  key: K,
): Promise<SettingsValue<K> & { __hasSecret: Record<string, boolean> }> {
  const value = await getSettings(key);
  const spec = SETTINGS[key];
  const hasSecret: Record<string, boolean> = {};
  const out = { ...(value as Record<string, unknown>) };
  for (const field of spec.secrets) {
    hasSecret[field] = Boolean(out[field]);
    out[field] = out[field] ? SECRET_MASK : '';
  }
  return { ...(out as SettingsValue<K>), __hasSecret: hasSecret };
}

/**
 * Persist a settings group. A secret submitted as the mask keeps its stored value,
 * so the UI never has to round-trip a plaintext credential.
 */
export async function saveSettings<K extends SettingsKey>(
  key: K,
  input: unknown,
  updatedBy?: string,
): Promise<SettingsValue<K>> {
  const spec = SETTINGS[key];
  const parsed = spec.schema.parse(input) as Record<string, unknown>;
  const current = await getSettings(key);
  const toStore: Record<string, unknown> = { ...parsed };
  for (const field of spec.secrets) {
    const submitted = parsed[field];
    const existing = (current as Record<string, unknown>)[field];
    const effective = submitted === SECRET_MASK ? existing : submitted;
    toStore[field] = effective ? encryptSecret(String(effective)) : '';
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: toStore as never, updatedBy },
    update: { value: toStore as never, updatedBy },
  });
  return spec.schema.parse({ ...parsed }) as SettingsValue<K>;
}
