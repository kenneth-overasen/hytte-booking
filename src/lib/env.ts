import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // 32+ byte base64 secret. Used to derive cookie + credential-encryption keys.
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  ADMIN_EMAIL: z.string().email().optional(),
  // Validated against the password policy in bootstrap.ts, not here.
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Comma-separated list of origins allowed to POST (CSRF origin check).
  ALLOWED_ORIGINS: z.string().optional(),
  // Set when the app sits behind a TLS-terminating proxy (Cloudflare Tunnel etc).
  TRUST_PROXY: z.string().optional(),
  // Relaxes the password rules for a closed, trusted network. See src/lib/password.ts.
  ALLOW_WEAK_PASSWORDS: z.string().optional(),
  // Lists operator names on the login screen. See src/lib/operator-picker.ts.
  SHOW_OPERATOR_PICKER: z.string().optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Ugyldig miljøkonfigurasjon:\n  ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => process.env.NODE_ENV === 'production';

export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
