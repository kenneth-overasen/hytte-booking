'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin, requireUser, createUser } from '@/lib/auth';
import { passwordProblem } from '@/lib/password';
import { audit } from '@/lib/audit';
import { SETTINGS, saveSettings, NOTIFICATION_EVENTS, type SettingsKey } from '@/lib/settings';
import { testConnection, discoverCalendars, syncAllBookings, syncDirtyBookings } from '@/lib/caldav';
import { testTibber } from '@/lib/tibber';
import { testSmtp } from '@/lib/mail';
import { userInputSchema } from '@/lib/validation';
import { exportBackup, importBackup } from '@/lib/backup';

export type SettingsState = { error?: string; success?: string; detail?: string };

/** Booleans arrive as "on" (checked) or absent; everything else is a string. */
function formToObject(fd: FormData, booleanKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key === '_key' || value instanceof File) continue;
    out[key] = value;
  }
  for (const key of booleanKeys) out[key] = fd.get(key) === 'on';
  return out;
}

const BOOLEAN_FIELDS: Record<SettingsKey, string[]> = {
  property: [],
  bookingDefaults: ['chargePowerSeparately'],
  season: [],
  contract: ['includePowerClause'],
  notifications: [],
  tibber: ['enabled', 'mock', 'insecureTls', 'useFixedPrice', 'fixedPriceIncludesVat'],
  caldav: ['enabled', 'deleteOnCancel', 'includeGuestDetails', 'autoSync'],
  smtp: ['enabled', 'secure'],
  esign: [],
  security: [],
};

async function guard(key: SettingsKey) {
  return SETTINGS[key].adminOnly ? requireAdmin() : requireUser();
}

export async function saveSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const key = String(fd.get('_key') ?? '') as SettingsKey;
  if (!(key in SETTINGS)) return { error: 'Ukjent innstillingsgruppe.' };

  const user = await guard(key);
  try {
    await saveSettings(key, formToObject(fd, BOOLEAN_FIELDS[key]), user.id);
    await audit(user, 'settings.save', 'Setting', key);
    revalidatePath('/innstillinger');
    revalidatePath('/');
    return { success: 'Innstillingene er lagret.' };
  } catch (err) {
    if (typeof err === 'object' && err && 'issues' in err) {
      const issues = (err as { issues: { path: unknown[]; message: string }[] }).issues;
      return { error: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') };
    }
    return { error: err instanceof Error ? err.message : 'Kunne ikke lagre.' };
  }
}

/** Notification settings are a nested map, so they get their own encoder. */
export async function saveNotificationsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const events: Record<string, unknown> = {};

  for (const event of NOTIFICATION_EVENTS) {
    events[event] = {
      enabled: fd.get(`${event}.enabled`) === 'on',
      toGuest: fd.get(`${event}.toGuest`) === 'on',
      toOperator: fd.get(`${event}.toOperator`) === 'on',
      extraRecipients: String(fd.get(`${event}.extraRecipients`) ?? ''),
      leadDays: Number(fd.get(`${event}.leadDays`) ?? 2),
      subject: String(fd.get(`${event}.subject`) ?? ''),
      body: String(fd.get(`${event}.body`) ?? ''),
    };
  }

  try {
    await saveSettings('notifications', { events }, user.id);
    await audit(user, 'settings.save', 'Setting', 'notifications');
    revalidatePath('/innstillinger');
    return { success: 'Varslingsinnstillingene er lagret.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Kunne ikke lagre.' };
  }
}

// ------------------------------------------------------------ integration tests

export async function testTibberAction(_prev: SettingsState, _fd: FormData): Promise<SettingsState> {
  await requireAdmin();
  const result = await testTibber();
  return result.ok ? { success: result.message } : { error: result.message };
}

export async function testSmtpAction(_prev: SettingsState, _fd: FormData): Promise<SettingsState> {
  await requireAdmin();
  const result = await testSmtp();
  return result.ok ? { success: result.message } : { error: result.message };
}

export async function testCaldavAction(_prev: SettingsState, _fd: FormData): Promise<SettingsState> {
  await requireAdmin();
  const result = await testConnection();
  if (!result.ok) return { error: result.message };
  const list = (result.calendars ?? []).map((c) => `${c.displayName} → ${c.href}`).join('\n');
  return { success: result.message, detail: list };
}

