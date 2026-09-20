import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettingsMasked, NOTIFICATION_EVENTS, NOTIFICATION_LABELS } from '@/lib/settings';
import { DEFAULT_TEMPLATES, resolveEventConfig } from '@/lib/notifications';
import { CONTRACT_VARIABLES, DEFAULT_CONTRACT_TEMPLATE } from '@/lib/contract';
import { Alert, Badge, Card, Checkbox, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { ConfirmForm } from '@/components/action-form';
import { formatKroner } from '@/lib/money';
import { describePolicy, passwordPolicy } from '@/lib/password';
import { isOperatorPickerEnabled } from '@/lib/operator-picker';
import { fmtDateTime } from '@/lib/datetime';
import { SettingsForm, ActionButton } from './settings-form';
import { PowerPriceFields } from './power-price-fields';
import {
  createUserAction,
  discoverCalendarsAction,
  importBackupAction,
  resetUserPasswordAction,
  saveNotificationsAction,
  saveSettingsAction,
  syncCalendarAction,
  testCaldavAction,
  testSmtpAction,
  testTibberAction,
  toggleUserAction,
} from './actions';

export const metadata: Metadata = { title: 'Innstillinger' };
export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'hytta', label: 'Hytta', admin: false },
  { id: 'booking', label: 'Booking', admin: false },
  { id: 'sesong', label: 'Sesonger', admin: false },
  { id: 'kontrakt', label: 'Kontraktmal', admin: false },
  { id: 'varsler', label: 'Varsler', admin: false },
  { id: 'epost', label: 'E-post', admin: true },
  { id: 'kalender', label: 'Kalender', admin: true },
  { id: 'strom', label: 'Strøm', admin: true },
  { id: 'signering', label: 'Signering', admin: true },
  { id: 'brukere', label: 'Brukere', admin: true },
  { id: 'sikkerhet', label: 'Sikkerhet', admin: true },
  { id: 'backup', label: 'Sikkerhetskopi', admin: true },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ fane?: string }> }) {
  const user = await requireUser();
  const { fane } = await searchParams;
  const isAdmin = user.role === 'ADMIN';

  const visible = TABS.filter((t) => !t.admin || isAdmin);
  const active = visible.find((t) => t.id === fane)?.id ?? visible[0]!.id;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Innstillinger</h1>
        <p className="mt-0.5 text-sm text-muted">
          {isAdmin
            ? 'Du er administrator og ser også system- og integrasjonsinnstillinger.'
            : 'Som operatør kan du endre alt bortsett fra system- og integrasjonsinnstillinger.'}
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {visible.map((tab) => (
          <Link
            key={tab.id}
            href={`/innstillinger?fane=${tab.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab.id === active
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {active === 'hytta' && <PropertyTab />}
      {active === 'booking' && <BookingTab />}
      {active === 'sesong' && <SeasonTab />}
      {active === 'kontrakt' && <ContractTab />}
      {active === 'varsler' && <NotificationsTab />}
      {active === 'epost' && <SmtpTab />}
      {active === 'kalender' && <CaldavTab />}
      {active === 'strom' && <TibberTab />}
      {active === 'signering' && <EsignTab />}
      {active === 'brukere' && <UsersTab currentUserId={user.id} />}
      {active === 'sikkerhet' && <SecurityTab />}
      {active === 'backup' && <BackupTab />}
    </div>
  );
}

// ---------------------------------------------------------------- tabs

async function PropertyTab() {
  const s = await getSettingsMasked('property');
  return (
    <Card title="Om hytta og utleier" subtitle="Brukes i kontrakter, e-poster og overskrifter.">
      <SettingsForm action={saveSettingsAction} settingsKey="property">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Navn på hytta" required>
            <Input name="name" defaultValue={s.name} required />
          </Field>
          <Field label="Adresse">
            <Input name="address" defaultValue={s.address} />
          </Field>
          <Field label="Matrikkel / gnr-bnr">
            <Input name="cadastre" defaultValue={s.cadastre} />
          </Field>
          <Field label="Maks antall gjester">
            <Input name="maxGuests" type="number" min={1} defaultValue={s.maxGuests} />
          </Field>
          <Field label="Utleiers navn">
            <Input name="ownerName" defaultValue={s.ownerName} />
          </Field>
          <Field label="Utleiers adresse">
            <Input name="ownerAddress" defaultValue={s.ownerAddress} />
          </Field>
          <Field label="Utleiers telefon">
            <Input name="ownerPhone" defaultValue={s.ownerPhone} />
          </Field>
          <Field label="Utleiers e-post">
            <Input name="ownerEmail" type="email" defaultValue={s.ownerEmail} />
          </Field>
          <Field label="Kontonummer" hint="Vises i kontrakten som betalingsinformasjon." className="sm:col-span-2">
            <Input name="bankAccount" defaultValue={s.bankAccount} />
          </Field>
        </div>
      </SettingsForm>
    </Card>
  );
}

async function BookingTab() {
  const s = await getSettingsMasked('bookingDefaults');
  return (
    <Card title="Standardverdier for bookinger" subtitle="Brukes når ingen prisregel sier noe annet.">
      <SettingsForm action={saveSettingsAction} settingsKey="bookingDefaults">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standard innsjekk">
            <Input name="checkInTime" type="time" defaultValue={s.checkInTime} />
          </Field>
          <Field label="Standard utsjekk">
            <Input name="checkOutTime" type="time" defaultValue={s.checkOutTime} />
          </Field>
          <Field label="Standard depositum (kr)">
            <Input name="defaultDepositOre" inputMode="decimal" defaultValue={formatKroner(s.defaultDepositOre)} className="tnum" />
          </Field>
          <Field label="Standard døgnpris (kr)" hint="Brukes når ingen prisregel passer.">
            <Input name="defaultNightlyOre" inputMode="decimal" defaultValue={formatKroner(s.defaultNightlyOre)} className="tnum" />
          </Field>
          <Field label="Prefiks for referansenummer" hint="Referansene blir «PREFIKS-ÅR-NNNN».">
            <Input name="referencePrefix" defaultValue={s.referencePrefix} maxLength={6} />
          </Field>
          <Field label="Påslag på strøm (%)" hint="Legges til strømkostnaden ved viderefakturering.">
            <Input name="powerMarkupPercent" type="number" min={0} max={100} step="0.1" defaultValue={s.powerMarkupPercent} />
          </Field>
        </div>
        <Checkbox
          name="chargePowerSeparately"
          defaultChecked={s.chargePowerSeparately}
          label="Fakturer strøm separat"
          hint="Strømforbruket hentet fra tibber-report legges til som egen post i rapportene."
        />
      </SettingsForm>
    </Card>
  );
}

async function SeasonTab() {
  const s = await getSettingsMasked('season');
  return (
    <div className="space-y-5">
      <Card title="Sesongperioder" subtitle="Avgjør hvilken prisregel som foreslås for et opphold.">
        <SettingsForm action={saveSettingsAction} settingsKey="season">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sommer starter (MM-DD)" hint="Defineres manuelt.">
              <Input name="summerStart" defaultValue={s.summerStart} placeholder="06-20" pattern="\d{2}-\d{2}" />
            </Field>
            <Field label="Sommer slutter (MM-DD)">
              <Input name="summerEnd" defaultValue={s.summerEnd} placeholder="08-10" pattern="\d{2}-\d{2}" />
            </Field>
            <Field label="Jul starter (MM-DD)" hint="Perioden kan gå over nyttår.">
              <Input name="christmasStart" defaultValue={s.christmasStart} placeholder="12-20" pattern="\d{2}-\d{2}" />
            </Field>
            <Field label="Jul slutter (MM-DD)">
              <Input name="christmasEnd" defaultValue={s.christmasEnd} placeholder="01-02" pattern="\d{2}-\d{2}" />
            </Field>
            <Field
              label="Påske starter (dager fra 1. påskedag)"
              hint="−8 = lørdagen før palmesøndag."
            >
              <Input name="easterStartOffset" type="number" min={-30} max={0} defaultValue={s.easterStartOffset} />
            </Field>
            <Field label="Påske slutter (dager fra 1. påskedag)" hint="+1 = 2. påskedag.">
              <Input name="easterEndOffset" type="number" min={0} max={30} defaultValue={s.easterEndOffset} />
            </Field>
            <Field
              label="Terskel for sesong"
              hint="Andel av nettene som må ligge i perioden. 0,5 = halvparten."
              className="sm:col-span-2"
            >
              <Input name="seasonThreshold" type="number" min={0.1} max={1} step="0.05" defaultValue={s.seasonThreshold} />
            </Field>
          </div>
        </SettingsForm>
      </Card>

      <Alert kind="info" title="Påsken beregnes automatisk">
        Datoene for påske regnes ut for hvert enkelt år etter den gregorianske påskeformelen — ingen ekstern tjeneste
        er nødvendig. Offentlige norske helligdager vises i kalenderen og i bookingskjemaet.
      </Alert>
    </div>
  );
}

async function ContractTab() {
  const s = await getSettingsMasked('contract');
  return (
    <div className="space-y-5">
      <Card title="Kontraktmal" subtitle="Malen fylles med bookingens data når kontrakten genereres.">
        <SettingsForm action={saveSettingsAction} settingsKey="contract">
          <Field label="Tittel">
            <Input name="title" defaultValue={s.title} />
          </Field>
          <Field
            label="Mal"
            hint="Støtter overskrifter med # og ##, punktlister med -, fet skrift med **tekst**, variabler med {{navn}} og betingelser med {{#if navn}} … {{/if}}."
          >
            <Textarea
              name="template"
              rows={22}
              defaultValue={s.template || DEFAULT_CONTRACT_TEMPLATE}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </Field>
          <Field label="Bunntekst" hint="Vises nederst på hver side i PDF-en.">
            <Input name="footer" defaultValue={s.footer} />
          </Field>
          <Checkbox name="includePowerClause" defaultChecked={s.includePowerClause} label="Ta med strømklausul" />
        </SettingsForm>
      </Card>

      <Card title="Tilgjengelige variabler">
        <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {CONTRACT_VARIABLES.map((v) => (
            <div key={v.key} className="flex justify-between gap-2 border-b border-border/50 py-1">
              <code className="text-accent">{`{{${v.key}}}`}</code>
              <span className="text-right text-muted">{v.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

async function NotificationsTab() {
  const configs = await Promise.all(
    NOTIFICATION_EVENTS.map(async (event) => ({ event, config: await resolveEventConfig(event) })),
  );

  return (
    <Card title="E-postvarsler" subtitle="Hvert varsel styres uavhengig. Krever at e-post er konfigurert.">
      <SettingsForm action={saveNotificationsAction}>
        <div className="space-y-3">
          {configs.map(({ event, config }) => {
            const isReminder = event.endsWith('.reminder');
            return (
              <details key={event} className="rounded-lg border border-border" open={config.enabled}>
                <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="font-medium">{NOTIFICATION_LABELS[event]}</span>
                  <Badge
                    className={
                      config.enabled
                        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-black/[0.06] text-muted dark:bg-white/[0.08]'
                    }
                  >
                    {config.enabled ? 'På' : 'Av'}
                  </Badge>
                </summary>

                <div className="space-y-3 border-t border-border px-3 py-3">
                  <div className="flex flex-wrap gap-x-6">
                    <Checkbox name={`${event}.enabled`} defaultChecked={config.enabled} label="Aktivt" />
                    <Checkbox name={`${event}.toGuest`} defaultChecked={config.toGuest} label="Send til gjesten" />
                    <Checkbox name={`${event}.toOperator`} defaultChecked={config.toOperator} label="Send til operatør" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ekstra mottakere" hint="Komma- eller linjeseparert.">
                      <Input name={`${event}.extraRecipients`} defaultValue={config.extraRecipients} />
                    </Field>
                    {isReminder && (
                      <Field label="Dager før hendelsen">
                        <Input name={`${event}.leadDays`} type="number" min={0} max={60} defaultValue={config.leadDays} />
                      </Field>
                    )}
                    {!isReminder && <input type="hidden" name={`${event}.leadDays`} value={config.leadDays} />}
                  </div>

                  <Field label="Emne">
                    <Input name={`${event}.subject`} defaultValue={config.subject} className="font-mono text-xs" />
                  </Field>
                  <Field
                    label="Tekst"
                    hint="Variabler: {{referanse}}, {{gjestNavn}}, {{innsjekk}}, {{utsjekk}}, {{leiesum}}, {{depositum}}, {{hytteNavn}}, {{utleierNavn}}, {{strømKwh}}, {{strømKostnad}}."
                  >
                    <Textarea
                      name={`${event}.body`}
                      rows={7}
                      defaultValue={config.body || DEFAULT_TEMPLATES[event].body}
                      className="font-mono text-xs"
                      spellCheck={false}
                    />
                  </Field>
                </div>
              </details>
            );
          })}
        </div>
      </SettingsForm>

      <div className="mt-5">
        <Alert kind="info" title="Påminnelser kjøres av et planlagt kall">
        <p className="mt-0.5">
          Påminnelser sendes når <code className="text-xs">/api/cron/paminnelser</code> kalles — for eksempel fra en
            cron-jobb én gang i døgnet. Nøkkelen finner du under Sikkerhet.
          </p>
        </Alert>
      </div>
    </Card>
  );
}

async function SmtpTab() {
  const s = await getSettingsMasked('smtp');
  return (
    <div className="space-y-5">
      <Card title="SMTP" subtitle="Utgående e-post for varsler og kontrakter.">
        <SettingsForm action={saveSettingsAction} settingsKey="smtp">
          <Checkbox name="enabled" defaultChecked={s.enabled} label="Aktiver e-postutsending" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tjener">
              <Input name="host" defaultValue={s.host} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <Input name="port" type="number" min={1} max={65535} defaultValue={s.port} />
            </Field>
            <Field label="Brukernavn">
              <Input name="user" defaultValue={s.user} autoComplete="off" />
            </Field>
            <Field label="Passord" hint={s.__hasSecret.password ? 'Lagret. La feltet stå for å beholde det.' : undefined}>
              <Input name="password" type="password" defaultValue={s.password} autoComplete="new-password" />
            </Field>
            <Field label="Avsender" hint="For eksempel: Hytta &lt;hytte@example.com&gt;">
              <Input name="from" defaultValue={s.from} />
            </Field>
            <Field label="Svar-til">
              <Input name="replyTo" defaultValue={s.replyTo} />
            </Field>
            <Field
              label="Operatørmottakere"
              hint="Hvem som får interne varsler. Komma- eller linjeseparert."
              className="sm:col-span-2"
            >
              <Textarea name="operatorRecipients" rows={2} defaultValue={s.operatorRecipients} />
            </Field>
          </div>
          <Checkbox name="secure" defaultChecked={s.secure} label="Bruk implisitt TLS (port 465)" hint="La stå av for STARTTLS på port 587." />
        </SettingsForm>
      </Card>

      <Card title="Test">
        <ActionButton action={testSmtpAction} label="Test tilkoblingen" pendingLabel="Tester …" />
      </Card>
    </div>
  );
}

async function CaldavTab() {
  const s = await getSettingsMasked('caldav');
  const dirty = await prisma.booking.count({ where: { calendarDirty: true, status: { not: 'CANCELLED' } } });

  return (
    <div className="space-y-5">
      <Card title="iCloud-kalender (CalDAV)" subtitle="Bookinger eksporteres som kalenderhendelser og oppdateres ved endring.">
        <SettingsForm action={saveSettingsAction} settingsKey="caldav">
          <Checkbox name="enabled" defaultChecked={s.enabled} label="Aktiver kalendersynkronisering" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tjener-URL">
              <Input name="serverUrl" defaultValue={s.serverUrl} />
            </Field>
            <Field label="Apple-ID">
              <Input name="username" defaultValue={s.username} autoComplete="off" placeholder="navn@icloud.com" />
            </Field>
            <Field
              label="App-spesifikt passord"
              hint={
                s.__hasSecret.appPassword
                  ? 'Lagret. La feltet stå for å beholde det.'
                  : 'Lag et app-spesifikt passord på appleid.apple.com — ikke bruk hovedpassordet.'
              }
            >
              <Input name="appPassword" type="password" defaultValue={s.appPassword} autoComplete="new-password" />
            </Field>
            <Field label="Prefiks på hendelser">
              <Input name="eventPrefix" defaultValue={s.eventPrefix} />
            </Field>
            <Field
              label="Kalender-URL"
              hint="Bruk «Finn kalendere» under for å hente riktig adresse."
              className="sm:col-span-2"
            >
              <Input name="calendarUrl" defaultValue={s.calendarUrl} className="font-mono text-xs" />
            </Field>
          </div>
          <Checkbox name="autoSync" defaultChecked={s.autoSync} label="Synkroniser automatisk når en booking lagres" />
          <Checkbox name="deleteOnCancel" defaultChecked={s.deleteOnCancel} label="Slett hendelsen når en booking kanselleres" />
          <Checkbox
            name="includeGuestDetails"
            defaultChecked={s.includeGuestDetails}
            label="Ta med telefon og e-post i hendelsesbeskrivelsen"
          />
        </SettingsForm>
      </Card>

      <Card title="Verktøy" subtitle={dirty > 0 ? `${dirty} booking(er) venter på synkronisering.` : 'Alt er synkronisert.'}>
        <div className="flex flex-wrap gap-3">
          <ActionButton action={testCaldavAction} label="Test tilkoblingen" pendingLabel="Tester …" />
          <ActionButton action={discoverCalendarsAction} label="Finn kalendere" pendingLabel="Søker …" />
          <ActionButton action={syncCalendarAction} label="Synkroniser endrede" pendingLabel="Synkroniserer …" />
          <ActionButton
            action={syncCalendarAction}
            hidden={{ all: 'true' }}
            label="Synkroniser alle på nytt"
            pendingLabel="Synkroniserer …"
            confirm="Sende alle bookinger til kalenderen på nytt?"
          />
        </div>
      </Card>

      <Card title="Abonnement" subtitle="Alternativ til CalDAV: abonner på en skrivebeskyttet kalenderstrøm.">
        <p className="text-sm text-muted">
          Last ned en .ics-fil med alle bookinger, eller abonner på den i kalenderappen.
        </p>
        <div className="mt-3">
          <LinkButton href="/api/kalender/feed.ics">Last ned .ics</LinkButton>
        </div>
      </Card>
    </div>
  );
}

async function TibberTab() {
  const s = await getSettingsMasked('tibber');
  return (
    <div className="space-y-5">
      <Card title="tibber-report" subtitle="Leser strømforbruk for oppholdsperioden fra din egen tjeneste.">
        <SettingsForm action={saveSettingsAction} settingsKey="tibber">
          <Checkbox name="enabled" defaultChecked={s.enabled} label="Aktiver strømavlesning" />
          <Checkbox
            name="mock"
            defaultChecked={s.mock}
            label="Bruk simulerte verdier"
            hint="Nyttig for å teste flyten før den virkelige tjenesten er koblet til."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base-URL" hint="For eksempel http://tibber-report:8000">
              <Input name="baseUrl" defaultValue={s.baseUrl} className="font-mono text-xs" />
            </Field>
            <Field label="Metode">
              <Select name="method" defaultValue={s.method}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </Select>
            </Field>
            <Field
              label="Sti"
              hint="Plassholdere: {{fromLocal}} {{toLocal}} (lokal tid), {{from}} {{to}} (UTC-ISO), {{fromDate}} {{toDate}} (ÅÅÅÅ-MM-DD), {{fromEpoch}} {{toEpoch}}."
              className="sm:col-span-2"
            >
              <Input name="path" defaultValue={s.path} className="font-mono text-xs" />
            </Field>
            <Field
              label="Sti til PDF-rapport"
              hint="Samme metode, body og autentisering som over. Tom = ingen nedlastingsknapp på bookingen."
              className="sm:col-span-2"
            >
              <Input name="pdfPath" defaultValue={s.pdfPath} className="font-mono text-xs" />
            </Field>
            <Field
              label="JSON-body (kun POST)"
              hint='Har Tibber-kontoen flere boliger, legg til "postal_code": "1747" eller "home_id": "…" her.'
              className="sm:col-span-2"
            >
              <Textarea name="body" rows={3} defaultValue={s.body} className="font-mono text-xs" spellCheck={false} />
            </Field>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Autentisering">
              <Select name="authType" defaultValue={s.authType}>
                <option value="none">Ingen</option>
                <option value="bearer">Bearer-token</option>
                <option value="header">Egendefinert header</option>
                <option value="basic">Basic (brukernavn/passord)</option>
              </Select>
            </Field>
            <Field label="Headernavn" hint="Kun ved «Egendefinert header».">
              <Input name="headerName" defaultValue={s.headerName} />
            </Field>
            <Field label="Token" hint={s.__hasSecret.token ? 'Lagret. La feltet stå for å beholde det.' : undefined}>
              <Input name="token" type="password" defaultValue={s.token} autoComplete="new-password" />
            </Field>
            <Field label="Brukernavn (basic)">
              <Input name="username" defaultValue={s.username} autoComplete="off" />
            </Field>
            <Field label="Passord (basic)" hint={s.__hasSecret.password ? 'Lagret.' : undefined}>
              <Input name="password" type="password" defaultValue={s.password} autoComplete="new-password" />
            </Field>
            <Field label="Tidsavbrudd (ms)">
              <Input name="timeoutMs" type="number" min={1000} max={120000} defaultValue={s.timeoutMs} />
            </Field>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <Field
              label="Sti til kWh i svaret"
              hint="Punktnotasjon. Bruk [] for å summere en liste, f.eks. data.nodes[].consumption"
              className="sm:max-w-md"
            >
              <Input name="kwhPath" defaultValue={s.kwhPath} className="font-mono text-xs" />
            </Field>

            <PowerPriceFields
              useFixedPrice={s.useFixedPrice}
              fixedPrice={s.fixedPrice}
              fixedPriceIncludesVat={s.fixedPriceIncludesVat}
              costPath={s.costPath}
              costUnit={s.costUnit}
            />
          </div>

          <Checkbox
            name="insecureTls"
            defaultChecked={s.insecureTls}
            label="Godta selvsignert sertifikat"
            hint="Bare for tjenester på ditt eget nettverk."
          />
        </SettingsForm>
      </Card>

      <Card title="Test" subtitle="Henter forbruket for de siste sju dagene.">
        <ActionButton action={testTibberAction} label="Test tilkoblingen" pendingLabel="Henter …" />
      </Card>

      <Alert kind="info" title="Standardverdiene peker på tibber-report">
        Feltene over er forhåndsutfylt for <code className="text-xs">POST /api/report</code> og{' '}
        <code className="text-xs">/api/report.pdf</code> i det selvhostede tibber-report-verktøyet. Sett bare
        base-URL, så er resten på plass. Tidspunktene sendes som absolutte ISO-tidspunkter, slik at en innsjekk
        klokka 15:00 leses som 15:00 — også over sommertidsskiftet.
      </Alert>
    </div>
  );
}

async function EsignTab() {
  const s = await getSettingsMasked('esign');
  return (
    <div className="space-y-5">
      <Card title="Elektronisk signering" subtitle="Leverandøren er ikke låst — velg når du har bestemt deg.">
        <SettingsForm action={saveSettingsAction} settingsKey="esign">
          <Field label="Metode">
            <Select name="provider" defaultValue={s.provider}>
              <option value="manual">Manuell signering</option>
              <option value="webhook">Webhook til egen tjeneste</option>
            </Select>
          </Field>
          <Field
            label="Webhook-URL"
            hint="Mottar POST med kontrakten som base64-PDF. Skal svare med JSON: { reference, url }."
          >
            <Input name="webhookUrl" defaultValue={s.webhookUrl} className="font-mono text-xs" />
          </Field>
          <Field label="API-nøkkel" hint={s.__hasSecret.apiKey ? 'Lagret.' : 'Sendes som Bearer-token.'}>
            <Input name="apiKey" type="password" defaultValue={s.apiKey} autoComplete="new-password" />
          </Field>
          <Field label="Notat">
            <Textarea name="notes" rows={2} defaultValue={s.notes} />
          </Field>
        </SettingsForm>
      </Card>

      <Alert kind="info" title="Slik legges en ekte leverandør inn">
        Signering er lagt bak et grensesnitt i <code className="text-xs">src/lib/esign/index.ts</code>. En ny
        leverandør (BankID via Signicat eller Verified, Dropbox Sign, eller annet) implementeres der og registreres i{' '}
        <code className="text-xs">PROVIDERS</code> — ingen andre deler av systemet må endres. Tilbakemelding om signert
        dokument mottas på <code className="text-xs">/api/esign/webhook</code>.
      </Alert>
    </div>
  );
}

async function SecurityTab() {
  const s = await getSettingsMasked('security');
  const recentFailures = await prisma.loginAttempt.findMany({
    where: { success: false, createdAt: { gt: new Date(Date.now() - 7 * 86400000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const audits = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });

  const policy = passwordPolicy();
  const operatorPicker = isOperatorPickerEnabled();

  return (
    <div className="space-y-5">
      {operatorPicker && (
        <Alert kind="warning" title="Operatørene vises på påloggingssiden">
          <code className="text-xs">SHOW_OPERATOR_PICKER</code> er på, så navnene og e-postadressene til aktive
          operatører er synlige for alle som når påloggingssiden. Greit på et lukket nett — fjern variabelen i{' '}
          <code className="text-xs">.env</code> og start appen på nytt før systemet gjøres tilgjengelig utenfra.
          Administratorer står aldri i listen, og passordet kreves som før.
        </Alert>
      )}

      {policy.relaxed && (
        <Alert kind="warning" title="Kravene til sterkt passord er slått av">
          <code className="text-xs">ALLOW_WEAK_PASSWORDS</code> er på, så passord trenger bare {policy.minLength} tegn
          uten krav til tall eller spesialtegn. Greit på et lukket nett — fjern variabelen i <code className="text-xs">.env</code>{' '}
          og start appen på nytt før systemet gjøres tilgjengelig utenfra. Eksisterende passord berøres ikke, så husk å
          bytte dem samtidig.
        </Alert>
      )}

      <Card title="Pålogging">
        <SettingsForm action={saveSettingsAction} settingsKey="security">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Øktlengde (timer)">
              <Input name="sessionHours" type="number" min={1} max={720} defaultValue={s.sessionHours} />
            </Field>
            <Field label="Maks mislykkede forsøk">
              <Input name="maxFailedLogins" type="number" min={3} max={50} defaultValue={s.maxFailedLogins} />
            </Field>
            <Field label="Utestengning (minutter)">
              <Input name="lockoutMinutes" type="number" min={1} max={1440} defaultValue={s.lockoutMinutes} />
            </Field>
          </div>
        </SettingsForm>
      </Card>

      <Card title="Planlagte jobber">
        <p className="text-sm text-muted">
          Påminnelser og kalendersynk kan kjøres fra en cron-jobb. Kall endepunktet med nøkkelen fra miljøvariabelen{' '}
          <code className="text-xs">APP_SECRET</code> som Bearer-token:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/[0.04] p-3 text-xs dark:bg-white/[0.06]">
{`0 8 * * *  curl -fsS -H "Authorization: Bearer $APP_SECRET" \\
             http://localhost:3000/api/cron/paminnelser`}
        </pre>
      </Card>

      <Card title="Mislykkede påloggingsforsøk (siste 7 dager)">
        {recentFailures.length === 0 ? (
          <p className="text-sm text-muted">Ingen mislykkede forsøk.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recentFailures.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-1.5">
                <span>{a.email}</span>
                <span className="text-xs text-muted">{a.ip}</span>
                <span className="tnum text-xs text-muted">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Hendelseslogg">
        <ul className="divide-y divide-border text-sm">
          {audits.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <code className="text-xs text-accent">{a.action}</code> {a.entity}
                {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}
              </span>
              <span className="text-xs text-muted">{a.actorName}</span>
              <span className="tnum text-xs text-muted">{fmtDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function UsersTab({ currentUserId }: { currentUserId: string }) {
  const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  const policy = passwordPolicy();

  return (
    <div className="space-y-5">
      <Card title="Brukere" subtitle="Operatører kan gjøre alt bortsett fra system- og integrasjonsinnstillinger.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Navn</th>
                <th className="py-2 pr-3 font-medium">E-post</th>
                <th className="py-2 pr-3 font-medium">Rolle</th>
                <th className="py-2 pr-3 font-medium">Sist innlogget</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-55'}>
                  <td className="py-2 pr-3">
                    {u.name}
                    {u.id === currentUserId && <span className="ml-1.5 text-xs text-muted">(deg)</span>}
                    {!u.active && <Badge className="ml-2 bg-black/[0.06] dark:bg-white/[0.1]">Deaktivert</Badge>}
                    {u.mustChangePassword && (
                      <Badge className="ml-2 bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
                        Må bytte passord
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted">{u.email}</td>
                  <td className="py-2 pr-3">{u.role === 'ADMIN' ? 'Administrator' : 'Operatør'}</td>
                  <td className="tnum py-2 pr-3 text-xs text-muted">
                    {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'aldri'}
                  </td>
                  <td className="py-2 text-right">
                    {u.id !== currentUserId && (
                      <ConfirmForm
                        action={toggleUserAction}
                        hidden={{ id: u.id }}
                        variant="ghost"
                        label={u.active ? 'Deaktiver' : 'Aktiver'}
                        confirm={
                          u.active
                            ? `Deaktivere ${u.email}? Brukeren logges ut umiddelbart.`
                            : `Aktivere ${u.email} igjen?`
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Ny bruker" subtitle="Brukeren må velge sitt eget passord ved første pålogging.">
        <SettingsForm action={createUserAction} label="Opprett bruker">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Navn" required>
              <Input name="name" required autoComplete="off" />
            </Field>
            <Field label="E-post" required>
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Rolle">
              <Select name="role" defaultValue="OPERATOR">
                <option value="OPERATOR">Operatør</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </Field>
            <Field label="Midlertidig passord" required hint={describePolicy(policy)}>
              <Input name="password" type="password" required minLength={policy.minLength} autoComplete="new-password" />
            </Field>
          </div>
        </SettingsForm>
      </Card>

      <Card title="Tilbakestill passord">
        <SettingsForm action={resetUserPasswordAction} label="Tilbakestill">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bruker" required>
              <Select name="id" required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nytt midlertidig passord" required hint={describePolicy(policy)}>
              <Input name="password" type="password" required minLength={policy.minLength} autoComplete="new-password" />
            </Field>
          </div>
        </SettingsForm>
      </Card>
    </div>
  );
}

async function BackupTab() {
  const [bookings, presets, users, settings] = await Promise.all([
    prisma.booking.count(),
    prisma.preset.count(),
    prisma.user.count(),
    prisma.setting.count(),
  ]);

  return (
    <div className="space-y-5">
      <Card title="Eksporter" subtitle="Én JSON-fil som kan importeres i et helt nytt system.">
        <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Bookinger</dt>
            <dd className="tnum text-lg font-semibold">{bookings}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Prisregler</dt>
            <dd className="tnum text-lg font-semibold">{presets}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Brukere</dt>
            <dd className="tnum text-lg font-semibold">{users}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Innstillinger</dt>
            <dd className="tnum text-lg font-semibold">{settings}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <LinkButton href="/api/backup/eksport" variant="primary">
            Last ned komplett kopi
          </LinkButton>
          <LinkButton href="/api/backup/eksport?logger=1">Inkluder logger</LinkButton>
          <LinkButton href="/api/backup/eksport?brukere=0&innstillinger=0">Kun bookinger og priser</LinkButton>
        </div>

        <div className="mt-4">
          <Alert kind="warning" title="Om krypterte nøkler">
          <p className="mt-0.5">
            Integrasjonsnøkler (Tibber-token, SMTP-passord, app-passord for kalender) er kryptert med{' '}
            <code className="text-xs">APP_SECRET</code>. Ta vare på den verdien sammen med sikkerhetskopien — uten den
            må integrasjonene settes opp på nytt. Alt annet, inkludert passordhasher, gjenopprettes som det er.
            </p>
          </Alert>
        </div>
      </Card>

      <Card title="Importer" subtitle="Gjenoppretter en tidligere sikkerhetskopi.">
        <SettingsForm action={importBackupAction} label="Importer" encType="multipart/form-data">
          <Field label="Sikkerhetskopi (.json)" required>
            <input
              type="file"
              name="file"
              accept="application/json,.json"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-black/[0.06] file:px-3 file:py-1 file:text-sm dark:file:bg-white/[0.1]"
            />
          </Field>
          <Field label="Modus">
            <Select name="mode" defaultValue="merge">
              <option value="merge">Slå sammen — behold eksisterende data, hopp over kollisjoner</option>
              <option value="replace">Erstatt — tøm databasen først (full gjenoppretting)</option>
            </Select>
          </Field>
          <Alert kind="error" title="«Erstatt» sletter alt som ligger der nå">
            Bruk den modusen kun på et rent system, eller når du bevisst ruller tilbake.
          </Alert>
        </SettingsForm>
      </Card>
    </div>
  );
}
