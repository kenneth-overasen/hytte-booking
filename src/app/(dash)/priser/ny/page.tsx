import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { PresetForm } from '../preset-form';

export const metadata: Metadata = { title: 'Ny prisregel' };
export const dynamic = 'force-dynamic';

export default async function NewPresetPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold tracking-tight">Ny prisregel</h1>
      <PresetForm
        initial={{
          name: '',
          description: '',
          season: 'ANY',
          pricingMode: 'FIXED',
          priceOre: 0,
          depositOre: null,
          minNights: null,
          maxNights: null,
          startWeekday: null,
          checkInTime: null,
          checkOutTime: null,
          priority: 0,
          active: true,
          sortOrder: 0,
        }}
      />
    </div>
  );
}
