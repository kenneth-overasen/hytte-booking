'use client';

import { useActionState } from 'react';
import { Alert, Button, Checkbox, Field, Input, inputClass } from '@/components/ui';
import { MAX_UPLOAD_MB, SIGNATURE_ACCEPT, SIGNATURE_MIME, type SignatureFormat } from '@/lib/signature-format';
import { saveSignatureAction, type SettingsState } from './actions';

export type SignatureFormProps = {
  image: string;
  format: SignatureFormat;
  filename: string;
  width: number;
  height: number;
  heightPt: number;
  enabled: boolean;
};

/**
 * Saving and removing share one form, and therefore one action state. Split
 * across two forms the removal confirmation would unmount with the button that
 * triggered it, leaving the previous upload's "lagret" message sitting next to
 * an emptied card.
 */
export function SignatureForm({ image, format, filename, width, height, heightPt, enabled }: SignatureFormProps) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSignatureAction, {});

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-4">
      {image ? (
        <div className="rounded-lg border border-border bg-white p-3">
          {/* A data URL already in hand: next/image has nothing left to optimise. */}
          {/* The white backdrop matches the PDF, so a dark-on-transparent scan stays visible. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${SIGNATURE_MIME[format]};base64,${image}`}
            alt="Lagret signatur"
            className="max-h-24 w-auto max-w-full object-contain"
          />
        </div>
      ) : (
        <Alert kind="info">Ingen signatur er lastet opp. Kontrakten skrives da ut med en tom signaturlinje.</Alert>
      )}

      <Field
        label={image ? 'Erstatt bildet' : 'Signaturbilde'}
        hint={
          filename
            ? `Lagret fra «${filename}» — ${format.toUpperCase()}, ${width}×${height} px. Last opp en ny fil for å erstatte den.`
            : `JPG eller PNG, maks ${MAX_UPLOAD_MB} MB. Beskjær bildet tett rundt signaturen: det legges inn i hver kontrakt.`
        }
      >
        <input
          type="file"
          name="file"
          accept={SIGNATURE_ACCEPT}
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-black/[0.06] file:px-3 file:py-1 file:text-sm dark:file:bg-white/[0.1]`}
        />
      </Field>

      <Field
        label="Høyde i kontrakten (punkter)"
        hint="Bredden følger bildets proporsjoner. 44 punkter tilsvarer omtrent 15 mm."
        className="sm:max-w-xs"
      >
        <Input name="heightPt" type="number" min={16} max={120} step={1} defaultValue={heightPt} />
      </Field>

      <Checkbox
        name="enabled"
        defaultChecked={enabled}
        label="Sett inn signaturen i kontrakten"
        hint="Slå av for å beholde bildet, men skrive ut kontrakten med tom signaturlinje."
      />

      {state.error && (
        <Alert kind="error">
          {state.error}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap text-xs">{state.detail}</pre>}
        </Alert>
      )}
      {state.success && (
        <Alert kind="success">
          {state.success}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap text-xs">{state.detail}</pre>}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Lagrer …' : 'Lagre signatur'}
        </Button>
        {image && (
          <Button
            type="submit"
            name="remove"
            value="1"
            variant="danger"
            disabled={pending}
            onClick={(e) => {
              if (!window.confirm('Fjerne det lagrede signaturbildet?')) e.preventDefault();
            }}
          >
            Fjern bilde
          </Button>
        )}
      </div>
    </form>
  );
}
