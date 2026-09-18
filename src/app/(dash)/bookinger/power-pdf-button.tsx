'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';

/**
 * Downloads the upstream power report. Fetched rather than linked so an upstream
 * failure lands as a readable message instead of a page of raw JSON.
 */
export function PowerPdfButton({ bookingId, disabledReason }: { bookingId: string; disabledReason?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookinger/${bookingId}/strom.pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Kunne ikke hente rapporten (HTTP ${res.status}).`);
      }

      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'stromrapport.pdf';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={download}
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason}
      >
        {pending ? 'Henter PDF …' : 'Last ned strømrapport (PDF)'}
      </Button>
      {disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
