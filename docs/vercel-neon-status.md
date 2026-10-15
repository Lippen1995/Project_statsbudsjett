# Migrering til Vercel og Neon: status

Oppdatert 15. oktober 2026 kl. 12:05 UTC. DNS-overgangen er gjennomført og
offentlig trafikk er bekreftet på Vercel. GitHub Pages beholdes som reserve
i stabiliseringsperioden.

## Gjennomført og verifisert

- Eksisterende Neon-abonnement brukes direkte, uten ny Vercel Marketplace-
  database. Prosjekt `bitter-firefly-21339346`, branch `production`, Frankfurt.
- PostgreSQL-tilkobling, midlertidig skriving/lesing, produksjonsbygg og lokal
  HTTP-kontroll passerte i [Neon-oppsettkontrollen](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/38717050471).
- Datagrunnlaget ble først prøvd i en isolert Neon-branch, deretter importert
  til produksjon. [Produksjonskontrollen](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/38720617926)
  verifiserte **1142 filer / 421387831 byte** med identiske SHA-256 før aktivering.
  JSON, kilde-HTML, PDF og XLSX bevares som komprimerte, uforanderlige snapshots.
  Normalisert SQL-analysemodell er et separat senere arbeid.
- Ordinær publisering verifiserer innhold via Neon før Vite bygger statiske
  sider. Et Neon-avbrudd påvirker derfor ikke et allerede publisert nettsted.
  GitHub Pages og Vercel får samme ferdigbygde nettsted.
- Vercel ligger i team `fjord-insight`, prosjekt `fellestall`
  (`prj_UCZp0PnkkoWMO6EJsLHW3y787ALp`). Tokenene er prosjektavgrensede
  miljøsecrets i GitHub-miljøet `vercel-migration`, begrenset til `main`.
- Vercel-kandidater kontrolleres mot publiserte filer før produksjonsaktivering.
  Alle HTML-sider, JS/CSS, sentrale datasett, analysegrunnlag og representative
  KOSTRA-filer sammenlignes; manglende JSON må gi 404.
- Gyldig sertifikat er forhåndsutstedt for hoveddomene og wildcard.
  [Direkte domene-/HTTPS-kontroll](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/38723922795)
  passerte mot begge Vercel-IP-er med produksjonsnavn som SNI/Host, korrekt
  filhash, ingen `noindex` og `www` → hoveddomene (308).
- Gamle JS/CSS-filer beholdes i nye bygg for allerede åpne faner.
- 177 frontendtester og 7 database-/publiseringstester passerer.
  Produksjonsbygg og SEO-kontroll passerer. Reservebygg fra repositoryet
  er kontrollert uten publisering eller varsling.

## DNS-overgangen er bekreftet

- Google og Cloudflare returnerer begge A-postene `216.150.1.1` og
  `216.150.16.1`, ingen AAAA på hoveddomenet og riktig Vercel-CNAME på `www`.
- Vercels domeneoppslag godkjenner begge domenene (`misconfigured: false`).
- Offentlige HTTPS-svar har Vercel-identifikator; `www` gir 308 til hoveddomenet.
  Forside, metadata og analyseoversikt er identiske med gjeldende `gh-pages`
  (`57aef9d`, bygget fra `866b033`). Ukjent JSON gir 404.
- Nettleseren laster forsiden, Oslo kommunes detaljvisning og analyseoversikten
  uten JavaScript-feil eller mislykkede forespørsler i kontrollen.

## Stabiliseringsperioden

Behold GitHub Pages minst 48–72 timer med stabil drift og gjennom én
verifisert dataoppdatering. Tidligste avvikling er derfor 17.–18. oktober,
forutsatt stabil drift og bestått dataoppdatering. Ikke fjern gammel hosting
eller sikkerhetskopier før dette. Se [tilbakeføringsplanen](vercel-dns.md).

Arkiv, SHA-256-manifest og offentlige DNS-oppslag fra den opprinnelige
produksjonen ligger i `/workspace/migration-fellestall/reference/`.
Dette er en arbeidskopi; kopier arkiv og manifest til varig lagring før gammel
hosting avvikles. Offentlige DNS-oppslag erstatter ikke en komplett sonekopi.

En tidligere nettleserkontroll rapporterte eksisterende tilgjengelighetsfunn:
én av 14 grafer mangler tekstalternativ, og en SSB-lenke har kontrast 3,42:1.
Disse er ikke endret av migreringen og må håndteres separat; migreringstestene
utgjør ikke en full tilgjengelighetsgodkjenning.

## Drift og tilbakeføring

Publisering og analyseflyt beholdes i `deploy.yml`; Vercel-speiling er aktivert
med `VERCEL_MIRROR_ENABLED=true`. Produksjonsaktivering bruker Vercels API med
kjent team/prosjekt, fordi CLI-kommandoen krevde et brukeroppslag som feilet
med den prosjektavgrensede tokenen. Domene-preflight venter på at aliaset får
riktig bygg før den godkjenner. Den kan også kjøres separat med
`vercel-domain-check.yml`, uten ny publisering.

[Neon-dataflyt og snapshots](neon-data.md) beskriver import, eksport,
aktivering og reservebygg. [DNS-veiledningen](vercel-dns.md) inneholder gamle
og nye poster og tidspunkt for avvikling av gammel vert.
