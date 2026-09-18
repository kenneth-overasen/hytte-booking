import 'server-only';
import { z } from 'zod';
import { prisma } from './db';
import { sha256 } from './crypto';
import { env } from './env';

export const BACKUP_FORMAT = 'hytte-booking-backup';
export const BACKUP_VERSION = 1;

/**
 * A fingerprint of APP_SECRET. Integration credentials are encrypted with a key
 * derived from it, so a restore onto a different secret can warn up front.
 */
function secretFingerprint(): string {
  return sha256(`fingerprint:${env().APP_SECRET}`).slice(0, 16);
}

export type BackupFile = {
  format: string;
  version: number;
  exportedAt: string;
  appSecretFingerprint: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
};

export type ExportOptions = {
  includeUsers?: boolean;
  includeSettings?: boolean;
  includeLogs?: boolean;
};

export async function exportBackup(opts: ExportOptions = {}): Promise<BackupFile> {
  const includeUsers = opts.includeUsers ?? true;
  const includeSettings = opts.includeSettings ?? true;
  const includeLogs = opts.includeLogs ?? false;

  const [presets, bookings, users, settings, notificationLogs, auditLogs] = await Promise.all([
    prisma.preset.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.booking.findMany({ orderBy: { createdAt: 'asc' } }),
    includeUsers ? prisma.user.findMany({ orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
    includeSettings ? prisma.setting.findMany() : Promise.resolve([]),
    includeLogs ? prisma.notificationLog.findMany({ orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
    includeLogs ? prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
  ]);

  const data = {
    users,
    presets,
    // Decimal and Json fields serialise cleanly through JSON.parse(JSON.stringify()).
    bookings: JSON.parse(JSON.stringify(bookings)),
    settings,
    notificationLogs,
    auditLogs,
  };

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appSecretFingerprint: secretFingerprint(),
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length])),
    data,
  };
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  appSecretFingerprint: z.string().optional(),
  data: z.object({
    users: z.array(z.record(z.unknown())).default([]),
    presets: z.array(z.record(z.unknown())).default([]),
    bookings: z.array(z.record(z.unknown())).default([]),
    settings: z.array(z.record(z.unknown())).default([]),
    notificationLogs: z.array(z.record(z.unknown())).default([]),
    auditLogs: z.array(z.record(z.unknown())).default([]),
  }),
});

export type ImportMode = 'replace' | 'merge';

export type ImportResult = {
  mode: ImportMode;
  restored: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
};

const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'expiresAt', 'lastSeenAt', 'lastLoginAt', 'lockedUntil',
  'checkIn', 'checkOut', 'depositPaidAt', 'depositReturnedAt', 'rentPaidAt',
  'contractRendered', 'contractSignedAt', 'powerFetchedAt', 'calendarSyncedAt', 'sentAt',
]);

function revive(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = DATE_FIELDS.has(k) && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

/**
 * Restore a backup. `replace` wipes the relevant tables first so the result is
 * an exact copy; `merge` keeps existing rows and skips id collisions.
 */
export async function importBackup(raw: unknown, mode: ImportMode): Promise<ImportResult> {
  const parsed = backupSchema.parse(raw);
  const warnings: string[] = [];
  const restored: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  if (parsed.appSecretFingerprint && parsed.appSecretFingerprint !== secretFingerprint()) {
    warnings.push(
      'Sikkerhetskopien ble laget med en annen APP_SECRET. Krypterte integrasjonsnøkler (Tibber-token, SMTP-passord, app-passord for kalender) kan ikke dekrypteres og må legges inn på nytt.',
    );
  }
  if (parsed.data.users.length === 0) {
    warnings.push('Sikkerhetskopien inneholder ingen brukere — eksisterende brukere beholdes.');
  }

  await prisma.$transaction(
    async (tx) => {
      if (mode === 'replace') {
        await tx.notificationLog.deleteMany();
        await tx.auditLog.deleteMany();
        await tx.booking.deleteMany();
        await tx.preset.deleteMany();
        await tx.setting.deleteMany();
        if (parsed.data.users.length > 0) {
          await tx.session.deleteMany();
          await tx.user.deleteMany();
        }
      }

      const load = async (
        name: keyof ImportResult['restored'] & string,
        rows: Record<string, unknown>[],
        insert: (row: Record<string, unknown>) => Promise<unknown>,
      ) => {
        let ok = 0;
        let skip = 0;
        for (const row of rows) {
          try {
            await insert(revive(row));
            ok++;
          } catch {
            skip++;
          }
        }
        restored[name] = ok;
        skipped[name] = skip;
      };

      await load('users', parsed.data.users, (r) => tx.user.create({ data: r as never }));
      await load('presets', parsed.data.presets, (r) => tx.preset.create({ data: r as never }));
      await load('settings', parsed.data.settings, (r) =>
        tx.setting.upsert({
          where: { key: String(r.key) },
          create: r as never,
          update: { value: r.value as never },
        }),
      );
      await load('bookings', parsed.data.bookings, (r) => tx.booking.create({ data: r as never }));
      await load('notificationLogs', parsed.data.notificationLogs, (r) =>
        tx.notificationLog.create({ data: r as never }),
      );
      await load('auditLogs', parsed.data.auditLogs, (r) => tx.auditLog.create({ data: r as never }));
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  // Everything restored needs pushing to the calendar again.
  await prisma.booking.updateMany({ data: { calendarDirty: true } });

  return { mode, restored, skipped, warnings };
}

export function backupFilename(): string {
  return `hytte-booking-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}
