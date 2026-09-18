import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { getSettings } from './settings';

let cached: { key: string; transporter: Transporter } | null = null;

type SmtpCfg = Awaited<ReturnType<typeof getSettings<'smtp'>>>;

export async function getTransporter(override?: Partial<SmtpCfg>): Promise<{ transporter: Transporter; cfg: SmtpCfg }> {
  const cfg = { ...(await getSettings('smtp')), ...override } as SmtpCfg;
  if (!cfg.host) throw new Error('SMTP-tjener er ikke konfigurert.');

  const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.password]);
  if (cached?.key === key) return { transporter: cached.transporter, cfg };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  });
  cached = { key, transporter };
  return { transporter, cfg };
}

export type MailInput = {
  to: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

export async function sendMail(input: MailInput): Promise<void> {
  const { transporter, cfg } = await getTransporter();
  if (!cfg.enabled) throw new Error('E-postvarsling er slått av.');
  const recipients = [...new Set(input.to.map((t) => t.trim()).filter(Boolean))];
  if (recipients.length === 0) throw new Error('Ingen mottakere.');

  await transporter.sendMail({
    from: cfg.from || cfg.user,
    replyTo: cfg.replyTo || undefined,
    to: recipients,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
}

export async function testSmtp(override?: Partial<SmtpCfg>): Promise<{ ok: boolean; message: string }> {
  try {
    const { transporter } = await getTransporter(override);
    await transporter.verify();
    return { ok: true, message: 'Tilkobling til SMTP-tjeneren fungerer.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ukjent feil' };
  }
}

export function splitRecipients(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}
