# Hytteutleie

Et selvhostet verktøy for å administrere utleie av fritidsbolig: bookinger,
prisregler, kontrakter, strømavlesning, kalendersynk og regnskapsrapporter.

Bygget for å kjøre i et hjemmelab-oppsett med `docker compose`, men tåler også å
bli eksponert gjennom en Cloudflare-tunnel.

---

## Kom i gang

```bash
cp .env.example .env
```

Fyll ut `.env`. De tre påkrevde verdiene:

```bash
# Databasepassord
openssl rand -hex 24

# APP_SECRET — signerer sesjonsinformasjonskapsler og krypterer integrasjonsnøkler
openssl rand -base64 48

# ADMIN_PASSWORD — engangspassord for administratorkontoen (minst 12 tegn)
```

Tegn som `/`, `+`, `@` og `:` i databasepassordet håndteres — tilkoblingsstrengen
settes sammen ved oppstart med riktig prosentkoding, ikke ved tekstinnsetting i
`docker-compose.yml`.

Så:

```bash
docker compose up -d --build
```

Åpne <http://localhost:3000>, logg inn med `ADMIN_EMAIL` / `ADMIN_PASSWORD`, og
velg et nytt passord. Systemet krever det før noe annet kan gjøres.

### Tilgang fra det lokale nettverket

`BIND_ADDRESS` er `127.0.0.1` som standard. For å nå appen fra andre maskiner:

```bash
BIND_ADDRESS=0.0.0.0
APP_PORT=3000
```

### Enkle passord på et lukket nett

Som standard kreves minst 12 tegn med tall eller spesialtegn. På et lukket,
betrodd nettverk kan kravet slås av:

```bash
ALLOW_WEAK_PASSWORDS=true
```

Da holder det med 4 tegn, uten krav til tall eller spesialtegn. Det gjelder
`ADMIN_PASSWORD`, nye brukere, passordbytte og tilbakestilling — én regel, ett
sted (`src/lib/password.ts`).

`APP_SECRET` berøres ikke. Den er en krypteringsnøkkel, ikke et passord, og må
alltid være lang.

Når innstillingen er på vises en advarsel under Innstillinger → Sikkerhet, slik
at den ikke blir glemt. Skru den av igjen før systemet gjøres tilgjengelig
utenfra — merk at passord som allerede er satt fortsetter å virke, så de må
byttes samtidig.

### Operatørvelger på påloggingssiden

Operatører kan trykke på seg selv blant flisene øverst i skjemaet i stedet for
å skrive e-postadressen — da gjenstår bare passordet:

```bash
SHOW_OPERATOR_PICKER=true
```

Flisene viser bare aktive operatører. Administratorer er aldri blant dem, så
administratorpålogging krever fortsatt at man kjenner e-postadressen — e-postfeltet
står der som før, og et nytt trykk på en valgt flis henter det tilbake. Valget gir
ingen tilgang i seg selv: passordet kontrolleres, telles og utestenges nøyaktig
som før.

Det som svekkes er at navn og e-postadresser til operatørene blir synlige for
alle som når påloggingssiden. Det er greit på et lukket nett — skru det av igjen
før systemet gjøres tilgjengelig utenfra. Er innstillingen på, vises en advarsel
under Innstillinger → Sikkerhet.

### Bak en Cloudflare-tunnel

Sett `ALLOWED_ORIGINS` til det eksterne navnet, ellers avvises alle skjemaposter
som kommer utenfra:

```bash
ALLOWED_ORIGINS=https://hytte.example.com
TRUST_PROXY=true
```

---

## Hva systemet gjør

### Bookinger
Navn, adresse, inn- og utsjekk med klokkeslett, antall gjester og status
(foreløpig / bekreftet / fullført / kansellert). Bare navnet er påkrevd —
telefon og e-post kan fylles inn senere, slik at en forespørsel på telefon kan
føres inn med én gang. Uten e-postadresse kan kontrakten lastes ned, men ikke
sendes.

Depositum følges som to uavhengige tilstander — **innbetalt** og
**tilbakebetalt** — med mulighet for å holde tilbake et beløp ved skade eller
manglende vask.

Flyttes innsjekkdatoen, følger utsjekkdatoen med og beholder lengden på
oppholdet (minst to netter), slik at en datoendring bare krever ett grep.

