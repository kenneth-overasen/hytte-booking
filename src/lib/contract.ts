import type { Booking } from '@prisma/client';
import { fmtDate, fmtDateTime, fmtLongDate, nightsBetween, osloTime } from './datetime';
import { formatNok } from './money';
import { seasonLabel } from './pricing';
import type { bookingDefaultsSchema, propertySchema, tibberSchema } from './settings';
import type { z } from 'zod';

export const DEFAULT_CONTRACT_TEMPLATE = `# {{kontraktstittel}}

Avtalenummer: {{referanse}}

## 1. Partene

**Utleier:** {{utleierNavn}}
{{#if utleierAdresse}}Adresse: {{utleierAdresse}}
{{/if}}Telefon: {{utleierTelefon}} · E-post: {{utleierEpost}}

**Leietaker:** {{gjestNavn}}
{{#if gjestAdresse}}Adresse: {{gjestAdresse}}
{{/if}}Telefon: {{gjestTelefon}} · E-post: {{gjestEpost}}

## 2. Leieobjektet

Avtalen gjelder leie av fritidsboligen {{#if hytteAdresse}}**{{hytteAdresse}}**{{else}}**{{hytteNavn}}**{{/if}}.
{{#if matrikkel}}Matrikkel: {{matrikkel}}{{/if}}

## 3. Leieperiode

Innsjekk: {{innsjekkDato}} kl. {{innsjekkTid}}
Utsjekk: {{utsjekkDato}} kl. {{utsjekkTid}}
Antall netter: {{antallNetter}}{{#if antallGjester}} · Antall personer: {{antallGjester}}{{/if}}

Leieobjektet skal være ryddet og forlatt senest ved avtalt utsjekktidspunkt.

## 4. Leiesum og betaling

Leiesum for perioden: **{{leiesum}}**{{#if prisgrunnlag}} ({{prisgrunnlag}}){{/if}}
Depositum: **{{depositum}}**

Leiesum og depositum betales til konto {{kontonummer}}, eller med Vipps til {{utleierTelefon}} ({{utleierNavn}}), innen avtalt forfall. Depositumet tilbakebetales innen 14 dager etter utsjekk, forutsatt at leieobjektet er forlatt i avtalt stand og at det ikke er påført skader.

I leien inngår gass til gassgrill.

## 5. Strøm

{{#if strømKlausul}}Strømforbruk i leieperioden måles og faktureres etter faktisk forbruk i tillegg til leiesummen, med mindre annet er avtalt skriftlig. Forbruket leses av automatisk etter utleie, og trekkes fra depositumet.

{{#if fastStrømpris}}Strøm belastes med {{fastStrømpris}}.{{else}}Strøm belastes etter gjeldende spotpris for prisområdet i leieperioden.{{/if}}{{/if}}

## 6. Internett

Det er ikke internett på leieobjektet. Ruteren som står der er privat og benytter privat mobildata, og er ikke til leietakers disposisjon.

## 7. Leietakers plikter

Leietaker plikter å behandle hytta med aktsomhet og erstatte all skade som skyldes leietaker selv eller andre som benytter hytta. Hytta blir kontrollert ved avreise, og eventuelle skader blir belastet leietaker.

Røyking innendørs er ikke tillatt. Ro og orden skal overholdes av hensyn til naboer.

## 8. Utleiers plikter

Utleier plikter å sørge for at hytta er i forsvarlig stand ved leieforholdets start.

## 9. Opphør

Ved leieforholdets opphør forplikter leietaker seg til å levere hytta tilbake i rengjort stand, og til at de øvrige forpliktelsene i henhold til kontrakten er utført. {{#if rengjøringsgebyr}}Ved mangelfull rengjøring belastes leietaker {{rengjøringsgebyr}}.{{else}}Ved mangelfull rengjøring belastes leietaker for medgått tid.{{/if}}

## 10. Dyr

Det er tillatt med kjæledyr på hytta, men dette skal forhåndsgodkjennes skriftlig av utleier. Kjæledyr skal ikke være i sofa eller senger. Dersom kjæledyr medbringes, plikter leietaker å erstatte eventuelle skader dyret påfører hytta eller inventaret.

Det kreves grundig sluttrengjøring for å fjerne spor etter dyr. Dersom rengjøringen er mangelfull, vil utleier engasjere profesjonelle vaskere for leietakers regning.

## 11. Annet

Leieprisen omfatter ikke toalettpapir, sengetøy, håndklær, kjøkkenhåndklær, kjøkkenpapir, stearinlys o.l.

## 12. Avbestilling

Bestillingen er bindende for både utleier og leietaker, og kan ikke avbestilles med mindre begge parter samtykker i dette.

## 13. Signatur

Partene har lest og godtatt vilkårene i denne avtalen.

Denne leieavtalen er utstedt i 2 – to – eksemplarer, ett til hver av partene.

Sted og dato: {{signaturDato}}

{{signaturfelt}}

{{#if bunntekst}}{{bunntekst}}{{/if}}
`;

