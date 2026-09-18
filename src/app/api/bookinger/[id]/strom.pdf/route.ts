import { prisma } from '@/lib/db';
import { handle, requireApiUser, HttpError } from '@/lib/http';
import { fetchReportPdf } from '@/lib/tibber';
import { osloDateKey } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

/**
 * Proxy the power report PDF from the configured tibber-report service for this
 * booking's stay window. The document is passed through untouched, so it is
 * exactly what that tool would have produced.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiUser();
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { reference: true, checkIn: true, checkOut: true },
    });
    if (!booking) throw new HttpError(404, 'Fant ikke bookingen.');

    let pdf: Buffer;
    try {
      ({ pdf } = await fetchReportPdf(booking.checkIn, booking.checkOut));
    } catch (err) {
      // 502: the failure is upstream, not in this request.
      throw new HttpError(502, err instanceof Error ? err.message : 'Kunne ikke hente strømrapporten.');
    }

    // Name it after the booking rather than the upstream period, so a folder of
    // downloads sorts by stay.
    const filename = `strom-${booking.reference}-${osloDateKey(booking.checkIn)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  });
}
