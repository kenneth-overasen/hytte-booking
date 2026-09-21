'use client';

import { useEffect, useState } from 'react';
import { Alert, Checkbox, Field, Input, Select } from '@/components/ui';

const SPOT_PATH = 'summary.spot.inclVat';
const FIXED_PATH = 'summary.fixed.inclVat';

/**
 * The fixed-price switch and the cost path belong together: turning the switch
 * on means the cost has to be read from a different field in the response.
 * Swapping it here, visibly, beats doing it silently on the server — and a path
 * the operator has customised is left alone.
 */
export function PowerPriceFields({
  useFixedPrice,
  fixedPrice,
  costPath,
  costUnit,
}: {
  useFixedPrice: boolean;
  fixedPrice: number;
  costPath: string;
  costUnit: string;
}) {
  const [enabled, setEnabled] = useState(useFixedPrice);
  const [path, setPath] = useState(costPath);

  // React resets the form's DOM fields after a server action. Every other
  // checkbox here is uncontrolled, so it resets to defaultChecked - the value
  // that was just saved - and looks right. A controlled box resets to unchecked
  // while its state stays true, so checked={} never changes and React leaves the
  // DOM alone: an empty box above fields that are still showing. Hence
  // defaultChecked below, plus this resync so state follows a saved change.
  useEffect(() => {
    setEnabled(useFixedPrice);
  }, [useFixedPrice]);

  function toggle(on: boolean) {
    setEnabled(on);
    if (on && path === SPOT_PATH) setPath(FIXED_PATH);
    if (!on && path === FIXED_PATH) setPath(SPOT_PATH);
  }

  const mismatch = enabled && path === SPOT_PATH;

  return (
    <div className="space-y-4">
      <Checkbox
        name="useFixedPrice"
        defaultChecked={useFixedPrice}
        onChange={(e) => toggle(e.target.checked)}
        label="Bruk fastpris per kWh"
        hint="Gjesten faktureres én avtalt pris i stedet for spotprisen. Prisen sendes med forespørselen, og tjenesten regner ut beløpet. Utleier gjør opp differansen mot kraftleverandøren."
      />

      {enabled && (
        <div className="space-y-4">
          <Field
            label="Fastpris (kr per kWh)"
            hint="Ta med nettleie, avgifter og påslag her — gjesten skal bare forholde seg til én pris, og systemet legger ingenting oppå."
            className="sm:max-w-md"
          >
            <Input
              name="fixedPrice"
              type="number"
              step="0.0001"
              min={0}
              max={100}
              defaultValue={fixedPrice || ''}
              className="tnum"
            />
          </Field>
        </div>
      )}
      {!enabled && <input type="hidden" name="fixedPrice" value={fixedPrice} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Sti til kostnad i svaret"
          hint={
            enabled
              ? `Med fastpris ligger beløpet på ${FIXED_PATH} — pris × forbruk, uten noe påslag.`
              : `Med spotpris ligger beløpet på ${SPOT_PATH}. Det er kostnaden kraftleverandøren fakturerer utleier, og den viderefaktureres i sin helhet.`
          }
        >
          <Input
            name="costPath"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Enhet for kostnad">
          <Select name="costUnit" defaultValue={costUnit}>
            <option value="NOK">Kroner</option>
            <option value="ORE">Øre</option>
          </Select>
        </Field>
      </div>

      {mismatch && (
        <Alert kind="warning">
          Fastpris er på, men kostnaden leses fortsatt fra spotprisen. Bruk{' '}
          <code className="text-xs">{FIXED_PATH}</code> for å få beløpet gjesten skal betale.
        </Alert>
      )}
    </div>
  );
}
