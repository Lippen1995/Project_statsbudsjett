# Administrasjon i Fellestall

Adminområdet er en egen Vite-inngang på `/admin/`; `/admin` fører dit.
Det finnes ingen lenke i det offentlige nettstedets navigasjon eller sitemap.
HTML og HTTP-svar har `noindex`, og området er utelatt fra robots.txt.
Innlogging, økter og alle administrasjonsdata kontrolleres på serveren.
Skjult adresse og indekseringsregler er ikke tilgangskontrollen.

## Innhold

- **Ytelse:** faktiske LCP-, INP- og CLS-målinger fra `web-vitals`.
  Dashboardet viser vektede gjennomsnitt og måleantall, med tydelig tomtilstand.
  Tallene er ikke en CrUX-vurdering ved 75-persentilen.
- **Trafikk:** sidevisninger, daglig utvikling, sidestier, henvisende domener og
  mobil/datamaskin for 7, 30 eller 90 dager. Ingen besøks-ID eller beregnede
  «unike brukere». Ingen historiske tall er konstruert.
- **Sven:** eksisterende arbeidsinstruks, skrivehåndbok, preferanseregister,
  kildenotater, kvalitetsvurdering og beskrivelse av læringsprosessen.
  Dette er instruksjonsbasert læring, ikke modellfinjustering.
- **Analysepipeline:** ordnet liste med tema, konkrete instrukser og ønsket dato.
  Administrator kan legge til, redigere, slette og flytte også Svens forslag.
  Tom kø gir høyst ett neste automatisk mandagstema, ikke en samling reserveforslag.
- **Nye temaer fra Sven:** knappen henter ett datastøttet forslag til forhåndsvisning.
  Administrator velger dato og godtar forslaget, ber om et annet eller redigerer selv.
  Et nytt forslag kan erstatte et Sven-tema med samme ID, dato og plass i køen.
  Det gamle temaet bevares som erstattet i historikken. Eksplisitte bestillinger
  kan gi flere Sven-forslag; bakgrunnsplanleggingen fyller fortsatt bare inn ett
  neste tema når hele køen er tom.
- **Driftsstatus:** faktiske kontroller av nettstedet, databasen og Svens
  arbeidsgrunnlag, med endringslogg og historikk fra overvåkingen startet.
  Checkly kontrollerer helsesjekken i bakgrunnen hvert femte minutt og varsler
  administratoren på e-post ved feil, nedsatt ytelse og gjenoppretting.
- **Endringshistorikk:** faktiske GitHub-commits og Actions-kjøringer.

Jobbvarsler lukkes automatisk etter en bekreftet vellykket omkjøring med
samme kjørings-ID, eller en nyere vellykket kjøring av samme workflow.
Avbrutte, hoppede over og mislykkede kjøringer beviser ikke gjenoppretting.
Lagrede åpne varsler kontrolleres også når den tilhørende kjøringen har falt
utenfor siste side med jobbhistorikk. Hvis GitHub ikke kan bekrefte resultatet,
beholdes varselet åpent.

Eldre Sven-varsler kontrolleres mot både gjeldende arbeidsstatus og historikken.
Bare en fullført køkontroll med gyldige start- og sluttider og status `waiting`,
`review` eller `completed` bekrefter gjenoppretting. Kjørings-ID og sluttid
registreres i varslet; en senere kjøring etterregistreres ikke som utført på
den opprinnelig manglende dagen. Feil, pågående arbeid og fremtidige tider
lukker ikke varsler. Datoene tolkes i Europe/Oslo.

Et varsel om manglende planlagt Actions-kjøring lukkes bare når en faktisk
main-kjøring etter fristen er bekreftet, med lenke i varslet. At en ny frist
ennå ikke er overskredet, er ikke bevis på gjenoppretting. En feilet kjøring
kan løse fraværsvarselet, men jobbfeilen beholdes som et eget varsel.

## Serveroppsett

Adminområdet ble aktivert på **https://fellestall.no/admin/** 19. oktober 2026.
Den faktiske kontoen `info@fjordinsight.com` er opprettet, og innlogging,
serververn, GitHub-lagring, vedvarende økt, mobilmeny og utlogging er kontrollert
på produksjonsdomenet. Innloggingshemmelighet, kanonisk URL, databaseforbindelse
og dedikert GitHub-tilgang er konfigurert bare i Vercel Production.
Den eksisterende Neon-databasen brukes med separate `ft_admin_*`-tabeller;
snapshot- og analysetabeller endres ikke.

