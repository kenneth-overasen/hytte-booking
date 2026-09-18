'use server';

import { revalidatePath } from 'next/cache';
import { changePassword, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';

export type PasswordState = { error?: string; success?: string };

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireSession();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  if (next !== repeat) return { error: 'De to nye passordene er ikke like.' };
  if (next === current) return { error: 'Det nye passordet må være forskjellig fra det gamle.' };

  const result = await changePassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  await audit(user, 'password.change', 'User', user.id);
  revalidatePath('/konto');
  return { success: 'Passordet er endret. Andre pålogginger er logget ut.' };
}
