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
- **Driftsstatus:** databaseforbindelse, API og konfigurert skrivetilgang.
  Datakvalitet, redaksjonell kø og varsling er merket som forslag til videre arbeid.
- **Endringshistorikk:** faktiske GitHub-commits og Actions-kjøringer.

## Serveroppsett

Dette er **ikke aktivert i produksjon av kildekodeendringen alene**.
Vercel-prosjektets miljøvariabler var tomme da oppsettet ble kontrollert.
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

I dette arbeidsområdet er det avtalte startpassordet allerede klargjort som
hash i den ignorerte filen `.env.admin.local`. Når databaseforbindelsen er
tilgjengelig i miljøet, oppretter `npm run admin:setup` kontoen fra denne hashen.
Filen skal ikke legges i Git eller publiseringspakken.

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
ikke nødvendig i det kjørende API-et. Gjenkjøring bevarer eksisterende
konto og passord. Offentlig kontoregistrering er deaktivert.

`npm run dev` starter frontend og Node-API i Vite. Vanlig statisk preview
betjener bare de bygde sidene og har ikke innloggings-API.

## Publisering

Den eksisterende `deploy.yml` bygger fortsatt nettstedet én gang.
`vercel-mirror.yml` installerer nå også rotavhengighetene og pakker det
samme statiske resultatet sammen med Node 24-funksjonen gjennom Build Output
API. Admin-API-et får en egen rute; manglende JSON og ukjente offentlige
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

Telemetri samler bare daglige summer, ikke IP-adresser, søketekst,
skattebeløp, full henvisningsadresse eller besøksidentifikatorer. En separat,
kortlivet HMAC-nøkkel begrenser misbruk. Den utløper etter to minutter og
slettes ved neste godtatte måling. Summer eldre enn 90 dager slettes samtidig.
Personvernsiden er oppdatert. `/admin` og `/api` inngår ikke i statistikken.

## Verifikasjon av implementasjonen

`npm test` inkluderer ekte Better Auth-innlogging mot PostgreSQL via PGlite,
feil passord, deaktivert registrering, serververn, CSRF, utlogging,
databaselagring av innloggingsbegrensningen, vektede målinger og perioder,
misbruksbegrensning, filliste og GitHub-filkonflikter.

Nettleserflyten er kontrollert mot et isolert lokalt API og lokal testkonto:
innlogging, feil passord, vedvarende økt, navigasjon, periodevalg, Sven-lagring,
mobil uten horisontal sideflyt og utlogging. Skriving mot GitHub var erstattet
med et isolert testlager. Ingen produksjonskonto, GitHub-instruks eller
produksjonsmåling er opprettet av denne kontrollen.
