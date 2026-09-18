import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { osloDateKey } from '@/lib/datetime';
import { BookingForm, type PresetOption } from '../booking-form';

export const metadata: Metadata = { title: 'Ny booking' };
export const dynamic = 'force-dynamic';

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ dato?: string }> }) {
  await requireUser();
  const { dato } = await searchParams;

  const [presets, defaults] = await Promise.all([
    prisma.preset.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    getSettings('bookingDefaults'),
  ]);

  const start = dato && /^\d{4}-\d{2}-\d{2}$/.test(dato) ? dato : osloDateKey(new Date());
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Ny booking</h1>
        <p className="mt-0.5 text-sm text-muted">Pris, sesong og klokkeslett fylles inn automatisk fra prisreglene.</p>
      </div>

      <BookingForm
        presets={presets as PresetOption[]}
        initial={{
          guestName: '',
          phone: '',
          email: '',
          address: '',
          checkInDate: start,
          checkInTime: defaults.checkInTime,
          checkOutDate: end.toISOString().slice(0, 10),
          checkOutTime: defaults.checkOutTime,
          guests: null,
          status: 'TENTATIVE',
          presetId: '',
          priceOre: 0,
          priceOverridden: false,
          overrideReason: '',
          depositOre: defaults.defaultDepositOre,
          depositPaid: false,
          depositReturned: false,
          depositWithheldOre: 0,
          depositNote: '',
          powerFromDeposit: true,
          rentPaid: false,
          notes: '',
        }}
      />
    </div>
  );
}
