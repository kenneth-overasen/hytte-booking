import 'server-only';
import { getSettings } from './settings';
import type { PdfSignature } from './pdf';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, type SignatureFormat } from './signature-format';

/** Past this the operator is told the contracts are getting heavy. */
const LARGE_UPLOAD_BYTES = 512 * 1024;

/**
 * pdfkit inflates a PNG's full raster to embed it, so pixel count — not file
 * size — is what can exhaust memory: a mostly-blank 20000×20000 PNG compresses
 * to almost nothing and expands to gigabytes. No signature scan comes close.
 */
const MAX_PIXELS = 25_000_000;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identify the upload from its leading bytes rather than its name or the
 * browser-supplied content type, both of which a client controls freely.
 */
export function sniffFormat(buf: Buffer): SignatureFormat | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

/** Width and height out of the PNG IHDR chunk, which is always first. */
function readPngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('PNG-filen mangler en gyldig header.');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

type JpegInfo = {
  width: number;
  height: number;
  /** EXIF orientation from IFD0, or 1 when absent. */
  orientation: number;
  /** Byte ranges of the EXIF APP1 segments, so they can be dropped. */
  exifRanges: { start: number; end: number }[];
};

/**
 * Walk the JPEG marker segments for the frame header and any EXIF block.
 * Everything from the start-of-scan marker onwards is entropy-coded data, so
 * the walk stops there.
 */
function readJpegInfo(buf: Buffer): JpegInfo {
  let width = 0;
  let height = 0;
  let orientation = 1;
  const exifRanges: { start: number; end: number }[] = [];

  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) throw new Error('JPEG-filen er skadet.');
    const marker = buf[i + 1]!;

    // Padding, and the standalone markers that carry no payload.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Start of scan, or end of image: nothing parsable follows.
    if (marker === 0xda || marker === 0xd9) break;

    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) throw new Error('JPEG-filen er skadet.');

    // Any start-of-frame marker carries the dimensions, baseline or not.
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader && !width) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
    }

    if (marker === 0xe1 && buf.subarray(i + 4, i + 10).toString('latin1') === 'Exif\u0000\u0000') {
      exifRanges.push({ start: i, end: i + 2 + length });
      orientation = readExifOrientation(buf.subarray(i + 10, i + 2 + length)) ?? orientation;
    }

    i += 2 + length;
  }

  if (!width || !height) throw new Error('Fant ingen bildestørrelse i JPEG-filen.');
  return { width, height, orientation, exifRanges };
}

/** Tag 0x0112 in IFD0. Returns null for anything malformed — it is only a hint. */
function readExifOrientation(tiff: Buffer): number | null {
  try {
    const order = tiff.subarray(0, 2).toString('latin1');
    if (order !== 'II' && order !== 'MM') return null;
    const be = order === 'MM';
    const u16 = (at: number) => (be ? tiff.readUInt16BE(at) : tiff.readUInt16LE(at));
    const u32 = (at: number) => (be ? tiff.readUInt32BE(at) : tiff.readUInt32LE(at));

    const ifd0 = u32(4);
    if (ifd0 + 2 > tiff.length) return null;
    const count = u16(ifd0);

    for (let e = 0; e < count; e++) {
      const entry = ifd0 + 2 + e * 12;
      if (entry + 12 > tiff.length) return null;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Rebuild the JPEG without the given segments, which are contiguous ranges. */
function dropRanges(buf: Buffer, ranges: { start: number; end: number }[]): Buffer {
  const keep: Buffer[] = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    keep.push(buf.subarray(cursor, start));
    cursor = end;
  }
  keep.push(buf.subarray(cursor));
  return Buffer.concat(keep);
}

export type NormalisedSignature = {
  bytes: Buffer;
  base64: string;
  format: SignatureFormat;
  width: number;
  height: number;
  /** The EXIF orientation that was stripped, when it was not the default. */
  rotated: boolean;
  /** True when the file is large enough to noticeably weigh down every contract. */
  large: boolean;
};

/**
 * Validate an uploaded signature and return the bytes to store.
 *
 * pdfkit embeds JPEG and PNG as-is, so there is nothing to convert. The one
 * thing that has to be fixed up is EXIF: a JPEG whose orientation tag is not 1
 * keeps that tag inside the PDF, and renderers disagree about whether to honour
 * it — Poppler rotates the stamp, leaving the signature lying on its side. The
 * tag is dropped so that the PDF, the browser preview and every viewer agree on
 * the pixels as stored; the caller tells the operator when that happened, since
 * the preview is then the sideways truth rather than what their photo viewer
 * showed them. Dropping EXIF also keeps camera and GPS metadata out of a
 * document that gets emailed to guests.
 *
 * Throws a message meant for the operator; callers surface it verbatim.
 */
export function normaliseSignature(input: Buffer): NormalisedSignature {
  if (input.length === 0) throw new Error('Filen er tom.');
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Filen er for stor (maks ${MAX_UPLOAD_MB} MB). Beskjær signaturen eller lagre den med lavere oppløsning.`,
    );
  }

  const format = sniffFormat(input);
  if (!format) throw new Error('Ukjent filformat. Last opp en JPG- eller PNG-fil.');

  let bytes = input;
  let width: number;
  let height: number;
  let rotated = false;

  if (format === 'png') {
    ({ width, height } = readPngSize(input));
  } else {
    const info = readJpegInfo(input);
    width = info.width;
    height = info.height;
    rotated = info.orientation !== 1;
    if (info.exifRanges.length > 0) bytes = dropRanges(input, info.exifRanges);
  }

  if (width * height > MAX_PIXELS) {
    throw new Error(
      `Bildet har for mange piksler (${width}×${height}). Beskjær signaturen — noen tusen piksler på bredden er rikelig.`,
    );
  }

  return {
    bytes,
    base64: bytes.toString('base64'),
    format,
    width,
    height,
    rotated,
    large: bytes.length > LARGE_UPLOAD_BYTES,
  };
}

/**
 * The stored signature in the shape renderContractPdf() wants, or undefined
 * when none is configured or it has been switched off. Every contract PDF goes
 * through this, so a stored value that no longer decodes is ignored rather than
 * allowed to break the download.
 */
export async function loadPdfSignature(): Promise<PdfSignature | undefined> {
  const settings = await getSettings('signature');
  if (!settings.enabled || !settings.image) return undefined;

  const bytes = Buffer.from(settings.image, 'base64');
  if (!sniffFormat(bytes)) return undefined;

  return { image: bytes, heightPt: settings.heightPt };
}
