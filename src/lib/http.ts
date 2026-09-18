import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { allowedOrigins } from './env';
import { getCurrentUser, type SessionUser } from './auth';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/**
 * Reject cross-site mutating requests. Cookies are SameSite=Lax, so this is a
 * second, explicit line of defence that also covers proxied setups.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // same-origin form posts and server-side fetches omit Origin
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const allowed = allowedOrigins();
  const normalized = origin.replace(/\/$/, '');

  if (allowed.includes(normalized)) return;
  try {
    if (host && new URL(normalized).host === host) return;
  } catch {
    /* fall through */
  }
  throw new HttpError(403, 'Forespørselen kom fra et ukjent opphav.');
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, 'Ikke innlogget.');
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Krever administratortilgang.');
  return user;
}

type Handler = () => Promise<Response>;

/** Wrap a route handler so thrown errors become clean JSON instead of stack traces. */
export async function handle(fn: Handler): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message, detail: err.detail }, { status: err.status });
    }
    if (typeof err === 'object' && err && 'name' in err && (err as { name: string }).name === 'ZodError') {
      return NextResponse.json(
        { error: 'Ugyldige data.', detail: (err as { issues?: unknown }).issues },
        { status: 422 },
      );
    }
    console.error('[api]', err);
    return NextResponse.json({ error: 'Uventet feil på serveren.' }, { status: 500 });
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
