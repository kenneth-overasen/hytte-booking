import 'server-only';
import PDFDocument from 'pdfkit';

type Line =
  | { kind: 'h1' | 'h2' | 'p' | 'li'; text: string }
  | { kind: 'spacer' }
  | { kind: 'signature' };

/** Parse the small markdown subset the contract template uses. */
function parse(markdown: string): Line[] {
  const lines: Line[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      lines.push({ kind: 'spacer' });
    } else if (line.includes('__SIGNATURE_BLOCK__')) {
      lines.push({ kind: 'signature' });
    } else if (line.startsWith('## ')) {
      lines.push({ kind: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      lines.push({ kind: 'h1', text: line.slice(2).trim() });
    } else if (/^[-*]\s+/.test(line)) {
      lines.push({ kind: 'li', text: line.replace(/^[-*]\s+/, '') });
    } else {
      lines.push({ kind: 'p', text: line.trim() });
    }
  }
  return lines;
}

/** Split on ** markers so bold runs can use a different font. */
function segments(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export type PdfMeta = { title: string; reference: string; footer?: string };

export async function renderContractPdf(markdown: string, meta: PdfMeta): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 72, left: 64, right: 64 },
    info: { Title: `${meta.title} – ${meta.reference}`, Producer: 'hytte-booking' },
    // pdfkit's bundled Helvetica uses WinAnsi, which covers æ/ø/å.
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const write = (text: string, opts: { bold?: boolean; size?: number; gap?: number; indent?: number } = {}) => {
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size ?? 10.5)
      .fillColor('#111111')
      .text(text, { align: 'left', indent: opts.indent ?? 0, lineGap: opts.gap ?? 1.5 });
  };

  const writeRich = (text: string, opts: { indent?: number } = {}) => {
    const parts = segments(text);
    if (parts.length === 1 && !parts[0]!.bold) return write(text, opts);
    doc.fontSize(10.5).fillColor('#111111');
    if (opts.indent) doc.text('', { continued: true, indent: opts.indent });
    parts.forEach((p, i) => {
      doc.font(p.bold ? 'Helvetica-Bold' : 'Helvetica').text(p.text, { continued: i < parts.length - 1, lineGap: 1.5 });
    });
  };

  for (const line of parse(markdown)) {
    // Keep headings with the text that follows them.
    if ((line.kind === 'h1' || line.kind === 'h2') && doc.y > doc.page.height - 160) doc.addPage();

    switch (line.kind) {
      case 'h1':
        doc.moveDown(0.2);
        write(line.text, { bold: true, size: 18, gap: 3 });
        doc
          .moveTo(doc.page.margins.left, doc.y + 4)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
          .strokeColor('#cccccc')
          .lineWidth(0.8)
          .stroke();
        doc.moveDown(0.9);
        break;
      case 'h2':
        doc.moveDown(0.6);
        write(line.text, { bold: true, size: 12.5, gap: 2 });
        doc.moveDown(0.25);
        break;
      case 'li':
        writeRich(`•  ${line.text}`, { indent: 10 });
        break;
      case 'p':
        writeRich(line.text);
        break;
      case 'spacer':
        doc.moveDown(0.5);
        break;
      case 'signature':
        signatureBlock(doc);
        break;
    }
  }

  // Footer with reference and page numbers on every page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 48;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777777')
      .text(`${meta.reference}${meta.footer ? ` · ${meta.footer}` : ''}`, doc.page.margins.left, y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'left',
        lineBreak: false,
      })
      .text(`Side ${i - range.start + 1} av ${range.count}`, doc.page.margins.left, y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'right',
        lineBreak: false,
      });
  }

  doc.end();
  return done;
}

function signatureBlock(doc: PDFKit.PDFDocument) {
  if (doc.y > doc.page.height - 190) doc.addPage();
  doc.moveDown(2.5);
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const colWidth = (usable - 40) / 2;
  const y = doc.y;

  for (const [i, label] of ['Utleier', 'Leietaker'].entries()) {
    const x = left + i * (colWidth + 40);
    doc.moveTo(x, y).lineTo(x + colWidth, y).strokeColor('#333333').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#555555').text(label, x, y + 6, { width: colWidth });
  }
  doc.y = y + 28;
}
