# Analysebibliotek og redaksjonell flyt

Avtalt produktplan og tone ligger i [analysis-plan.md](analysis-plan.md).

## Det som er implementert

- `/analyser/`: søk, kombinerbare filtre for tema, geografi og analysetype, nyeste først. Søket og filtrene kan deles som en URL.
- `/analyser/<slug>/`: ferdig HTML for søkemotorer og besøkende uten JavaScript, med faglig vurdering, tre grafer, årstabell, metode, kilder og begrensninger. Grafene viser vekst med forskjellige justeringer, KPI-justert utgift per innbygger gjennom perioden og årlige endringer. Egne metadata, kanonisk adresse, Article-data og sitemap.
- Et frosset datagrunnlag følger hver artikkel som `datagrunnlag.json`. Nye ETL-kjøringer omskriver ikke gamle analyser.
- En reell pilot ligger i `editorial/drafts/pilot.json`. Den er **ikke publisert eller menneskelig godkjent**. Biblioteket er tomt til første godkjenning.
- Ukentlig AI-produksjon, tilbakemelding i vanlig språk og ny godkjenning av hver versjon via GitHub.
- LinkedIn-integrasjon som krever godkjent tekst og kontrollerer den eksakte publiserte analysesiden før sending.

Forsiden får bare diskrete lenker til Analyser. Diagrammer, årvelger og eksisterende innhold beholder oppførselen.

## Lokal gjennomgang

Piloten kan også leses som en [PDF til gjennomgang](../editorial/review/pilot-til-gjennomgang.pdf), eksportert fra artikkelens forhåndsvisning. Den er et utkast og er ikke en registrert publiseringsgodkjenning. [Redaksjonelle forslag til de første analysene](../editorial/temaer.md) har kontrollert tallgrunnlag, men er ingen aktiv publiseringskø.

Fra repositoryets rot:

```sh
node scripts/analyser/pilot.mjs
cd web
ANALYSIS_PREVIEW_FILE=../editorial/drafts/pilot.json npm run dev
```

Åpne `/analyser/forhandsvisning/` på utviklingsserveren. Piloten inkluderer hele artikkelen og LinkedIn-utkastet. Denne adressen finnes bare når preview-filen uttrykkelig er valgt. Et vanlig produksjonsbygg inkluderer ingen utkast. En eventuell preview er `noindex`, men **ikke tilgangsbeskyttet**; ikke deploy preview-bygg offentlig dersom utkastene skal være private.

```sh
cd web
npm test
npm run build
```

Både metadata og artikkelinnhold finnes i HTML ved første svar; GitHub Pages trenger ingen SPA-omskriving for disse adressene. Analysebiblioteket bruker absolutte interne adresser under roten av fellestall.no, som er nettstedets etablerte produksjonsdomene.

## Mobil og varsling

Godkjenneren bruker GitHub-appen eller GitHub i mobilnettleseren. Når automatiseringen er aktivert, åpner AI en gjennomgang (pull request) med hele analysen, kontrollgrunnlaget, årstabell og LinkedIn-tekst i beskrivelsen. Den valgte godkjenneren mottar en review request. Pushvarsler krever at vedkommende har logget inn i appen og aktivert varsler for review requests. GitHub tilbyr også e-postvarsler. Vi kan be om gjennomgang, men kan ikke slå på telefonens varslingsinnstillinger.

Den manuelt klargjorte piloten og PR-en for implementeringen er ikke en automatisk redaksjonell gjennomgang. De utløser ikke i seg selv et varsel om godkjenning. Implementerings-PR-en opprettes med brukerens eksisterende GitHub-tilgang; en PR-forfatter kan ikke godkjenne sin egen PR. De ukentlige analyseutkastene opprettes senere av GitHub Actions-boten, slik at den ansvarlige kan gi en review på mobilen.

