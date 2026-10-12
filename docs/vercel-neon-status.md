# Migrering: gjennomført og nødvendig engangsoppsett

Oppdatert 12. oktober 2026.

## Gjennomført

- Gjeldende `main` er `6590236b583d65acce7437d3e0eb14cd16b3c24d`.
- Publisert bygg er `gh-pages`-commit
  `2fb4561e13ab6f0138d79464b912440769fea199`, bygget fra
  `0d6f016a7e7f36486a005029debf4b0f779a4f00`.
- Arkiv, SHA-256-manifest og offentlige DNS-oppslag er lagret i
  `/workspace/migration-fellestall/reference/`. Arkivet har 1191 filer,
  til sammen 426 920 629 byte. Dette er en arbeidskopi; kopier arkiv og manifest
  til varig lagring før gammel hosting avvikles.
- DNS administreres hos Domeneshop. A/AAAA peker fortsatt på GitHub Pages
  med observert TTL 300. Offentlige oppslag er ikke en komplett DNS-sonekopi;
  hele sonen må også tas vare på hos Domeneshop før trafikkovergang.
- Eget Vercel-prosjekt `fellestall` er opprettet under `fjord-insight`:
  prosjekt `prj_UCZp0PnkkoWMO6EJsLHW3y787ALp`,
  team `team_zBf9uUPGwDQKfB9fElKD876W`.
- Samme ferdigbygde nettsted er utrullet på Vercel:
  `https://fellestall-celt6snju-fjord-insight.vercel.app`.
  Utrulling `dpl_6nNiVeGhnMJiBifwVsVzLoPgwaTU` har status READY.
  Vercel-adressen har innloggingsbeskyttelse og `X-Robots-Tag: noindex`.
- HTTP-kontroll via autentisert Vercel-verktøy bekrefter identisk forside,
  analyseoversikt og `data/meta.json` mot produksjonsarkivet. Ukjent JSON
  gir 404. Forside, metadata, analyser, robots og sitemap er også kontrollert
  identiske mellom GitHub Pages og arkivet.
- Domenene er registrert i Vercel-prosjektet, med `www` → hoveddomene (308).
  DNS og produksjonstrafikk er ikke flyttet.

## Parallell publiseringsjobb

`vercel-mirror.yml` henter ferdigbygde filer fra `gh-pages`, pakker Build Output
API v3 og utruller med `--prod --skip-domain`. Dermed beholdes eksisterende
byggeprosess, forhåndsvisninger og analyseflyt. Jobben sjekker alle HTML-sider,
JS/CSS, sentrale datasett, analysegrunnlag og representative KOSTRA-filer mot
den nye Vercel-utrullingen, samt at manglende JSON gir 404.

`deploy.yml` kaller jobben etter eksisterende Pages-publisering når
`VERCEL_MIRROR_ENABLED=true`. En separat manuell kjøring er også tilgjengelig.
Jobben aktiverer aldri domener. Dagens analyse-distribusjon beholdes som én jobb.

Ved parallelle utrullinger leses siste komplette `gh-pages`-commit; SHA skrives
i loggen. Det kan være et nyere komplett bygg enn workflowens utløsende commit.
Ved selve DNS-overgangen må publiseringskøen tømmes og samme SHA være bekreftet
på begge verter før trafikk skiftes.

## Engangsoppsett i GitHub og Vercel

Integrasjonen kan lese repositoryet og endre kode, men Actions-variabler gir
HTTP 403. Miljøet har heller ingen Vercel CLI-legitimasjon. Følgende må derfor
settes i leverandørenes grensesnitt, uten å dele hemmeligheter i chat:

1. Opprett GitHub-miljøet `vercel-migration`, begrens deployment branches til
   `main`, og aktiver required reviewers der repositoryets abonnement støtter det.
2. Opprett en Vercel-token avgrenset til Fjord Insight med nødvendig prosjekt-
   tilgang og utløpsdato. Lagre som miljøsecret `VERCEL_TOKEN` i
   `vercel-migration`; tokenen skal aldri legges i kode eller meldinger.
3. Etter at PR-en er gjennomgått og flettet: sett repositoryvariabelen
   `VERCEL_MIRROR_ENABLED` til `true` og kjør «Vercel – parallell publisering».
   Første kjøring må passere både utrulling og innholdskontroll.

Lenker:

- [GitHub-miljøer](https://github.com/Lippen1995/Project_statsbudsjett/settings/environments)
- [Actions-variabler](https://github.com/Lippen1995/Project_statsbudsjett/settings/variables/actions)
- [Vercel-tokens](https://vercel.com/account/tokens)
- [Fellestall-prosjektet](https://vercel.com/fjord-insight/fellestall)

## HTTPS før DNS-overgangen

Et vanlig utstedelsesforsøk ble avvist med
`http_pretest_domain_not_resolving_to_vercel_error` (449), fordi DNS fortsatt
peker på GitHub Pages. Dette løses med forhåndsutstedelse via DNS-validering:

1. Åpne teamets Domains i Vercel og konfigurasjonen for `fellestall.no`.
2. Velg «Pre-generate SSL Certificates» og inkluder både `fellestall.no` og
   `www.fellestall.no`.
3. Legg de oppgitte TXT-verdiene for `_acme-challenge` og
   `_acme-challenge.www` i Domeneshop. Behold webpostene som de er.
4. Verifiser i Vercel og kontroller ferdig sertifikat før web-DNS endres.

Den tilkoblede Vercel-verktøypakken eksponerer ikke start/finalize for denne
DNS-valideringen. Dashboardet kan brukes; CLI-alternativet for en autentisert
bruker er `vercel certs issue www.fellestall.no fellestall.no --challenge-only`.

[Vercels veiledning for overgang uten nedetid](https://vercel.com/kb/guide/zero-downtime-migration)

Neste kontroller er sertifikat, korrekt domenealias/ruting mot Vercel før
DNS-endring, alle viktige brukerflyter på den nye verten og strategi for gamle
JS/CSS-filer i allerede åpne faner. Eksisterende GitHub Pages beholdes gjennom
DNS-cacheperioden og stabiliseringsperioden.

## Neon

Det finnes ingen Neon-integrasjon i teamets installasjoner. Tilgjengelige
verktøy kan lese integrasjoner og priser, men kan ikke installere Neon.
Opprett en Neon-database fra Storage i Fellestall-prosjektet, velg europeisk
region og et egnet testabonnement. Ikke koble denne til frontend som offentlig
databaseadresse. Hemmeligheter oppbevares i leverandørens miljøinnstillinger.

Free-planen som ble slått opp oppgir 1 GB per prosjekt og 100 CU-timer.
Dette er et utgangspunkt for utprøving; kapasitet, indekser og restore-vindu
må vurderes før produksjonsbruk. Nettstedets filstørrelse er ikke et estimat
for databasebehovet.

Neon-skjema, import/eksport, parallell tallkontroll og gjenoppretting er fortsatt
gjenstående arbeid. Dagens statiske dataflyt fortsetter gjennom dette steget.
