# Neste datadimensjon: KOSTRA (kommune- og fylkesregnskap)

> **Til en ny Claude-chat:** Dette notatet beskriver hva vi skal bygge videre.
> Les også `docs/data-schema.md` (kildeskjemaer) og `README.md` (oppsett).
> Følg ALLTID metodikken under før du skriver parsere.

## Mål

Legg KOSTRA (kommunale og fylkeskommunale regnskaps- og nøkkeltall fra SSB)
til som en ny datadimensjon ved siden av statsregnskapet og Stortingets
budsjettbehandling. Visjonen er «én portal for hvor offentlige penger går» —
stat + kommune. KOSTRA multipliserer publikum kraftig (356 kommuner + 15
fylker; KS, lokalaviser, kommunekonsulenter) og gjenbruker mest mulig av
eksisterende ETL-, hierarki- og frontend-mønstre.

## Hvorfor KOSTRA først (valgt fremfor Doffin / statlige tilskudd)

Samme konseptuelle modell som vi allerede har: **enhet → tjenesteområde/
funksjon → art → beløp over år**. Passer nesten rett inn i drilldown-UI-et.
Lavest byggekost, størst nedslagsfelt.

## Datakilde

SSB har KOSTRA-tall via samme åpne API-familie som vi allerede bruker for
folketall/KPI/BNP (`data.ssb.no`). Aktuelle tabeller må **verifiseres først**
(SSB endrer/deprecerer tabeller — vi har sett både v0 400 og v2-beta 503 i
denne perioden). Kandidater å probe (ikke gjett — bekreft):
- Kommuneregnskap / finansielle nøkkeltall per kommune
- Funksjonskontoplan (tjenesteområder: skole, helse, omsorg, …)
- Artskontoplan (lønn, kjøp, overføringer, …)
Se SSB statistikkbank, emne «Offentlig sektor → KOSTRA».

## VIKTIGSTE REGEL (gjelder hele prosjektet)

**Ingen mock-/placeholder-tall. Aldri.** Hvis en kilde ikke kan hentes eller
parses, skal byggesteget feile høyt ELLER hoppe over med tydelig advarsel —
aldri fabrikkere verdier. Alle tall skal kunne spores til en nedlastet fil.

## Metodikk (følg i denne rekkefølgen — dette har gjort resten robust)

1. **Probe kilden FØRST via GitHub Actions** (ikke lokalt): øktens proxy
   blokkerer eksterne verter, så bruk `.github/workflows/debug-kilder.yml`
   (workflow_dispatch/push) til å dumpe faktiske SSB-tabellmetadata og
   testspørringer. Les loggen med `mcp__github__*`-verktøyene.
2. **Dokumentér det faktiske skjemaet** i `docs/data-schema.md` (ny §7) —
   tabell-ID-er, dimensjonskoder, verdikoder, enheter. Bekreft, ikke anta.
3. **Skriv ETL** (`etl/kostra.py` el.l.), gjenbruk `_request_med_retry` og
   `_download_ssb_tabell` (v0→v2-fallback) fra `etl/download.py`.
4. **Enhetstester** på parsing/aggregering (`etl/tests/`), inkl. en
   reconciliation/sanity-sjekk mot en kjent publisert totalsum.
5. **Wire inn i `etl/etl.py`** som et VALGFRITT steg (`_valgfri(...)`) —
   SSB-utfall skal ikke felle pipelinen. Skriv `kostra.json` (+ evt.
   `detaljer/`-splitt per kommune for ytelse, slik vi gjorde for departementer).
6. **Frontend** (`web/src/`): ny komponent + valgfri lasting i `lib/data.js`
   (skjul seksjonen hvis fila mangler). Gjenbruk drilldown-/formatmønstrene.
7. **Verifiser** med `npm run build` + playwright-screenshot (bruk
   `playwright-core` + `/opt/pw-browsers/chromium`, serve `dist/` via
   `vite preview` — husk at preview serverer `dist/`, ikke `public/`, så
   `npm run build` MÅ kjøres etter at du legger testdata i `public/data/`).
8. **Commit → push → merge til main.** ETL kjører i CI (main) og committer
   generert data + deployer til `gh-pages`.

## Arkitektur- og drift-fakta (kontekst for ny chat)

- **Nettverk:** Øktens proxy blokkerer `data.ssb.no`, `statsregnskapet.dfo.no`,
  regjeringen.no m.fl. All datahenting skjer i **GitHub Actions** (åpent nett).
- **Grener:** Utvikling på `claude/norway-budget-visualization-qlx1ou`,
  merges til `main`. ETL-workflow (`etl.yml`) kjører på main (månedlig +
  ved push til `etl/**`), committer `web/public/data/**` (force-add; mappa er
  gitignored lokalt), og kjeder deploy til `gh-pages`.
- **Pages:** `https://lippen1995.github.io/Project_statsbudsjett/` (kilde:
  gh-pages-branch). Aktiveres i repo-innstillinger (gjort av eier).
- **GitHub-token her har ikke admin/Actions-dispatch** — trigg workflows ved
  å pushe, ikke via API-dispatch.
- **SSB-status per 2026-07-08:** både v0 (400 «Parameter error») og v2-beta
  (503) svarte feil — sannsynlig utfall/migrasjon. KPI/BNP hoppes derfor over
  (valgfritt), henter seg inn automatisk når SSB svarer. KOSTRA vil møte det
  samme; bygg med samme valgfrie/​fallback-robusthet.
- **statsbudsjettet.no / regjeringen.no:** bak Cloudflare bot-challenge. Vi
  omgår IKKE bot-beskyttelse. Prop. 1 S-prosa hentes ev. manuelt/formelt.

## Kommersiell kontekst

Datagrunnlaget selges ikke (åpne data). Verdien er normalisering, kobling,
sammenligning, varsling, presentasjon og API. KOSTRA åpner kommune-markedet.
Se samtalehistorikk for full go-to-market (konsulent/revisjon + offentlig
sektor + white-label/API først).

## Kjente fallgruver å håndtere for KOSTRA

- Kommunesammenslåinger (2020-reformen): kommunenummer endres/​slås sammen —
  lag eksplisitt mapping for stabile ID-er over år, som `etl/mappings/`.
- Konsern vs. kommunekasse (to regnskapsnivåer) — vær konsekvent, dokumentér.
- Justere for innbyggertall (har vi allerede: befolkning per år) og evt. KOSTRA-
  gruppe (SSBs kommunegruppering for sammenligning).
