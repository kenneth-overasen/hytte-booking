/**
 * The handful of signature facts the settings UI needs too. They live apart
 * from lib/signature.ts because that module is server-only — it works on
 * Buffers — and a client component importing it fails the build.
 */

export type SignatureFormat = 'png' | 'jpeg';

/** What the upload form accepts, and what the server's magic-byte sniffer recognises. */
export const SIGNATURE_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

export const SIGNATURE_MIME: Record<SignatureFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

/** The image is embedded in every generated contract, so keep it modest. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
