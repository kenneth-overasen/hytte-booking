/**
 * Operatørvelger på påloggingssiden.
 *
 * Når SHOW_OPERATOR_PICKER er på, lister innloggingsskjemaet navnene på aktive
 * operatører, slik at man velger seg selv i stedet for å skrive e-postadressen.
 * Passordet kreves som før — det eneste som svekkes er at gyldige e-postadresser
 * for operatører blir synlige for alle som når påloggingssiden. Derfor er
 * administratorer aldri med i listen: kontoen med flest rettigheter skal fortsatt
 * kreve at man vet adressen.
 *
 * Bevisst uten `server-only` og uten den zod-validerte `env()`-hjelperen: typen
 * importeres av innloggingsskjemaet, som er en klientkomponent. Samme mønster
 * som passordpolicyen i ./password.ts.
 */

/** Det påloggingssiden trenger om en operatør — aldri mer enn dette. */
export type OperatorOption = {
  email: string;
  name: string;
};

export function isOperatorPickerEnabled(): boolean {
  const raw = (process.env.SHOW_OPERATOR_PICKER ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