Pipeline lagres i `editorial/analysis-pipeline.json` og bruker samme dedikerte
GitHub-skrivetilgang som Svens arbeidsfiler. Datoer tolkes i Europe/Oslo.
Det øverste temaet som har nådd datoen, velges. Ingen filer i `web/public/`
inneholder pipelinekøen, og API-et krever innlogging og samme origin ved endring.
Pipelinefilen er likevel generelt redaksjonelt materiale i det offentlige
prosjektarkivet, slik grensesnittet opplyser om.

`prepare.mjs` leverer frie bestillinger til et eksplisitt forsknings-/plansteg
fremfor å velge et annet tema. `handoff.mjs` kontrollerer instruksens
fingeravtrykk, dato og prioritet før botskriving. Bare faktisk opprettet
gjennomgang konsumerer temaet. Feil og ventende gjennomganger lar køen stå.
Levering til gjennomgang er aldri publisering. En ny automatisk kandidat
opprettes bare hvis hele kommende kø er tom etter leveringen.

Den eksisterende native oppgaven er 19. oktober konfigurert til daglig
køkontroll kl. 09.00 Europe/Oslo fra 20. oktober. Verktøyet bekreftet at
konfigurasjonen er aktiv; ingen faktisk kjøring av den nye køflyten er
bekreftet. Før pipelinefilen og -koden finnes på main, gjør den bare vanlig
mandagsarbeid og avslutter på andre dager. Ingen ny parallell tidsplan,
server-cron eller separat AI-API er lagt til. En åpen gjennomgang har fortsatt
prioritet; bestillinger etter kl. 09 venter til neste kontroll. Se
`docs/codex-weekly-analysis.md` for oppgaveinstruksen.

Sett disse variablene i Vercels Production-miljø og i en ignorert `.env.local`
for lokal utvikling. Ingen skal ha `VITE_`-prefiks:

| Variabel | Verdi |
| --- | --- |
| `DATABASE_URL` | Eksisterende Neon production-forbindelse, med TLS. |
| `BETTER_AUTH_SECRET` | Tilfeldig hemmelighet på minst 32 tegn. Behold den ved nye utrullinger. |
| `BETTER_AUTH_URL` | `https://fellestall.no` i produksjon; `http://localhost:5173` lokalt. |
| `FELLESTALL_GITHUB_TOKEN` | Dedikert token for bare dette repositoryet: Contents read/write og Actions read. |

Bruk en særskilt, prosjektavgrenset GitHub-legitimasjon for runtime.
En midlertidig agent-/sesjonstoken skal ikke kopieres til Vercel.
Uten GitHub-token kan offentlige arbeidsfiler leses innenfor GitHubs
uautentiserte kvote. Lagring er eksplisitt deaktivert i grensesnittet.
Branch-regler som krever PR vil også avvise direkte lagring til main;
tokenen skal ikke ha omgåelsesrettigheter.

Det avtalte startpassordet ble tilført som en midlertidig Better Auth-hash ved
første produksjonsoppstart. Etter verifisert innlogging er verdien av
`FELLESTALL_ADMIN_PASSWORD_HASH` tømt i Vercel; oppstartsoppsettet er deaktivert
for nye utrullinger. Konto og passordhash ligger i databasen. Innloggings-
hemmeligheten `BETTER_AUTH_SECRET` beholdes ved vanlige utrullinger.

For et nytt arbeidsområde: kjør den idempotente migreringen og opprett `info@fjordinsight.com` med det
avtalte startpassordet. Passordet oppgis skjult, lagres som scrypt-hash, og
inngår aldri i frontend, kildekode eller kommandoargumenter:

```bash
npm ci
read -r -s -p 'Startpassord for administrator: ' admin_start_password
printf '\n'
printf '%s' "$admin_start_password" | npm run admin:setup
unset admin_start_password
```

Alternativt kan en allerede generert Better Auth-hash tilføres som
`FELLESTALL_ADMIN_PASSWORD_HASH` i migreringsmiljøet. Denne variabelen er
også støttet som en midlertidig Production Secret ved første utrulling:
første API-oppstart oppretter skjema og konto i én transaksjon, med en
database-lås som beskytter samtidige funksjonsinstanser. Gjenkjøring bevarer
eksisterende konto og passord. Tøm eller slett bootstrap-hashen fra Vercel etter verifisert
innlogging og utrull på nytt; den er ikke nødvendig i vanlig drift.
Offentlig kontoregistrering er deaktivert.

