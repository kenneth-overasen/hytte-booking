import type { Booking } from '@prisma/client';
import { fmtDate, fmtDateTime, fmtLongDate, nightsBetween, osloTime } from './datetime';
import { formatNok } from './money';
import { seasonLabel } from './pricing';
import type { propertySchema } from './settings';
import type { z } from 'zod';

export const DEFAULT_CONTRACT_TEMPLATE = `# {{kontraktstittel}}

Avtalenummer: {{referanse}}

## 1. Partene

**Utleier:** {{utleierNavn}}
{{utleierAdresse}}
Telefon: {{utleierTelefon}} · E-post: {{utleierEpost}}

**Leietaker:** {{gjestNavn}}
{{gjestAdresse}}
Telefon: {{gjestTelefon}} · E-post: {{gjestEpost}}

## 2. Leieobjektet

Avtalen gjelder leie av fritidsboligen **{{hytteNavn}}**{{#if hytteAdresse}}, {{hytteAdresse}}{{/if}}.
{{#if matrikkel}}Matrikkel: {{matrikkel}}{{/if}}

## 3. Leieperiode

Innsjekk: {{innsjekkDato}} kl. {{innsjekkTid}}
Utsjekk: {{utsjekkDato}} kl. {{utsjekkTid}}
Antall netter: {{antallNetter}}{{#if antallGjester}} · Antall personer: {{antallGjester}}{{/if}}

Leieobjektet skal være ryddet og forlatt senest ved avtalt utsjekktidspunkt.

## 4. Leiesum og betaling

Leiesum for perioden: **{{leiesum}}**{{#if prisgrunnlag}} ({{prisgrunnlag}}){{/if}}
Depositum: **{{depositum}}**

Leiesum og depositum betales til konto {{kontonummer}} innen avtalt forfall. Depositumet tilbakebetales innen 14 dager etter utsjekk, forutsatt at leieobjektet er forlatt i avtalt stand og at det ikke er påført skader eller manglende oppgjør for strøm.

## 5. Strøm

{{#if strømKlausul}}Strømforbruk i leieperioden måles og faktureres etter faktisk forbruk i tillegg til leiesummen, med mindre annet er avtalt skriftlig. Avlesning skjer ved inn- og utsjekk.{{/if}}

## 6. Leietakers plikter

- Leieobjektet skal behandles med normal aktsomhet og forlates rengjort.
- Leietaker er ansvarlig for skader påført av seg selv eller sitt reisefølge.
- Røyking innendørs er ikke tillatt.
- Husdyr kun etter skriftlig avtale med utleier.
- Antall overnattende kan ikke overstige det som er avtalt i punkt 3.
- Ro og orden skal overholdes av hensyn til naboer.

## 7. Avbestilling

Avbestilling må skje skriftlig til utleier. Ved avbestilling senere enn 30 dager før innsjekk kan utleier kreve hele eller deler av leiesummen dekket, med mindre perioden leies ut på nytt.

## 8. Ansvar

Utleier er ikke ansvarlig for leietakers personlige eiendeler, eller for tap som følge av strømbrudd, vannmangel eller andre forhold utenfor utleiers kontroll.

## 9. Signatur

Partene har lest og godtatt vilkårene i denne avtalen.

Sted og dato: {{signaturDato}}

{{signaturfelt}}

{{#if bunntekst}}{{bunntekst}}{{/if}}
`;

export type ContractContext = Record<string, string | undefined>;

