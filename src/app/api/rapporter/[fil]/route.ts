import { handle, requireApiUser, HttpError } from '@/lib/http';
import { annualReport, annualReportCsv } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** `fil` is "<year>.csv", e.g. /api/rapporter/2026.csv */
export async function GET(_request: Request, { params }: { params: Promise<{ fil: string }> }) {
  return handle(async () => {
    await requireApiUser();
    const { fil } = await params;

    const match = /^(\d{4})\.csv$/.exec(fil);
    if (!match) throw new HttpError(404, 'Ukjent rapport. Bruk formatet 2026.csv.');

    const year = Number(match[1]);
    const report = await annualReport(year);
    const csv = annualReportCsv(report);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inntekt-${year}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