`npm run dev` starter frontend og Node-API i Vite. Vanlig statisk preview
betjener bare de bygde sidene og har ikke innloggings-API.

## Publisering

Den eksisterende `deploy.yml` bygger fortsatt nettstedet én gang.
`vercel-mirror.yml` installerer nå også rotavhengighetene og pakker det
samme statiske resultatet sammen med Node 24-funksjonen gjennom Build Output
API. Når admininngangen finnes i bygget, bruker den beskyttede main-jobben
eksisterende Neon- og Vercel-legitimasjon til å konfigurere `DATABASE_URL`
direkte som Vercel Production Secret hvis den mangler. En eksisterende verdi
bevares. Innloggingsvariabler og dedikert GitHub-token må finnes før utrulling;
mangler stopper jobben før produksjonen endres. Midlertidige miljøfiler og
Neon-logger slettes uten opplasting. Admin-API-et får en egen rute; manglende JSON og ukjente offentlige
adresser skal fortsatt gi 404. GitHub Pages er bare reserve for offentlige
statiske sider og kan ikke kjøre admin-API-et.

Kjør migrering, konfigurer variablene og publiser via eksisterende flyt.
Verifiser deretter innlogging på produksjonsdomenet med den faktiske kontoen,
avvisning av ubeskyttede API-kall, lesing/lagring av en konkret instruks,
loggen og utlogging. Verifiser at anonyme besøk etter hvert gir målinger.
En ny utrulling kreves etter endring av Vercels miljøvariabler.

## Sikkerhet og datalagring

Better Auth håndterer passord, signerte HttpOnly/SameSite-cookies, utlogging,
CSRF og databasebasert begrensning av innloggingsforsøk. HTTPS gir Secure-cookie.
Bare den konfigurerte administratorkontoen kan lese eller endre admin-data.
Økter varer i inntil åtte timer. Produksjonen bruker Vercels overskrevne
`x-vercel-forwarded-for`, slik at klientens egen `x-forwarded-for` ikke
bestemmer innloggingsbegrensningen.

Sven-redigering er begrenset til en fast filliste, tekststørrelse og validerte
preferanser. Lagring bruker GitHubs eksisterende fil-SHA og avviser konflikt.
Endringsbeskrivelse og GitHub-commit gir historikk. Føringer og referanser
er generelt materiale i et offentlig repository; grensesnittet opplyser om dette.
En lagret endring gjelder når Sven leser filene ved neste skrive-/revisjonsøkt.
Eksisterende godkjenningsvern for analysepublisering består.

Telemetri samler daglige summer og kortlivede minuttsummer, ikke IP-adresser, søketekst,
skattebeløp, full henvisningsadresse eller besøksidentifikatorer. En separat,
kortlivet HMAC-nøkkel begrenser misbruk. Den utløper etter to minutter og
slettes ved neste godtatte måling. Summer eldre enn 90 dager slettes samtidig.
Personvernsiden er oppdatert. `/admin` og `/api` inngår ikke i statistikken.

## Live-visning og driftskontroller

Ytelse starter med en løpende driftsstatus og faktiske mottatte nettlesermålinger
fra de siste 15 minuttbolkene. Målingene oppdateres hvert 15. sekund; status hentes
hvert 30. sekund. Skjulte faner stanser polling, forespørsler avbrytes etter 12
sekunder, og nettverksfeil gir gradvis lengre intervall og tydelig sist-kjente data.
Minuttsummer per enhetstype lagres høyst 24 timer, uten besøks-ID, IP eller
individuelle hendelser. Historiske dagssummer beholdes som før i 90 dager.

`/api/health` utfører faktiske kontroller av nettstedets offentlige HTML, databasen
og lesing av Svens arbeidsinstruks og pipeline. Det offentlige svaret inneholder
bare tjenestenavn, status, tidspunkt og kontrollsvartid. Administratorens historikk,
temaer, målinger og mottakeradresse krever innlogging. Kontrollene deler en
databaselease og en 45-sekunders mellomlagring på tvers av funksjonsinstanser.
Bare endrede tjenestetilstander eller gjenoppretting oppretter en logghendelse.
Hendelser og kontrollsummer beholdes i 90 dager. Dager uten faktiske kontroller
vises grå; prosenten i historikken er andel utførte enkeltkontroller uten avvik,
ikke en påstand om kontinuerlig tilgjengelighet mellom kontrollene.

