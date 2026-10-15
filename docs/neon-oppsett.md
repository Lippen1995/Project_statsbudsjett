# Neon: Fellestalls eksisterende prosjekt

Prosjektet er opprettet i brukerens direkte Neon-abonnement. Ingen ny Vercel
Marketplace-installasjon eller separat faktureringsavtale er nødvendig.

- Organisasjon: `org-icy-violet-87182384`
- Prosjekt: `bitter-firefly-21339346`
- Gren for oppsett: `production`
- Region valgt av brukeren: AWS Frankfurt
- Tjeneste: Postgres. Auth, Functions og øvrige tjenester opprettes ikke.

## Autentisering og klargjøring

Installer CLI-en og kjør oppsettet fra repositoryroten:

```sh
npm i -g neon@8.4.5
npm ci
npm run neon:init
npm run neon:deploy
```

CLI-en skriver lokal prosjektkobling i `.neon` og bruker `neon.ts`.
`neon deploy` henter `DATABASE_URL` og `DATABASE_URL_UNPOOLED` til en lokal
miljøfil. `.neon`, miljøfiler og `node_modules` er git-ignorert. `.env.example`
inneholder bare variabelnavn. Innlogging, hemmelige miljøverdier og API-nøkler
skal aldri legges i repositoryet eller sendes i chat.

På en lokal maskin med nettleser kan brukeren kjøre `neon login`. I et
skyarbeidsmiljø må `NEON_API_KEY` legges inn som en hemmelig miljøvariabel,
helst avgrenset til dette prosjektet. En lokal innlogging på brukerens PC
logger ikke automatisk inn det separate skyarbeidsmiljøet. Ikke bruk
Claimable-prosjekt som erstatning for manglende innlogging til dette prosjektet.

## Datatilgang og verifikasjon

### Kjøring via GitHub Actions fra denne chatten

Den globale MCP-innloggingen på brukerens PC gjelder lokale Codex-klienter.
Skyarbeidsmiljøet får ikke denne innloggingen automatisk. Det praktiske
alternativet her er workflowen «Neon – oppsett og databasekontroll»:

1. Lagre den prosjektavgrensede Neon API-nøkkelen som environment secret
   `NEON_API_KEY` i GitHub-miljøet `vercel-migration`, ved siden av
   `VERCEL_TOKEN`. Nøkkelen skal ikke sendes i chat eller legges i koden.
2. Start `neon-check.yml` manuelt fra `main`.
3. Jobben kobler til det eksplisitte prosjektet/grenen, kjører `neon deploy`,
   henter en midlertidig miljøfil, tester Postgres og bygger/starter appen.
   Hemmelige filer og CLI-råloggen slettes; de publiseres ikke som artefakter.

Jobben endrer ikke nettstedets dataflyt, publiserer ikke appen og flytter ikke
DNS. Den kan brukes fra flere chatter med repository-/Actions-tilgang uten
at selve API-nøkkelen deles med chattene.

### Lokal kjøring

Dataklienten i `scripts/neon/postgres.mjs` initialiseres først ved faktisk
bruk. Den bruker `@neondatabase/serverless` over HTTPS; dette fungerer også
når arbeidsmiljøet har HTTP-proxy og ikke har direkte TCP-tilgang til Postgres.
Node 24 brukes for verktøyene og proxy-/miljøfilflaggene.

```sh
npm run db:check
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

`db:check` tester SELECT over vanlig tilkobling, og JSON-skriving/lesing i en
transaksjon med midlertidig tabell over direkte tilkobling. Tabellen fjernes
ved commit. Ingen eksisterende tabeller endres. Både databasekontroll og bygg
må passere før oppsettet regnes som verifisert.

Frontendens JSON-adresser og publiseringsflyt er foreløpig uendret. Verken
databaseadresser eller API-nøkler skal legges i `VITE_*`-variabler. Dataklienten
er for serverens import-/eksportverktøy, ikke for direkte nettlesertilgang.
Neste migreringssteg er et versjonert dataskjema, test på separat databasegren,
parallell import/eksport og sammenligning mot dagens godkjente JSON-grunnlag.
Ikke flytt datapubliseringen til Neon før denne sammenligningen passerer.

## Status 15. oktober 2026

CLI 8.4.5, lokal kobling og `neon.ts` er klargjort. `neon init` rapporterte
`linked, not verified` og `Written offline (--no-checks): nothing was verified`.
Innloggingsforsøket krevde lokal OAuth-retur og tidsavbrøt. `neon deploy` kan
ikke fullføres før arbeidsmiljøet er autentisert. Ingen Neon-migrering eller
dataimport er utført.

Lokalt er `npm run build` og SEO-kontrollen bestått. Appen er startet med
`npm run preview -- --host 127.0.0.1 --port 4173` og kontrollert i Chromium ved
390 px bredde: 14 SVG-grafer og ingen JavaScript-sidefeil. `npm run db:check`
stopper korrekt med `Mangler DATABASE_URL` inntil deploy kan hente miljøfilen.
Dette er ikke en bestått databasekontroll eller en ferdig datamigrering.