export async function discoverCalendarsAction(_prev: SettingsState, _fd: FormData): Promise<SettingsState> {
  await requireAdmin();
  try {
    const calendars = await discoverCalendars();
    return {
      success: `Fant ${calendars.length} kalender(e). Kopier riktig URL inn i feltet «Kalender-URL».`,
      detail: calendars.map((c) => `${c.displayName}\n${c.href}`).join('\n\n'),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Kunne ikke hente kalenderlisten.' };
  }
}

export async function syncCalendarAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const all = fd.get('all') === 'true';
  const results = all ? await syncAllBookings() : await syncDirtyBookings();

  const failed = results.filter((r) => r.error);
  await audit(user, 'calendar.sync', 'Booking', null, { count: results.length, failed: failed.length });
  revalidatePath('/kalender');

  if (results.length === 0) return { success: 'Ingenting å synkronisere.' };
  if (failed.length > 0) {
    return {
      error: `${failed.length} av ${results.length} feilet.`,
      detail: failed.map((f) => `${f.reference}: ${f.error}`).join('\n'),
    };
  }
  return { success: `${results.length} booking(er) synkronisert.` };
}

// ------------------------------------------------------------ users

export async function createUserAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = userInputSchema.safeParse({
    email: String(fd.get('email') ?? ''),
    name: String(fd.get('name') ?? ''),
    role: String(fd.get('role') ?? 'OPERATOR'),
    password: String(fd.get('password') ?? ''),
    active: true,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(' · ') };
  }

  const problem = passwordProblem(parsed.data.password);
  if (problem) return { error: problem };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: 'Det finnes allerede en bruker med denne e-postadressen.' };

  const user = await createUser({ ...parsed.data, mustChangePassword: true });
  await audit(admin, 'user.create', 'User', user.id, { email: user.email, role: user.role });
  revalidatePath('/innstillinger');
  return { success: `Brukeren ${user.email} er opprettet og må bytte passord ved første pålogging.` };
}

export async function toggleUserAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get('id') ?? '');
  if (id === admin.id) return;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;

  // Never leave the system without an active administrator.
  if (user.active && user.role === 'ADMIN') {
    const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
    if (otherAdmins === 0) return;
  }

  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  if (user.active) await prisma.session.deleteMany({ where: { userId: id } });
  await audit(admin, user.active ? 'user.deactivate' : 'user.activate', 'User', id);
  revalidatePath('/innstillinger');
}

export async function resetUserPasswordAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const id = String(fd.get('id') ?? '');
  const password = String(fd.get('password') ?? '');

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const { hashPassword } = await import('@/lib/crypto');
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  });
  await prisma.session.deleteMany({ where: { userId: id } });
  await audit(admin, 'user.password.reset', 'User', id);
  revalidatePath('/innstillinger');
  return { success: 'Passordet er tilbakestilt. Brukeren må velge nytt passord ved neste pålogging.' };
}

// ------------------------------------------------------------ backup

export async function importBackupAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const file = fd.get('file');
  const mode = String(fd.get('mode') ?? 'merge') === 'replace' ? 'replace' : 'merge';

  if (!(file instanceof File) || file.size === 0) return { error: 'Velg en sikkerhetskopi (.json).' };
  if (file.size > 100 * 1024 * 1024) return { error: 'Filen er for stor (maks 100 MB).' };

  try {
    const parsed = JSON.parse(await file.text());
    const result = await importBackup(parsed, mode);
    await audit(admin, 'backup.import', 'System', null, { mode, restored: result.restored });

    const summary = Object.entries(result.restored)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ');
    const skipped = Object.entries(result.skipped)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ');

    revalidatePath('/');

    // A full restore replaces the user table, which invalidates every session
    // including this one. Send the operator to the login page with an
    // explanation rather than letting them land on a bare form.
    if (mode === 'replace' && (result.restored.users ?? 0) > 0) {
      redirect(`/logg-inn?gjenopprettet=${encodeURIComponent(summary || 'ok')}`);
    }

    return {
      success: `Gjenoppretting fullført (${mode === 'replace' ? 'full erstatning' : 'sammenslåing'}). Lagt inn — ${summary || 'ingenting'}.`,
      detail: [skipped ? `Hoppet over: ${skipped}` : '', ...result.warnings].filter(Boolean).join('\n'),
    };
  } catch (err) {
    // redirect() signals through a thrown error; let it pass.
    if (isRedirectError(err)) throw err;
    return { error: err instanceof Error ? err.message : 'Kunne ikke lese sikkerhetskopien.' };
  }
}

/** Next signals redirects by throwing; this distinguishes them from real failures. */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

export async function backupSummaryAction(): Promise<{ counts: Record<string, number> }> {
  await requireAdmin();
  const backup = await exportBackup({ includeLogs: false });
  return { counts: backup.counts };
}
