import { prisma } from '@/lib/db';
import { handle, requireApiUser, HttpError } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { buildContractContext, renderTemplate, DEFAULT_CONTRACT_TEMPLATE } from '@/lib/contract';
import { renderContractPdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiUser();
    const { id } = await params;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new HttpError(404, 'Fant ikke bookingen.');

    const [property, contract] = await Promise.all([getSettings('property'), getSettings('contract')]);
    const ctx = buildContractContext(booking, property, {
      title: contract.title,
      footer: contract.footer,
      includePowerClause: contract.includePowerClause,
    });

    // Prefer the stored rendering so a downloaded PDF matches what was sent.
    const markdown = booking.contractHtml || renderTemplate(contract.template || DEFAULT_CONTRACT_TEMPLATE, ctx);
    const pdf = await renderContractPdf(markdown, {
      title: contract.title,
      reference: booking.reference,
      footer: property.name,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="kontrakt-${booking.reference}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  });
}