Implementeringen finnes i [utkast-PR #8](https://github.com/Lippen1995/Project_statsbudsjett/pull/8). Piloten kan åpnes på mobilen som [PDF](https://raw.githubusercontent.com/Lippen1995/Project_statsbudsjett/codex/analyser-og-godkjenning/editorial/review/pilot-til-gjennomgang.pdf) eller [tekstversjon](https://github.com/Lippen1995/Project_statsbudsjett/blob/codex/analyser-og-godkjenning/editorial/drafts/pilot.md). Lenken følger siste versjon på arbeidsgrenen. PDF-en er kontrollert mot den lokale gjennomgangsfilen. Disse lenkene gir tilgang til utkastet; en review request er ikke sendt, og varslings-/godkjenningsflyten er fortsatt ikke aktivert.

Innsyn følger repositoryets innstillinger. Gjennomgangen er ikke privat dersom repositoryet er offentlig. Trenger dere private redaksjonelle utkast, må flyten flyttes til et privat repository eller en autentisert gjennomgangstjeneste før den aktiveres.

1. Les utkastene i PR-beskrivelsen.
2. Skriv ønsket i en vanlig kommentar, eksempelvis «Gjør åpningen morsommere og forklar KPI-forbeholdet tydeligere». Man trenger ingen spesialkommando.
3. AI behandler ubehandlede endringsønsker fra brukere med skrivetilgang, oppdaterer det komplette utkastet og sender en ny review request. Tekst i en «Request changes»-review behandles også. Inline-kommentarer på enkelte JSON-linjer inngår ikke; bruk samtalen eller reviewens samlede tekst.
4. Godkjenn med GitHubs **Review changes → Approve**. Godkjenningen må peke på gjeldende commit. En eldre godkjenning eller et nytt ubehandlet endringsønske stopper publisering.
5. Den identiske godkjente versjonen testes og bygges. Et enkelt merge-commit oppdaterer det offentlige biblioteket på `main`; bare biblioteksfilen endres. Gjennomgangens head er andre forelder, slik at GitHub registrerer gjennomgangen som flettet. Utkastet følger ikke med inn i bibliotekets tre.
6. Eksisterende deploy-workflow publiserer nettstedet. LinkedIn-jobben kjører etter vellykket deploy og kontrollerer artikkelens offentlige datagrunnlag mot godkjenningshashen før sending.

Ikke flett utkast-PR manuelt: et utkast i `editorial/drafts` er aldri et publiseringssignal. Dersom regler på `main` blokkerer den automatiske publiseringscommitten, stopper jobben; den omgår ikke grenbeskyttelse. Gjennomgangen kan fremdeles revideres.

## Engangsoppsett før aktivering

Automatiseringen er deaktivert til `ANALYSIS_AUTOMATION_ENABLED=true`. Ingen eksterne analyser, meldinger eller LinkedIn-innlegg er produsert/publisert under implementeringen.

I GitHub Actions-innstillingene må opprettelse av pull requests med workflow-tokenet være tillatt. Workflowene trenger `contents: write`, `pull-requests: write` og, ved kommentarer, `issues: write`. Tokenet kommer fra GitHub Actions. Grenreglene må tillate den avtalte automatiske innholdspubliseringen; ikke slå av øvrig beskyttelse blindt.

Sett disse repository-variablene:

| Variabel | Formål |
| --- | --- |
| `ANALYSIS_REVIEWER` | GitHub-brukernavnet til den nåværende ansvarlige godkjenneren, som må ha skrivetilgang. Bare denne personen kan godkjenne publisering. |
| `ANALYSIS_AI_MODEL` | En modell tilgjengelig i deres OpenAI-prosjekt som støtter Responses API og strengt JSON-skjema |
| `ANALYSIS_AUTOMATION_ENABLED` | `true` etter at tilganger og gjennomgangsflyten er kontrollert |
| `LINKEDIN_ORGANIZATION_ID` | `146686168`, hentet fra administratorlenken brukeren delte for Fellestall.no. Dokumentert lokalt; den aktive repository-variabelen er ikke satt fra denne økten. |
| `LINKEDIN_VERSION` | En aktiv API-versjon, i formatet YYYYMM, kontrollert mot LinkedIns dokumentasjon ved aktivering |
| `LINKEDIN_ENABLED` | `true` etter at LinkedIn-tilgang er kontrollert; kan holdes av mens nettsideflyten prøves |

Legg inn `ANALYSIS_AI_API_KEY` sikkert i GitHub Actions Secrets. Legg aldri nøkkelen i chat eller kode. Analyseproduksjonen bruker OpenAI Responses API på `api.openai.com` og har API-kostnader. Kopi og kontrollert datagrunnlag sendes dit; telefonnumre, persondata og private credentials inngår ikke.

LinkedIn krever en reell organisasjonsside, en administrator, OAuth-tilgang med `w_organization_social` og nødvendig tilgang til Community Management API. Tilgang er ikke garantert bare ved å opprette en side eller en app. Ingen falsk personprofil opprettes.

- Har appen programmatisk OAuth-fornyelse: sett `LINKEDIN_REFRESH_TOKEN` og `LINKEDIN_CLIENT_SECRET` i Secrets, og `LINKEDIN_CLIENT_ID` som variabel. Integrasjonen fornyer tilgang før sending.
- Ellers kan `LINKEDIN_ACCESS_TOKEN` settes i Secrets. Det varer ikke nødvendigvis permanent; ny autorisering vil kreves ved utløp. Helt vedlikeholdsfri kontotilgang kan derfor ikke loves.

Bekreft tilganger med en manuell kjøring av «Analyser – ukentlig utkast» før tidsplanen tas i bruk. En ekstern ende-til-ende-kjøring er ennå ikke verifisert; API-tilganger og godkjenner er ikke tilgjengelige i utviklingsmiljøet. Lokale beregninger, versjonsvern, API-kontrakter med simulerte svar, nettleservisning og bygg er testet.

## Arbeid mens LinkedIn-søknaden behandles

Analysebiblioteket og nettsidepubliseringen er uavhengige av LinkedIn-tilgangen. Sett opp ansvarlig godkjenner, AI-produksjon, mobilvarsling og nettsideflyten først. `LINKEDIN_ENABLED` kan holdes deaktivert mens én analyse gjennomgår revisjon, ny godkjenning, bygg og nettsidepublisering. Senere aktivering av LinkedIn-distribusjonen krever fortsatt at teksten er godkjent og at den identiske analysesiden er tilgjengelig.

Nettverksendringen med `api.github.com` og `fellestall.no` er lagret. Etter endringen fungerer repository- og PR-operasjoner mot GitHubs API. Den autentiserte GitHub-kontoen er `Lippen1995`. Actions-variabler og Secrets svarer fortsatt `Resource not accessible by integration` (HTTP 403); de må settes i repositoryets innstillinger med nødvendig tilgang. Eksisterende credential-bindinger er beholdt, og det er ikke bedt om en ny personlig token.

## Overføre godkjenningsansvaret

Brukeren er første ansvarlige godkjenner. Den eksisterende autentiserte GitHub-tilgangen bruker `Lippen1995`. Rollen ligger i repository-variabelen `ANALYSIS_REVIEWER`, ikke hardkodet i artikkelsider, AI-tekster eller workflowfiler. Variabelen er ennå ikke lagret fra denne økten; integrasjonen har ikke tilgang til Actions-innstillingene.

Ved senere overføring:

1. Gi den nye personen skrivetilgang til repositoryet og la vedkommende aktivere GitHub-varsler på mobilen.
2. Vent til pågående godkjennings-/publiseringsjobber er ferdige. Variabler er bundet når en Actions-kjøring starter, så en allerede startet kjøring skifter ikke ansvarlig automatisk.
3. Bytt `ANALYSIS_REVIEWER` til den nye personens GitHub-brukernavn.
4. Kjør «Analyser – ukentlig utkast» manuelt. Finnes et åpent utkast, sender jobben en review request til den nye personen og lager ikke et nytt utkast. Fjern gjerne den gamle review requesten i GitHub.
5. Den nye personen godkjenner gjeldende versjon. Godkjenninger fra forrige ansvarlige godkjenner kan ikke publisere gjennom nye kjøringer.

Innspill fra andre personer med skrivetilgang kan fortsatt behandles som endringsønsker; publiseringsgodkjenning er forbeholdt den ansvarlige. Historikken beholder hvem som godkjente hver allerede publisert analyse.

LinkedIn-administrasjon er en egen rolle: en ny godkjenner trenger ikke overta LinkedIn-innloggingen eller AI-nøkkelen. Hvis også sideadministrasjonen skal overføres, legg den nye personen til som sideadministrator fra vedkommendes egen LinkedIn-profil. Del ikke innlogging. Se [LinkedIn-oppsettet](linkedin-page.md).

## Ukentlig innhold

Tidsplanen kjører mandager kl. 07.00 UTC: kl. 08.00 norsk vintertid og 09.00 sommertid. Den validerer data, velger en ennå ikke dekket problemstilling og åpner maksimalt én gjennomgang. Et eksisterende åpent utkast får bli ferdig før neste analyse produseres.

Første støttede analysetype er utgiftsutvikling per innbygger, justert med KPI: staten samlet og hvert departement, både historisk og over siste fem tilgjengelige år. Departementsanalyser oppgir uttrykkelig at ansvarsområder kan endres. Utvalg og avgrensning kommer fra kode, ikke AI. Kommune-, budsjettavviks- og årsaksanalyser trenger egne kontrollerte rapporttyper før AI kan produsere dem. Biblioteket støtter allerede disse temaene og filtrene når godkjente analyser legges til.

AI skal forklare et mønster i tidsserien og hva det kan antyde, fremfor å ramse opp tall. Nye rapporter har `factsVersion: 2` og kontrollerte faktum om året med størst absolutt årlig endring og utviklingen før og etter dette året. Fortegnet avgjør om det er vekst eller nedgang; tidspunktet er ingen årsaksforklaring. Eldre frosne rapporter uten versjonsfelt beholder sitt opprinnelige faktagrunnlag og kan fortsatt valideres. Alle tre grafer beregnes fra rapportens kontrollerte tidsserie.

Det skal ikke produseres like analyser av samme avgrensning og årstall uten endrede verdier. Hvis de kontrollerte problemstillingene er brukt opp eller grunnlaget er utilstrekkelig, hoppes uken over. Utvalg av relevante vinkler og flere faglige rapporttyper kan utvides uten å endre godkjenningsflyten.

## Feil og duplikater

- AI-feil eller ugyldig faktatekst endrer ikke eksisterende utkast.
- Ufullstendige år, manglende KPI/folketall og inkonsistente beregninger stopper publisering.
- Bare vanlige tekstfelter fra AI brukes. AI får aldri skrive kode, velge publiseringsrettigheter eller endre kildetall.
- Nye tilbakemeldinger behandles gjennom en kø per gjennomgang. Alle tidligere behandlede endringsønsker beholdes i historikken.
- Git-ref-oppdateringer bruker aldri force. Samtidige endringer stopper en utdatert publisering.
- LinkedIn-loggen reserverer sending før API-kallet. En manglende kvittering eller usikkert utfall blir stående som `pending`; integrasjonen sender ikke på nytt og risikerer dermed ikke duplikater. Kontroller LinkedIn og avstem `editorial/linkedin-receipts.json` før videre sending. Ikke slett en usikker kvittering uten å kontrollere om innlegget faktisk ble opprettet.
- Publiserte artikler er frosne. En faglig korrigering skal få egen gjennomgang og en tydelig rettelsesdato; dagens automatisering endrer ikke publiserte artikler på bakgrunn av nye ETL-data.
