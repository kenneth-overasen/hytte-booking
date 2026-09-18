import 'server-only';
import { headers } from 'next/headers';
import { prisma } from './db';
import type { SessionUser } from './auth';

export async function audit(
  user: SessionUser | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: unknown,
): Promise<void> {
  try {
    const h = await headers();
    await prisma.auditLog.create({
      data: {
        userId: user?.id ?? null,
        actorName: user?.name ?? 'system',
        action,
        entity,
        entityId: entityId ?? null,
        detail: (detail ?? null) as never,
        ip: h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      },
    });
  } catch (err) {
    // Auditing must never break the operation it records.
    console.error('[audit]', err);
  }
}