De additive tabellendringene migreres atomisk med versjonsregister og databaselås.
Dette krever ikke den fjernede passordhashen og endrer ikke eksisterende kontoer,
økter eller datagrunnlag. Temaforslag bygges fra det samme verifiserte datasettet
som nettstedet publiserer; lagring kontrollerer fersk GitHub-historikk og køens SHA.
Nettleseren kan ikke sende inn en egen analyseplan som et Sven-forslag.

**Checkly-overvåking og e-postvarsling er konfigurert 20. oktober 2026.**
Integrasjonen er koblet til Fellestall i Vercel Production. Kontrollens navn er
`Fellestall – driftsstatus`; den gjør `GET https://fellestall.no/api/health`
og krever HTTP 200. Den kjører hvert femte minutt, med Round-robin mellom
Frankfurt og London. Dermed fortsetter kontrollene også når ingen har adminområdet
åpent, og de kan oppdage at hele nettstedet slutter å svare.

Kontrollens terskler er 5 000 ms for nedsatt ytelse og 20 000 ms for feil.
Ett nytt forsøk etter 60 sekunder fra samme lokasjon bekrefter feil før varsling.
Eskaleringen er én feilende kjøring, med null gjentatte påminnelser.
E-postkanalen har `info@fjordinsight.com` som mottaker og er abonnert på denne
kontrollen. Feil, nedsatt ytelse og gjenoppretting er valgt, sammen med varsel
30 dager før SSL-sertifikatet utløper. Nye kontroller abonneres ikke automatisk.
Brukeren bekreftet faktisk mottak av Checklys testmail og deretter lagring av
kanalen i denne samtalen. En full driftsstans er ikke fremprovosert i produksjon.

Varslene følger Checkly-kontrollens tilstand. Endringer i komponentloggen mens
Checkly-kontrollen allerede er feilende gir ikke nødvendigvis en ny e-post.
`FELLESTALL_STATUS_ALERTS_ENABLED=true` i Vercel Production gjenspeiler dette
bekreftede oppsettet i adminområdet; flagget oppretter ikke kontroller eller
sender e-post selv. De isolerte utviklingstestene sender fortsatt ingen e-post.