Beregningspanelet sier fra både når perioden er opptatt og når den er ledig. Er
den ledig, men en annen booking slutter eller starter samme døgn, nevnes det
som en merknad om kort tid til klargjøring — en utsjekk kl. 12:00 og en ny
innsjekk kl. 16:00 samme dag er ikke en kollisjon.

Databasen hindrer dobbeltbooking med en `EXCLUDE`-begrensning på tidsrommet.
To opphold kan ikke overlappe, men utsjekk og neste innsjekk kan være samme
tidspunkt. Kansellerte bookinger frigjør perioden.

### Prisregler
En regel kan kreve en bestemt sesong, et antall netter, og en bestemt ukedag for
innsjekk, og kan ha sine egne klokkeslett for inn- og utsjekk. Prisen er enten
fast for oppholdet eller per natt.

Når en booking registreres velges regelen automatisk ut fra datoene. Panelet
«Beregning» viser hvilken regel som vant, hvorfor, og hvorfor de andre ikke
passet. Prisen kan alltid overstyres manuelt, med begrunnelse.

Standardregler som legges inn ved første oppstart: Helg, Uke, Sommeruke,
Påskeuke, Påske – halv uke, Jul og nyttår, og en Døgnpris som fanger opp resten.

### Sesonger og helligdager
Påsken beregnes lokalt med den gregorianske påskeformelen — ingen ekstern
tjeneste, samme svar hvert år. Påskevinduet defineres som et antall dager rundt
1. påskedag (standard: lørdagen før palmesøndag til 2. påskedag).

Jule- og sommerperioden defineres manuelt som dato-intervaller under
Innstillinger → Sesonger. Julevinduet kan gå over nyttår.

Et opphold regnes til en sesong når minst halvparten av nettene (justerbart)
faller innenfor perioden. Norske helligdager vises i kalenderen og i skjemaet.

### Kontrakter
Kontrakten er en mal med `{{variabler}}` og `{{#if ...}}`-blokker, redigerbar
under Innstillinger → Kontraktmal. Den genereres til PDF med norske tegn, topp-
og bunntekst, sidetall og signaturfelt.

Elektronisk signering ligger bak et grensesnitt i `src/lib/esign/index.ts`.
To implementasjoner følger med:

- **Manuell** — kontrakten lastes ned eller sendes på e-post, og markeres som
  signert når signert eksemplar er mottatt.
- **Webhook** — kontrakten POSTes som base64-PDF til en URL du bestemmer, og
  tjenesten melder tilbake til `/api/esign/webhook`.

En ekte leverandør (BankID via Signicat eller Verified, Dropbox Sign, …) legges
inn ved å implementere `ESignProvider` og registrere den i `PROVIDERS`. Ingen
andre deler av systemet må endres.

### Strøm (tibber-report)

Integrasjonen er forhåndsutfylt for det selvhostede
[tibber-report](../tibber-tool)-verktøyet. I praksis trenger du bare å sette
base-URL under **Innstillinger → Strøm**:

| Felt | Verdi |
|---|---|
| Base-URL | `http://toolbox.home:8888` |
| Metode | `POST` |
| Sti | `/api/report` |
| Sti til PDF-rapport | `/api/report.pdf` |
| JSON-body | `{"postal_code": "1747", "start": "{{fromLocal}}", "end": "{{toLocal}}", "timezone": "Europe/Oslo", "lang": "nb"}` |
| Sti til kWh | `summary.totalConsumption` |
| Sti til kostnad | `summary.spot.inclVat` |
| Enhet | Kroner |
| Autentisering | Ingen — tibber-report holder Tibber-tokenet selv |

`postal_code` er bare nødvendig når Tibber-kontoen har flere boliger. Med én
bolig kan linjen fjernes. Alternativt kan `"home_id": "…"` brukes, som er
stabilt også om adressen endres.

`{{fromLocal}}` og `{{toLocal}}` sendes som lokal tid med eksplisitt tidssone.
Timene som dekkes blir de samme som med `{{from}}`/`{{to}}` (absolutt UTC), men
tibber-report skriver perioden tilbake slik den ble mottatt — så PDF-en viser
15:00–14:00 akkurat som kontrakten, i stedet for de tilsvarende UTC-tidspunktene.
Sluttidspunktet er ekskluderende i begge verktøy, så timene stemmer overens uten
justering.

#### PDF-rapport

Knappen **Last ned strømrapport (PDF)** på bookingen henter tibber-report sin
egen PDF for nøyaktig oppholdsperioden, og sender den videre uendret — det er
samme dokument som verktøyet selv ville laget, bare navngitt etter bookingen
(`strom-HY-2026-0100-2026-09-05.pdf`).