export type ContractContext = Record<string, string | undefined>;

/** "2,10 kr/kWh" — a rate per unit, so not the currency format formatNok gives. */
function formatPricePerKwh(kroner: number): string {
  const amount = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kroner);
  return `${amount} kr/kWh`;
}

/**
 * What the guest is billed per kWh, or null when there is no fixed rate to
 * quote and consumption follows the spot price. The markup is part of the rate
 * only when power is billed separately, which is the same condition under which
 * refreshBookingPower() applies it.
 */
function fixedPowerRate(
  tibber: z.infer<typeof tibberSchema>,
  defaults: z.infer<typeof bookingDefaultsSchema>,
): string | null {
  if (!tibber.useFixedPrice || tibber.fixedPrice <= 0) return null;
  const rate = defaults.chargePowerSeparately
    ? tibber.fixedPrice * (1 + defaults.powerMarkupPercent / 100)
    : tibber.fixedPrice;
  return `${formatPricePerKwh(rate)} ${tibber.fixedPriceIncludesVat ? 'inkl. mva' : 'eks. mva'}`;
}

export function buildContractContext(
  booking: Booking,
  property: z.infer<typeof propertySchema>,
  opts: {
    title: string;
    footer: string;
    includePowerClause: boolean;
    breakdown?: string;
    tibber: z.infer<typeof tibberSchema>;
    bookingDefaults: z.infer<typeof bookingDefaultsSchema>;
  },
): ContractContext {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const fastStrompris = fixedPowerRate(opts.tibber, opts.bookingDefaults);
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
    // Always reads as something: the rate when one is fixed, otherwise the word
    // for what the guest is charged instead. Branch on fastStrømpris, which is
    // empty in the spot-price case.
    strømpris: fastStrompris ?? 'spotpris',
    fastStrømpris: fastStrompris ?? '',
    rengjøringsgebyr: opts.bookingDefaults.cleaningFeeOre > 0 ? formatNok(opts.bookingDefaults.cleaningFeeOre) : '',
    bunntekst: opts.footer,
    signaturDato: fmtLongDate(new Date()),
    signaturfelt: '__SIGNATURE_BLOCK__',
    generert: fmtDateTime(new Date()),
  };
}

/** Splits a conditional body on its own {{else}}, if it has one. */
function splitOnElse(body: string): [string, string] {
  const match = /\{\{\s*else\s*\}\}/.exec(body);
  return match ? [body.slice(0, match.index), body.slice(match.index + match[0].length)] : [body, ''];
}

/**
 * Matches one innermost conditional: the body may not itself open an {{#if}},
 * so a nested block is always resolved before the block containing it, and an
 * {{else}} inside the body can only be this block's own.
 */
const INNERMOST_IF = /\{\{#if\s+([\wæøåÆØÅ]+)\}\}((?:(?!\{\{#if\s)[\s\S])*?)\{\{\/if\}\}/g;

/**
 * Minimal, dependency-free template renderer: {{var}}, {{#if var}}…{{/if}} and
 * {{#if var}}…{{else}}…{{/if}}. A variable counts as true when it is a
 * non-blank string, so an empty value and an absent one behave alike. Unknown
 * variables render empty rather than leaking the placeholder into a PDF.
 */
export function renderTemplate(template: string, ctx: ContractContext): string {
  const truthy = (key: string) => {
    const v = ctx[key];
    return typeof v === 'string' && v.trim() !== '';
  };

  // Conditionals first, resolving each innermost block and working outwards.
  let out = template;
  for (let pass = 0; pass < 10; pass++) {
    const next = out.replace(INNERMOST_IF, (_m, key: string, body: string) => {
      const [whenTrue, whenFalse] = splitOnElse(body);
      return truthy(key) ? whenTrue : whenFalse;
    });
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
  { key: 'strømpris', label: 'Strømpris, eller «spotpris»' },
  { key: 'fastStrømpris', label: 'Fast strømpris (tom ved spotpris)' },
  { key: 'rengjøringsgebyr', label: 'Rengjøringsgebyr' },
  { key: 'bunntekst', label: 'Bunntekst' },
  { key: 'signaturDato', label: 'Dagens dato' },
  { key: 'signaturfelt', label: 'Signaturfelt' },
];