Hobby-planen inkluderer 10 000 API-kjøringer per måned. Én kontroll med dette
intervallet bruker 8 640 kjøringer på 30 dager eller 8 928 på 31 dager, før nye
forsøk og manuelle tester. Flere parallelle lokasjoner ville multiplisert
forbruket; Round-robin gjør ikke det. Hobby stanser kontrollene når kvoten er
brukt opp. Grensene ble kontrollert mot Vercels Checkly-plan og
[Checklys prisside](https://www.checklyhq.com/pricing/) 20. oktober 2026.

## Verifikasjon av implementasjonen

`npm test` inkluderer ekte Better Auth-innlogging mot PostgreSQL via PGlite,
feil passord, deaktivert registrering, serververn, CSRF, utlogging,
databaselagring av innloggingsbegrensningen, vektede målinger og perioder,
misbruksbegrensning, filliste og GitHub-filkonflikter.

Nettleserflyten er kontrollert mot et isolert lokalt API og lokal testkonto:
innlogging, feil passord, vedvarende økt, navigasjon, periodevalg, Sven-lagring,
mobil uten horisontal sideflyt og utlogging. Skriving mot GitHub var erstattet
med et isolert testlager. Ingen produksjonskonto, GitHub-instruks eller
produksjonsmåling er opprettet av disse isolerte kontrollene.

## Produksjonskontroll 19. oktober 2026

[Første produksjonsutrulling](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39294688494)
passerte bygg, Neon-oppsett, identiske statiske filer, admin-API-kontroll,
aktivering og HTTPS/domene-kontroll. På det faktiske domenet ble følgende bekreftet:

- Faktisk innlogging gir 200 og Secure/HttpOnly/SameSite-cookie; økten overlever
  oppdatering, og utlogging avviser den videre.
- Fem anonyme admin-endepunkter gir 401 og `no-store`. Fremmed origin avvises
  med 403, og en foreldet pipelineversjon med 409.
- Sven-instruks og pipeline er lagret via den dedikerte GitHub-tilgangen med
  uendret innhold og kø. Kontrollen la ikke til et testtema eller nye føringer.
- Den kommende køen har ett Sven-forslag til 26. oktober; ingen demotemaer
  er overført fra forhåndsvisningen.
- Desktop, mobilmeny og utlogging fungerer uten JavaScript- eller CSP-feil.
  Offentlig navigasjon og sitemap inneholder ingen adminlenke.

[Siste utrulling uten bootstrap-hash](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39295713923)
passerte de samme publiserings- og domenekontrollene. Hashverdien er tømt i
Vercel, og den midlertidige lokale hashfilen er slettet.

Det er ikke registrert en faktisk gjennomført daglig analyseplanlegging med
den nye køflyten; første planlagte kontroll er 20. oktober kl. 09.00 norsk tid.
Eksisterende krav om menneskelig godkjenning av analyser er uendret.

### Temaforslag, live-målinger og driftsstatus

[PR #69](https://github.com/Lippen1995/Project_statsbudsjett/pull/69) ble publisert
fra `33e11d3` gjennom [bestått produksjonskjøring](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39313328493).
Vercel-utrullingen er `dpl_BAULoWthAbYu7Ueem9iomU4rhS6o`.
Kontrollen på det faktiske domenet 19. oktober kl. 21.48 norsk tid bekreftet:

- Den eksisterende kontoen kan fortsatt logge inn etter den additive migreringen.
  Anonyme kall til live-data, statushistorikk og temaforslag avvises med 401;
  utlogging sperrer videre tilgang.
- Live-målinger vises over historiske tall og bruker de siste 15 minuttbolkene.
  Ingen målinger ble lagt inn for å fylle den nye visningen.
- Den offentlige helsesjekken og administratorens tre tjenestekontroller viste
  normal drift. Det offentlige svaret inneholder bare status, tidspunkt og
  tjenestekontroller. Historikken starter med faktiske observasjoner.
- Sven hentet et nytt, relevant tema fra produksjonens tallgrunnlag. Det ble
  bare forhåndsvist: køens innhold og SHA var identiske før og etter kontrollen.
  Redigeringsvalget tilbyr både et nytt Sven-forslag og manuell redigering.
- Desktop og mobil fungerte uten JavaScript-/CSP-feil og horisontal sideflyt.

25 rottester, 189 frontendtester, produksjonsbygg/SEO og isolerte nettlesertester
bestod før publisering. Den isolerte testen prøvde også lagring, erstatning,
manuell redigering, rekkefølge, datobevaring, konflikter og avvik/gjenoppretting.
Produksjonsloggen viste en advarsel fra PostgreSQL-driveren om fremtidig navngiving
av SSL-modus; ingen applikasjonsfeil ble observert under kontrollen.

Ved denne produksjonskontrollen **19. oktober** var Checkly-tilkobling,
bakgrunnsovervåking og e-post fortsatt ikke aktivert. Det ble eksplisitt vist i
adminområdet. Ingen av kontrollene den dagen sendte e-post eller endret
redaksjonelt innhold. Oppsettet 20. oktober er beskrevet ovenfor.

## Aktivert varsling 20. oktober 2026

[Produksjonsutrulling 39380602769](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39380602769)
publiserte den eksisterende implementasjonen fra `49f8849` med den nye
Production-konfigurasjonen. Utrullingen `dpl_DCSS1ygJHFhiJ5g31VPJS3XfQG3w`
passerte innholds-, tilgangs-, helse-, HTTPS- og domenekontroll før aktivering.
Det var ikke nødvendig å endre applikasjonskode eller opprette flere kontroller.

Kontrollen på `fellestall.no` kl. 08.32 norsk tid viste:

- Helsesjekken svarte HTTP 200 med normal drift for nettstedet, databasen og
  Svens arbeidsgrunnlag.
- Det innloggede status-API-et svarte med `notifications.enabled: true`,
  `externalMonitoring: true` og mottaker `info@fjordinsight.com`.
- Adminområdet viste «Aktivert» og riktig mottaker på desktop og mobil, uten
  JavaScript-/CSP-feil eller horisontal sideflyt.
- Anonym tilgang til statushistorikken ble avvist med 401; utlogging sperret
  videre tilgang til den innloggede oversikten.

Mottak av Checklys testmail og lagring av den abonnerte e-postkanalen er
bekreftet av brukeren. Produksjonskontrollen sendte ikke flere e-poster,
fremprovoserte ikke driftsfeil og endret ikke analysepipeline eller instrukser.
Gjennomgangen av runtime-loggen viste bare den tidligere kjente SSL-modus-
advarselen fra PostgreSQL-driveren; ingen applikasjonsfeil ble observert.