Feltet **Sti til PDF-rapport** bruker samme metode, body og autentisering som
avlesningen. Tømmes feltet, forsvinner knappen. Peker den ved et uhell på
JSON-endepunktet, sier appen fra i stedet for å laste ned en ødelagt fil.
Simulerte verdier kan ikke lage PDF.

#### Fastpris

Gjesten skal ikke forholde seg til spotpris, nettleie og fastledd. Slå på
**Bruk fastpris per kWh** under Innstillinger → Strøm og oppgi én samlet pris —
den sendes med forespørselen som `fixed_price`, og tibber-report regner ut
beløpet på faktisk forbruk.

Når fastpris slås på, byttes **Sti til kostnad** samtidig til
`summary.fixed.inclVat`, siden det er der beløpet ligger i svaret. Byttet skjer
synlig i skjemaet, og en sti du har skrevet selv røres ikke. Står fastpris på
mens kostnaden fortsatt leses fra spotprisen, sier appen fra.

Legg nettleie og påslag inn i fastprisen — da er **Påslag på strøm (%)** under
Innstillinger → Booking overflødig og bør stå på 0.

Uten fastpris hentes **spotpris inkludert mva, energi alene**. Nettleie og
fastledd ligger ikke i det tallet.

Skru på **Bruk simulerte verdier** for å teste hele flyten uten å røre
tibber-report. Forbruket hentes for oppholdets tidsrom, og kan viderefaktureres
som egen post ved å slå på **Fakturer strøm separat**.

Adapteren er generisk, så et annet API kan brukes i stedet — plassholderne
`{{from}}` `{{to}}` `{{fromDate}}` `{{toDate}}` `{{fromEpoch}}` `{{toEpoch}}`
settes inn i sti og body, og `[]` i en sti summerer en liste, for eksempel
`data.nodes[].consumption`.

#### Nettverk

Kjører de to verktøyene i hver sin compose-fil, når appen tibber-report enten
via vertsnavnet på nettet (`http://toolbox.home:8888`) eller ved å legge begge
på et felles Docker-nettverk:

```bash
docker network create hytte-net
```

…og legge dette til i begge `docker-compose.yml`:

```yaml
networks:
  hytte-net:
    external: true
```

Da kan base-URL settes til containernavnet, for eksempel
`http://tibber-report:8000`.

### Kalender
Bookinger skrives til en iCloud-kalender over CalDAV. Bruk et app-spesifikt
passord fra appleid.apple.com — ikke hovedpassordet. Knappen «Finn kalendere»
henter riktig kalender-URL. Endringer og kansellering synkroniseres, enten
automatisk ved lagring eller manuelt.

Alternativt kan du laste ned eller abonnere på `/api/kalender/feed.ics`.

### Oppgjør av depositum

Strømregningen trekkes fra depositumet ved tilbakebetaling. Bookingsiden viser
regnestykket:

```
Depositum innbetalt          5 000 kr
Strøm (54,597 kWh)           − 68,25 kr
Andre trekk (manglende vask)    − 0 kr
─────────────────────────────────────
Til utbetaling             4 931,75 kr
```

Beløpene vises også som et stolpediagram, slik at forholdet mellom utbetaling og
trekk er synlig med én gang. Dekker ikke depositumet trekkene, snus regnestykket
til **Gjesten skylder**, med differansen som må kreves inn særskilt.

Strøm og **andre trekk** holdes adskilt med vilje: strømmen kommer fra
avlesningen, mens andre trekk er manuelle (skade, vask). Dermed telles ingen av
delene dobbelt i inntektsrapporten.

Skal strømmen faktureres for seg i stedet, slå av **Trekk strøm fra depositumet**
på den enkelte bookingen. Da holdes beløpet utenfor oppgjøret, men er fortsatt
med i rapportene.

Oppgjøret regnes ut fortløpende fra depositum, avlesning og trekk — det lagres
ikke, og kan derfor ikke komme i utakt med tallene det bygger på.

### Rapporter
Årsrapport med leieinntekt, strøm, tilbakeholdt depositum, antall netter,
beleggsprosent og utestående, fordelt per måned. Lastes ned som CSV med
semikolon og BOM, slik norsk Excel forventer.

Inntekt føres på året oppholdet avsluttes, og teller bare bekreftede og
fullførte bookinger.

