'use server';

import { redirect } from 'next/navigation';
import { destroySession, getCurrentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await audit(user, 'logout', 'User', user.id);
  await destroySession();
  redirect('/logg-inn');
}
