'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { createBooking, updateBooking } from '@/lib/bookings';
import { bookingInputSchema } from '@/lib/validation';
import { parseKronerToOre } from '@/lib/money';
import { HttpError } from '@/lib/http';
import { notify, notifyAsync } from '@/lib/notifications';
import { pushBooking } from '@/lib/caldav';
import { refreshBookingPower } from '@/lib/tibber';
import { buildContractContext, renderTemplate } from '@/lib/contract';
import { renderContractPdf } from '@/lib/pdf';
import { loadPdfSignature } from '@/lib/signature';
import { getSettings } from '@/lib/settings';
import { activeProvider, markSigned } from '@/lib/esign';

export type BookingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  conflicts?: { reference: string; guestName: string }[];
};

const bool = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true';
const money = (fd: FormData, key: string) => parseKronerToOre(String(fd.get(key) ?? '')) ?? 0;

function toInput(fd: FormData) {
  return {
    guestName: String(fd.get('guestName') ?? ''),
    phone: String(fd.get('phone') ?? ''),
    email: String(fd.get('email') ?? ''),
    address: String(fd.get('address') ?? ''),
    checkInDate: String(fd.get('checkInDate') ?? ''),
    checkInTime: String(fd.get('checkInTime') ?? ''),
    checkOutDate: String(fd.get('checkOutDate') ?? ''),
    checkOutTime: String(fd.get('checkOutTime') ?? ''),
    guests: fd.get('guests') ? Number(fd.get('guests')) : null,
    status: String(fd.get('status') ?? 'TENTATIVE'),
    presetId: String(fd.get('presetId') ?? '') || null,
    priceOre: money(fd, 'price'),
    priceOverridden: bool(fd, 'priceOverridden'),
    overrideReason: String(fd.get('overrideReason') ?? ''),
    depositOre: money(fd, 'deposit'),
    depositPaid: bool(fd, 'depositPaid'),
    depositReturned: bool(fd, 'depositReturned'),
    depositWithheldOre: money(fd, 'depositWithheld'),
    depositNote: String(fd.get('depositNote') ?? ''),
    powerFromDeposit: bool(fd, 'powerFromDeposit'),
    rentPaid: bool(fd, 'rentPaid'),
    notes: String(fd.get('notes') ?? ''),
  };
}

export async function saveBookingAction(_prev: BookingFormState, fd: FormData): Promise<BookingFormState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');

  const parsed = bookingInputSchema.safeParse(toInput(fd));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      fieldErrors[key] ??= issue.message;
    }
    return { error: 'Skjemaet har feil som må rettes.', fieldErrors };
  }

  let bookingId: string;
  try {
    const previous = id ? await prisma.booking.findUnique({ where: { id } }) : null;
    const booking = id ? await updateBooking(id, parsed.data, user.id) : await createBooking(parsed.data, user.id);
    bookingId = booking.id;

    await audit(user, id ? 'booking.update' : 'booking.create', 'Booking', booking.id, {
      reference: booking.reference,
    });

    // Notifications reflect what actually changed.
    if (!id) {
      notifyAsync('booking.created', booking);
    } else if (previous) {
      if (previous.status !== 'CANCELLED' && booking.status === 'CANCELLED') notifyAsync('booking.cancelled', booking);
      else notifyAsync('booking.updated', booking);
      if (!previous.depositPaid && booking.depositPaid) notifyAsync('deposit.paid', booking);
      if (!previous.depositReturned && booking.depositReturned) notifyAsync('deposit.returned', booking);
    }

    const caldav = await getSettings('caldav');
    if (caldav.enabled && caldav.autoSync) void pushBooking(booking).catch(() => {});
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        error: err.message,
        conflicts: Array.isArray(err.detail)
          ? (err.detail as { reference: string; guestName: string }[]).map((c) => ({
              reference: c.reference,
              guestName: c.guestName,
            }))
          : undefined,
      };
    }
    console.error('[booking.save]', err);
    return { error: 'Kunne ikke lagre bookingen. Se serverloggen for detaljer.' };
  }

  revalidatePath('/bookinger');
  revalidatePath('/kalender');
  revalidatePath('/');
  redirect(`/bookinger/${bookingId}?lagret=1`);
}

