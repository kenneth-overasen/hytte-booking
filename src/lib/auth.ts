import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role, User } from '@prisma/client';
import { prisma } from './db';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';
import { getSettings } from './settings';
import { passwordProblem } from './password';

export const SESSION_COOKIE = '__Host-hytte_session';
export const INSECURE_SESSION_COOKIE = 'hytte_session';

/**
 * Cookie security follows the request protocol, not NODE_ENV. A production
 * deployment served over plain HTTP still cannot set a Secure or __Host-
 * cookie: the browser drops it silently and every request looks signed out,
 * which shows up as an endless bounce back to /logg-inn.
 *
 * Detection is x-forwarded-proto, so a TLS-terminating proxy must set it.
 */
async function requestIsHttps(): Promise<boolean> {
  const h = await headers();
  return h.get('x-forwarded-proto') === 'https';
}

export async function sessionCookieName(): Promise<string> {
  return (await requestIsHttps()) ? SESSION_COOKIE : INSECURE_SESSION_COOKIE;
}

/**
 * Read the token under either name, so sessions issued before TLS was put in
 * front keep working afterwards instead of logging everyone out at once.
 */
async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? store.get(INSECURE_SESSION_COOKIE)?.value;
}

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'mustChangePassword'>;

function clientMeta(h: Headers) {
  const fwd = h.get('x-forwarded-for');
  const ip =
    (process.env.TRUST_PROXY === 'true' && fwd ? fwd.split(',')[0]!.trim() : h.get('cf-connecting-ip')) ??
    fwd?.split(',')[0]?.trim() ??
    'unknown';
  return { ip, userAgent: h.get('user-agent')?.slice(0, 255) ?? null };
}

export async function createSession(userId: string): Promise<void> {
  const security = await getSettings('security');
  const token = randomToken(32);
  const h = await headers();
  const { ip, userAgent } = clientMeta(h);
  const expiresAt = new Date(Date.now() + security.sessionHours * 3600_000);

  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ip, userAgent },
  });

  const store = await cookies();
  const https = await requestIsHttps();
  store.set(https ? SESSION_COOKIE : INSECURE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: https,
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = await readSessionToken();
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(INSECURE_SESSION_COOKIE);
}

let lastSweep = 0;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  // Keep lastSeenAt fresh without a write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  // Opportunistic cleanup of expired sessions, at most once an hour per process.
  if (Date.now() - lastSweep > 3600_000) {
    lastSweep = Date.now();
    prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  }

  const { id, email, name, role, mustChangePassword } = session.user;
  return { id, email, name, role, mustChangePassword };
}

/** A signed-in user, with no further conditions. Used by the shell layout. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/logg-inn');
  return user;
}

/**
 * A signed-in user who is ready to work. An account that still carries its
 * setup password is sent to /konto first — which is why the account page and
 * the shell layout use requireSession() instead, or this would loop.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.mustChangePassword) redirect('/konto?forste=1');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/?feil=admin-kreves');
  return user;
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; lockedUntil?: Date };

export async function login(email: string, password: string): Promise<LoginResult> {
  const security = await getSettings('security');
  const normalized = email.trim().toLowerCase();
  const h = await headers();
  const { ip } = clientMeta(h);

  // Throttle by IP regardless of which account is targeted.
  const recentFromIp = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gt: new Date(Date.now() - security.lockoutMinutes * 60_000) } },
  });
  if (recentFromIp >= security.maxFailedLogins * 3) {
    return { ok: false, error: 'For mange forsøk fra denne adressen. Prøv igjen senere.' };
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const record = (success: boolean) =>
    prisma.loginAttempt.create({ data: { email: normalized, ip, success } }).catch(() => {});

  if (!user || !user.active) {
    // Spend comparable time so a missing account is not detectable by timing.
    await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAA==');
    await record(false);
    return { ok: false, error: 'Feil e-post eller passord.' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(false);
    return { ok: false, error: 'Kontoen er midlertidig låst etter for mange forsøk.', lockedUntil: user.lockedUntil };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: failed >= security.maxFailedLogins ? new Date(Date.now() + security.lockoutMinutes * 60_000) : null,
      },
    });
    await record(false);
    return { ok: false, error: 'Feil e-post eller passord.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await record(true);
  await createSession(user.id);

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword },
  };
}

export async function changePassword(userId: string, current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Fant ikke brukeren.' };
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: 'Nåværende passord er feil.' };
  }
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // Invalidate every other session for this user.
  const token = await readSessionToken();
  await prisma.session.deleteMany({
    where: { userId, ...(token ? { NOT: { tokenHash: sha256(token) } } : {}) },
  });
  return { ok: true };
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  mustChangePassword?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      mustChangePassword: input.mustChangePassword ?? true,
    },
  });
}
