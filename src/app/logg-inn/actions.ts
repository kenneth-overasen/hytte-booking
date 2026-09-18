'use server';

import { redirect } from 'next/navigation';
import { login } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ensureBootstrap } from '@/lib/bootstrap';

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureBootstrap();

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Fyll inn både e-post og passord.' };

  const result = await login(email, password);
  if (!result.ok) return { error: result.error };

  await audit(result.user, 'login', 'User', result.user.id);
  redirect(result.user.mustChangePassword ? '/konto?forste=1' : '/');
}