export async function deleteBookingAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) redirect('/bookinger');

  // Remove the calendar event before the row disappears.
  const caldav = await getSettings('caldav');
  if (caldav.enabled && booking.calendarHref) {
    await pushBooking({ ...booking, status: 'CANCELLED' }).catch(() => {});
  }

  await prisma.booking.delete({ where: { id } });
  await audit(user, 'booking.delete', 'Booking', id, { reference: booking.reference });

  revalidatePath('/bookinger');
  revalidatePath('/kalender');
  redirect('/bookinger?slettet=1');
}

export type ActionState = { error?: string; success?: string };

export async function refreshPowerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return { error: 'Fant ikke bookingen.' };

  try {
    const reading = await refreshBookingPower(booking);
    await audit(user, 'power.refresh', 'Booking', id, { kwh: reading.kwh });
    const updated = await prisma.booking.findUnique({ where: { id } });
    if (updated) notifyAsync('power.reading', updated);
    revalidatePath(`/bookinger/${id}`);
    return { success: `Hentet ${reading.kwh} kWh${reading.source === 'mock' ? ' (simulert)' : ''}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Kunne ikke hente strømforbruk.' };
  }
}

export async function renderContractAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return { error: 'Fant ikke bookingen.' };

  const [property, contract] = await Promise.all([getSettings('property'), getSettings('contract')]);
  const ctx = buildContractContext(booking, property, {
    title: contract.title,
    footer: contract.footer,
    includePowerClause: contract.includePowerClause,
  });
  const rendered = renderTemplate(contract.template, ctx);

  await prisma.booking.update({
    where: { id },
    data: {
      contractHtml: rendered,
      contractRendered: new Date(),
      contractStatus: booking.contractStatus === 'SIGNED' ? 'SIGNED' : 'DRAFT',
    },
  });
  await audit(user, 'contract.render', 'Booking', id);
  revalidatePath(`/bookinger/${id}`);
  return { success: 'Kontrakten er generert på nytt fra malen.' };
}

export async function sendContractAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return { error: 'Fant ikke bookingen.' };

  const [property, contract, signature] = await Promise.all([
    getSettings('property'),
    getSettings('contract'),
    loadPdfSignature(),
  ]);
  const ctx = buildContractContext(booking, property, {
    title: contract.title,
    footer: contract.footer,
    includePowerClause: contract.includePowerClause,
  });
  const markdown = booking.contractHtml || renderTemplate(contract.template, ctx);
  const pdf = await renderContractPdf(markdown, {
    title: contract.title,
    reference: booking.reference,
    footer: property.name,
    signature,
  });
  const filename = `kontrakt-${booking.reference}.pdf`;

  try {
    const provider = await activeProvider();
    const result = await provider.send({
      booking,
      pdf,
      filename,
      signerName: booking.guestName,
      signerEmail: booking.email ?? '',
      subject: `${contract.title} — ${booking.reference}`,
    });

    await prisma.booking.update({
      where: { id },
      data: {
        contractStatus: 'SENT',
        esignProvider: provider.id,
        esignReference: result.reference,
        esignUrl: result.url ?? null,
      },
    });

    const mail = await notify('contract.sent', { ...booking, contractStatus: 'SENT' }, {
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
    await audit(user, 'contract.send', 'Booking', id, { provider: provider.id });
    revalidatePath(`/bookinger/${id}`);

    return {
      success: `${result.message}${mail.sent ? ` E-post sendt til ${mail.recipients?.join(', ')}.` : ` E-post ble ikke sendt: ${mail.reason}`}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Kunne ikke sende kontrakten.' };
  }
}

export async function markSignedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get('id') ?? '');
  const signedBy = String(fd.get('signedBy') ?? '').trim();
  if (!signedBy) return { error: 'Oppgi hvem som har signert.' };

  const booking = await markSigned(id, signedBy);
  await audit(user, 'contract.signed', 'Booking', id, { signedBy });
  notifyAsync('contract.signed', booking);
  revalidatePath(`/bookinger/${id}`);
  return { success: 'Kontrakten er markert som signert.' };
}

export async function syncBookingCalendarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(fd.get('id') ?? '');
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return { error: 'Fant ikke bookingen.' };

  const outcome = await pushBooking(booking);
  revalidatePath(`/bookinger/${id}`);
  if (outcome.error) return { error: outcome.error };
  return { success: outcome.action === 'deleted' ? 'Kalenderoppføringen er fjernet.' : 'Kalenderen er oppdatert.' };
}