export function buildContractContext(
  booking: Booking,
  property: z.infer<typeof propertySchema>,
  opts: { title: string; footer: string; includePowerClause: boolean; breakdown?: string },
): ContractContext {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  return {
    kontraktstittel: opts.title,
    referanse: booking.reference,

    utleierNavn: property.ownerName,
    utleierAdresse: property.ownerAddress,
    utleierTelefon: property.ownerPhone,
    utleierEpost: property.ownerEmail,

    gjestNavn: booking.guestName,
    gjestAdresse: booking.address ?? '',
    gjestTelefon: booking.phone ?? '',
    gjestEpost: booking.email ?? '',

    hytteNavn: property.name,
    hytteAdresse: property.address,
    matrikkel: property.cadastre,
    kontonummer: property.bankAccount || '(oppgis av utleier)',

    innsjekkDato: fmtDate(booking.checkIn),
    innsjekkTid: osloTime(booking.checkIn),
    utsjekkDato: fmtDate(booking.checkOut),
    utsjekkTid: osloTime(booking.checkOut),
    antallNetter: String(nights),
    antallGjester: booking.guests ? String(booking.guests) : '',

    leiesum: formatNok(booking.priceOre),
    depositum: formatNok(booking.depositOre),
    prisgrunnlag: booking.presetName ?? '',
    sesong: seasonLabel(booking.season),

    strømKlausul: opts.includePowerClause ? 'ja' : '',
    bunntekst: opts.footer,
    signaturDato: fmtLongDate(new Date()),
    signaturfelt: '__SIGNATURE_BLOCK__',
    generert: fmtDateTime(new Date()),
  };
}

/**
 * Minimal, dependency-free template renderer: {{var}} and {{#if var}}…{{/if}}.
 * Unknown variables render empty rather than leaking the placeholder into a PDF.
 */
export function renderTemplate(template: string, ctx: ContractContext): string {
  const truthy = (key: string) => {
    const v = ctx[key];
    return typeof v === 'string' && v.trim() !== '';
  };

  // Conditionals first, innermost-last via repeated passes.
  let out = template;
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(
      /\{\{#if\s+([\wæøåÆØÅ]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_m, key: string, body: string) => (truthy(key) ? body : ''),
    );
    if (next === out) break;
    out = next;
  }

  out = out.replace(/\{\{\s*([\wæøåÆØÅ]+)\s*\}\}/g, (_m, key: string) => ctx[key] ?? '');

  // Collapse the blank lines left behind by removed conditionals.
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export const CONTRACT_VARIABLES: { key: string; label: string }[] = [
  { key: 'kontraktstittel', label: 'Kontraktens tittel' },
  { key: 'referanse', label: 'Bookingreferanse' },
  { key: 'utleierNavn', label: 'Utleiers navn' },
  { key: 'utleierAdresse', label: 'Utleiers adresse' },
  { key: 'utleierTelefon', label: 'Utleiers telefon' },
  { key: 'utleierEpost', label: 'Utleiers e-post' },
  { key: 'gjestNavn', label: 'Leietakers navn' },
  { key: 'gjestAdresse', label: 'Leietakers adresse' },
  { key: 'gjestTelefon', label: 'Leietakers telefon' },
  { key: 'gjestEpost', label: 'Leietakers e-post' },
  { key: 'hytteNavn', label: 'Hyttas navn' },
  { key: 'hytteAdresse', label: 'Hyttas adresse' },
  { key: 'matrikkel', label: 'Matrikkelnummer' },
  { key: 'kontonummer', label: 'Kontonummer' },
  { key: 'innsjekkDato', label: 'Innsjekkdato' },
  { key: 'innsjekkTid', label: 'Innsjekktid' },
  { key: 'utsjekkDato', label: 'Utsjekkdato' },
  { key: 'utsjekkTid', label: 'Utsjekktid' },
  { key: 'antallNetter', label: 'Antall netter' },
  { key: 'antallGjester', label: 'Antall gjester' },
  { key: 'leiesum', label: 'Leiesum' },
  { key: 'depositum', label: 'Depositum' },
  { key: 'prisgrunnlag', label: 'Navn på prisregel' },
  { key: 'sesong', label: 'Sesong' },
  { key: 'strømKlausul', label: 'Strømklausul (av/på)' },
  { key: 'bunntekst', label: 'Bunntekst' },
  { key: 'signaturDato', label: 'Dagens dato' },
  { key: 'signaturfelt', label: 'Signaturfelt' },
];
