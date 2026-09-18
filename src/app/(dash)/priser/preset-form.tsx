'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { savePresetAction, type PresetFormState } from './actions';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { formatKroner } from '@/lib/money';

export type PresetValues = {
  id?: string;
  name: string;
  description: string;
  season: string;
  pricingMode: string;
  priceOre: number;
  depositOre: number | null;
  minNights: number | null;
  maxNights: number | null;
  startWeekday: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  priority: number;
  active: boolean;
  sortOrder: number;
};

export function PresetForm({ initial }: { initial: PresetValues }) {
  const [state, action, pending] = useActionState<PresetFormState, FormData>(savePresetAction, {});
  const [pricingMode, setPricingMode] = useState(initial.pricingMode);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert kind="error">{state.error}</Alert>}

      <Card title="Regelen">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Navn" required error={errors.name}>
            <Input name="name" defaultValue={initial.name} required placeholder="Sommeruke" />
          </Field>
          <Field label="Sesong" hint="Når regelen skal gjelde.">
            <Select name="season" defaultValue={initial.season}>
              <option value="ANY">Alle sesonger</option>
              <option value="SUMMER">Sommer</option>
              <option value="EASTER">Påske</option>
              <option value="CHRISTMAS">Jul og nyttår</option>
              <option value="OFFSEASON">Lavsesong</option>
            </Select>
          </Field>
          <Field label="Beskrivelse" className="sm:col-span-2">
            <Textarea name="description" rows={2} defaultValue={initial.description} />
          </Field>
        </div>
      </Card>

      <Card title="Pris">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prismodell">
            <Select name="pricingMode" value={pricingMode} onChange={(e) => setPricingMode(e.target.value)}>
              <option value="FIXED">Fastpris for hele oppholdet</option>
              <option value="PER_NIGHT">Pris per natt</option>
            </Select>
          </Field>
          <Field
            label={pricingMode === 'PER_NIGHT' ? 'Pris per natt (kr)' : 'Fastpris (kr)'}
            required
            error={errors.priceOre}
          >
            <Input name="price" inputMode="decimal" defaultValue={formatKroner(initial.priceOre)} required className="tnum" />
          </Field>
          <Field label="Depositum (kr)" hint="Tomt = systemets standard depositum." error={errors.depositOre}>
            <Input
              name="deposit"
              inputMode="decimal"
              defaultValue={initial.depositOre != null ? formatKroner(initial.depositOre) : ''}
              className="tnum"
            />
          </Field>
        </div>
      </Card>

      <Card title="Når passer regelen?" subtitle="Tomme felt betyr «spiller ingen rolle».">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum netter" error={errors.minNights}>
            <Input name="minNights" type="number" min={1} max={365} defaultValue={initial.minNights ?? ''} />
          </Field>
          <Field label="Maksimum netter" error={errors.maxNights}>
            <Input name="maxNights" type="number" min={1} max={365} defaultValue={initial.maxNights ?? ''} />
          </Field>
          <Field label="Må starte på ukedag" hint="For eksempel lørdag for ukesleie.">
            <Select name="startWeekday" defaultValue={initial.startWeekday ?? ''}>
              <option value="">Hvilken som helst</option>
              <option value="1">Mandag</option>
              <option value="2">Tirsdag</option>
              <option value="3">Onsdag</option>
              <option value="4">Torsdag</option>
              <option value="5">Fredag</option>
              <option value="6">Lørdag</option>
              <option value="7">Søndag</option>
            </Select>
          </Field>
          <Field label="Prioritet" hint="Høyest vinner når flere regler passer.">
            <Input name="priority" type="number" min={-100} max={100} defaultValue={initial.priority} />
          </Field>
        </div>
      </Card>

      <Card title="Klokkeslett" subtitle="Tomt = systemets standardtider.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Innsjekk">
            <Input name="checkInTime" type="time" defaultValue={initial.checkInTime ?? ''} />
          </Field>
          <Field label="Utsjekk">
            <Input name="checkOutTime" type="time" defaultValue={initial.checkOutTime ?? ''} />
          </Field>
          <Field label="Sortering" hint="Rekkefølge i nedtrekkslister.">
            <Input name="sortOrder" type="number" defaultValue={initial.sortOrder} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox name="active" defaultChecked={initial.active} label="Aktiv" />
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Lagrer …' : initial.id ? 'Lagre endringer' : 'Opprett prisregel'}
        </Button>
        <Link
          href="/priser"
          className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          Avbryt
        </Link>
      </div>
    </form>
  );
}
