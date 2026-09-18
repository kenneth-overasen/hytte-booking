'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { presetInputSchema } from '@/lib/validation';
import { parseKronerToOre } from '@/lib/money';

export type PresetFormState = { error?: string; fieldErrors?: Record<string, string> };

const num = (fd: FormData, key: string) => {
  const raw = String(fd.get(key) ?? '').trim();
  return raw === '' ? null : Number(raw);
};

export async function savePresetAction(_prev: PresetFormState, fd: FormData): Promise<PresetFormState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');

  const parsed = presetInputSchema.safeParse({
    name: String(fd.get('name') ?? ''),
    description: String(fd.get('description') ?? ''),
    season: String(fd.get('season') ?? 'ANY'),
    pricingMode: String(fd.get('pricingMode') ?? 'FIXED'),
    priceOre: parseKronerToOre(String(fd.get('price') ?? '')) ?? 0,
    depositOre: fd.get('deposit') ? parseKronerToOre(String(fd.get('deposit'))) : null,
    minNights: num(fd, 'minNights'),
    maxNights: num(fd, 'maxNights'),
    startWeekday: num(fd, 'startWeekday'),
    checkInTime: String(fd.get('checkInTime') ?? '') || null,
    checkOutTime: String(fd.get('checkOutTime') ?? '') || null,
    priority: num(fd, 'priority') ?? 0,
    active: fd.get('active') === 'on',
    sortOrder: num(fd, 'sortOrder') ?? 0,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      fieldErrors[key] ??= issue.message;
    }
    return { error: 'Skjemaet har feil som må rettes.', fieldErrors };
  }

  const data = {
    ...parsed.data,
    description: parsed.data.description || null,
  };

  const preset = id
    ? await prisma.preset.update({ where: { id }, data })
    : await prisma.preset.create({ data });

  await audit(user, id ? 'preset.update' : 'preset.create', 'Preset', preset.id, { name: preset.name });

  revalidatePath('/priser');
  revalidatePath('/bookinger');
  redirect('/priser?lagret=1');
}

export async function deletePresetAction(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');
  const preset = await prisma.preset.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
  if (!preset) redirect('/priser');

  if (preset._count.bookings > 0) {
    // Bookings keep a snapshot of the name, so deactivating preserves history.
    await prisma.preset.update({ where: { id }, data: { active: false } });
    await audit(user, 'preset.deactivate', 'Preset', id, { name: preset.name });
    revalidatePath('/priser');
    redirect('/priser?deaktivert=1');
  }

  await prisma.preset.delete({ where: { id } });
  await audit(user, 'preset.delete', 'Preset', id, { name: preset.name });
  revalidatePath('/priser');
  redirect('/priser?slettet=1');
}

export async function togglePresetAction(fd: FormData) {
  await requireUser();
  const id = String(fd.get('id') ?? '');
  const preset = await prisma.preset.findUnique({ where: { id } });
  if (preset) await prisma.preset.update({ where: { id }, data: { active: !preset.active } });
  revalidatePath('/priser');
}