### Varsler
Ti hendelser kan varsles på e-post, hver med egen av/på-bryter, egne mottakere
(gjest, operatør, ekstra adresser) og egen mal:

`booking.created` · `booking.updated` · `booking.cancelled` · `deposit.paid` ·
`deposit.returned` · `contract.sent` · `contract.signed` · `checkin.reminder` ·
`checkout.reminder` · `power.reading`

Påminnelser sendes av et planlagt kall. Legg dette i crontab:

```bash
0 8 * * * curl -fsS -H "Authorization: Bearer $APP_SECRET" \
            http://localhost:3000/api/cron/paminnelser
```

Samme kall synkroniserer ventende kalenderendringer.

### Sikkerhetskopi
`Innstillinger → Sikkerhetskopi` laster ned hele systemet som én JSON-fil —
bookinger, prisregler, brukere (med passordhasher), innstillinger og eventuelt
logger. Den kan importeres i et helt rent system, enten som sammenslåing eller
full erstatning.

> Integrasjonsnøkler er kryptert med `APP_SECRET`. Ta vare på den verdien sammen
> med sikkerhetskopien — uten den må Tibber-token, SMTP-passord og app-passordet
> for kalenderen legges inn på nytt. Alt annet gjenopprettes som det er.

---

## Roller

| | Operatør | Administrator |
|---|---|---|
| Bookinger, priser, kontrakter, rapporter, kalendersynk | ✅ | ✅ |
| Hytteinfo, sesonger, kontraktmal, varslingsmaler | ✅ | ✅ |
| E-post, kalender, strøm, signering (integrasjoner) | ❌ | ✅ |
| Brukere, sikkerhet, sikkerhetskopi | ❌ | ✅ |

Det finnes bare én operatørrolle, slik du ba om. Nye brukere opprettes under
Innstillinger → Brukere og må velge eget passord ved første pålogging.

---

## Sikkerhet

- Sesjoner er ugjettbare tilfeldige token; databasen lagrer bare SHA-256 av dem.
  Informasjonskapselen er `HttpOnly`, `SameSite=Lax`, `Secure` i produksjon, og
  bruker `__Host-`-prefikset.
- Passord hashes med scrypt. Ingen native moduler, ingen ekstern avhengighet.
  Kravene til styrke kan lempes med `ALLOW_WEAK_PASSWORDS` for lukkede nett.
- Utestengning etter gjentatte mislykkede forsøk, både per konto og per IP.
- Påloggingssiden røper ikke hvilke kontoer som finnes, med mindre
  `SHOW_OPERATOR_PICKER` er slått på for et lukket nett.
- Alle skjemaposter kontrolleres mot `ALLOWED_ORIGINS` i tillegg til SameSite.
- Content-Security-Policy uten eksterne kilder, `frame-ancestors 'none'`,
  HSTS når forespørselen kommer over TLS.
- Integrasjonsnøkler krypteres med AES-256-GCM før de lagres.
- Applikasjonscontaineren kjører som ikke-rot bruker, med skrivebeskyttet
  filsystem og `no-new-privileges`.
- Databasen publiseres ikke på verten — bare appen når den.
- Hendelseslogg over alt som endres, synlig under Innstillinger → Sikkerhet.

---

## Drift

```bash
docker compose logs -f app         # applikasjonslogg
docker compose logs migrate        # resultat av siste migrasjon
docker compose up -d --build       # oppgradering
curl localhost:3000/api/health     # helsesjekk
```

Databasedump utenom applikasjonens egen eksport:

```bash
docker compose exec db pg_dump -U hytte hytte | gzip > hytte-$(date +%F).sql.gz
```

Migrasjoner kjøres av en egen `migrate`-tjeneste som må fullføre før appen
starter, slik at skjemaet aldri ligger bak koden.

---

## Teknisk

Next.js 16 (App Router) · TypeScript · Prisma · PostgreSQL 16 · Tailwind CSS.

Beløp lagres som heltall i øre. Tidspunkter lagres som `timestamptz` og vises
alltid i Europe/Oslo.

```
src/lib/          domenelogikk — pricing, holidays, contract, pdf, ics,
                  caldav, tibber, notifications, backup, reports, esign
src/app/(dash)/   innlogget grensesnitt
src/app/api/      PDF, ICS, CSV, sikkerhetskopi, webhook, cron
prisma/           skjema og migrasjoner
```

```bash
npm run typecheck   # tsc --noEmit
npm run build       # produksjonsbygg
```
