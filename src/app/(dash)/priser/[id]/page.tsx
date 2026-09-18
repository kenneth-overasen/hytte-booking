import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PresetForm } from '../preset-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const preset = await prisma.preset.findUnique({ where: { id }, select: { name: true } });
  return { title: preset?.name ?? 'Prisregel' };
}

export default async function EditPresetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const preset = await prisma.preset.findUnique({ where: { id } });
  if (!preset) notFound();

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold tracking-tight">{preset.name}</h1>
      <PresetForm
        initial={{
          id: preset.id,
          name: preset.name,
          description: preset.description ?? '',
          season: preset.season,
          pricingMode: preset.pricingMode,
          priceOre: preset.priceOre,
          depositOre: preset.depositOre,
          minNights: preset.minNights,
          maxNights: preset.maxNights,
          startWeekday: preset.startWeekday,
          checkInTime: preset.checkInTime,
          checkOutTime: preset.checkOutTime,
          priority: preset.priority,
          active: preset.active,
          sortOrder: preset.sortOrder,
        }}
      />
    </div>
  );
}
