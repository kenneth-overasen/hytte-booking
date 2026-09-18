import 'server-only';
import type { Booking } from '@prisma/client';
import { prisma } from './../db';
import { getSettings } from './../settings';

/**
 * E-signing is deliberately abstracted. Adding a real provider (Signicat,
 * Verified, Dropbox Sign, …) means implementing this interface and registering
 * it in PROVIDERS — no other part of the app changes.
 */
export interface ESignProvider {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Send a document for signature. Returns whatever the caller should persist. */
  send(input: SendInput): Promise<SendResult>;
  /** Poll or reconcile status. Optional — providers with webhooks may no-op. */
  check?(reference: string): Promise<CheckResult>;
  /** Validate and interpret an inbound webhook payload. Optional. */
  handleWebhook?(payload: unknown, headers: Headers): Promise<WebhookResult>;
}

export type SendInput = {
  booking: Booking;
  pdf: Buffer;
  filename: string;
  signerName: string;
  signerEmail: string;
  subject: string;
};

export type SendResult = {
  reference: string;
  /** A URL the signer can be pointed at, when the provider offers one. */
  url?: string;
  message: string;
};

export type CheckResult = { status: 'pending' | 'signed' | 'declined'; signedAt?: Date; signedBy?: string };
export type WebhookResult = { reference: string; status: 'signed' | 'declined'; signedAt?: Date; signedBy?: string };

/**
 * The default: the contract PDF is produced and emailed, and the operator marks
 * it signed once the paper or scanned copy comes back. No external dependency.
 */
const manualProvider: ESignProvider = {
  id: 'manual',
  label: 'Manuell signering',
  description:
    'Kontrakten lastes ned eller sendes på e-post, og markeres som signert manuelt når den er i havn. Ingen ekstern tjeneste.',
  async send({ booking }) {
    return {
      reference: `manual-${booking.reference}`,
      message: 'Kontrakten er klar. Marker den som signert når signert eksemplar er mottatt.',
    };
  },
};

/**
 * A generic outbound webhook: POSTs the contract to a URL you control, letting
 * you bridge to any signing service without changing this codebase. The remote
 * side reports completion back to /api/esign/webhook.
 */
const webhookProvider: ESignProvider = {
  id: 'webhook',
  label: 'Webhook til egen tjeneste',
  description:
    'Sender kontrakten som JSON (med base64-PDF) til en URL du bestemmer. Tjenesten melder tilbake til /api/esign/webhook når den er signert.',
  async send({ booking, pdf, filename, signerName, signerEmail, subject }) {
    const cfg = await getSettings('esign');
    if (!cfg.webhookUrl) throw new Error('Webhook-URL er ikke konfigurert.');

    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        reference: booking.reference,
        bookingId: booking.id,
        subject,
        signer: { name: signerName, email: signerEmail },
        document: { filename, contentType: 'application/pdf', base64: pdf.toString('base64') },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Signeringstjenesten svarte HTTP ${res.status}: ${text.slice(0, 200)}`);

    let parsed: { reference?: string; url?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* a bare 200 is acceptable */
    }
    return {
      reference: parsed.reference ?? booking.reference,
      url: parsed.url,
      message: 'Kontrakten er sendt til signeringstjenesten.',
    };
  },
  async handleWebhook(payload) {
    const p = payload as { reference?: string; status?: string; signedAt?: string; signedBy?: string };
    if (!p.reference) throw new Error('Mangler "reference" i webhook-innholdet.');
    const status = p.status === 'signed' || p.status === 'completed' ? 'signed' : 'declined';
    return {
      reference: p.reference,
      status,
      signedAt: p.signedAt ? new Date(p.signedAt) : new Date(),
      signedBy: p.signedBy,
    };
  },
};

export const PROVIDERS: Record<string, ESignProvider> = {
  manual: manualProvider,
  webhook: webhookProvider,
};

export async function activeProvider(): Promise<ESignProvider> {
  const cfg = await getSettings('esign');
  return PROVIDERS[cfg.provider] ?? manualProvider;
}

export async function markSigned(bookingId: string, signedBy: string, signedAt = new Date()) {
  return prisma.booking.update({
    where: { id: bookingId },
    data: { contractStatus: 'SIGNED', contractSignedAt: signedAt, contractSignedBy: signedBy },
  });
}
