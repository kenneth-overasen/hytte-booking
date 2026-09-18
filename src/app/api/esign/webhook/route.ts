import { prisma } from '@/lib/db';
import { handle, json, HttpError } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { activeProvider } from '@/lib/esign';
import { safeEquals } from '@/lib/crypto';
import { notifyAsync } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Inbound completion callback from a signing service. Authenticated with the
 * configured API key — this endpoint is unauthenticated otherwise, so the key
 * must be set before the webhook provider is used.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const cfg = await getSettings('esign');
    if (cfg.provider !== 'webhook') throw new HttpError(404, 'Webhook-signering er ikke aktivert.');
    if (!cfg.apiKey) throw new HttpError(503, 'Ingen API-nøkkel konfigurert for signering.');

    const auth = request.headers.get('authorization') ?? '';
    const presented = auth.replace(/^Bearer\s+/i, '');
    if (!presented || !safeEquals(presented, cfg.apiKey)) {
      throw new HttpError(401, 'Ugyldig nøkkel.');
    }

    const provider = await activeProvider();
    if (!provider.handleWebhook) throw new HttpError(501, 'Leverandøren støtter ikke webhooks.');

    const payload = await request.json().catch(() => {
      throw new HttpError(400, 'Ugyldig JSON.');
    });
    const result = await provider.handleWebhook(payload, request.headers);

    const booking = await prisma.booking.findFirst({
      where: { OR: [{ esignReference: result.reference }, { reference: result.reference }] },
    });
    if (!booking) throw new HttpError(404, 'Fant ingen booking for referansen.');

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data:
        result.status === 'signed'
          ? {
              contractStatus: 'SIGNED',
              contractSignedAt: result.signedAt ?? new Date(),
              contractSignedBy: result.signedBy ?? booking.guestName,
            }
          : { contractStatus: 'DECLINED' },
    });

    if (result.status === 'signed') notifyAsync('contract.signed', updated);

    return json({ ok: true, reference: booking.reference, status: updated.contractStatus });
  });
}
