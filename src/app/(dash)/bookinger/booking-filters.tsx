'use client';

import { useRef } from 'react';
import { Input, Select } from '@/components/ui';

/**
 * The filters are a plain GET form, but changing a dropdown is already the
 * whole intent — so a change submits it. The search box still waits for Enter,
 * since half a name is not a query anyone wants results for.
 */
export function BookingFilters({
  q,
  status,
  periode,
  statusOptions,
  yearOptions,
}: {
  q: string;
  status: string;
  periode: string;
  statusOptions: [string, string][];
  yearOptions: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const apply = () => form.current?.requestSubmit();

  return (
    <form ref={form} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
      <Input name="q" defaultValue={q} placeholder="Søk på navn, e-post, telefon eller referanse" />
      <Select name="status" defaultValue={status} onChange={apply}>
        <option value="">Alle statuser</option>
        {statusOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select name="periode" defaultValue={periode} onChange={apply}>
        <option value="kommende">Kommende</option>
        <option value="tidligere">Tidligere</option>
        <option value="alle">Alle</option>
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </form>
  );
}
