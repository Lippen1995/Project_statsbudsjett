# KOSTRA-modulen

## Omfang

Modulen publiserer kommune- og fylkeskommuneregnskap som seksjonen
«Kommuner og fylker» rett under «Utforsk staten» på hovedsiden. Hash-rutene
under `#kostra` bytter kart- og detaljinnhold i seksjonen uten å forlate siden.

Brukeren kan gå fra Norge til fylke og kommune, velge år, totalbeløp eller
kroner per innbygger, og velge mellom finansielle nøkkeltall og store
tjenesteområder. Kartets oppsummering viser valgt område ved hover og ellers
summen av alle synlige fylker eller kommuner, inkludert anslått folketall.
Under kartet rangerer «Utforsk kommuner og fylker» de samme enhetene og viser
historisk utvikling. Kolonneoverskriftene sorterer tabellen etter kroner per
innbygger eller andel. Et klikk på en kommune eller et fylke åpner regnskapet
inne i samme seksjon, uten navigasjon til en ny side:

- kommune/fylke → inntekter, utgifter, investeringer og gjeld
- utgifter → tjenesteområde → KOSTRA-funksjon → regnskapsart
- investeringer → tjenesteområde → KOSTRA-funksjon
- inntekter → inntektsart
- gjeld stopper på totalen fordi kildetabellen ikke har en videre fordeling

Brødsmuler lar brukeren gå tilbake ett eller flere nivåer. Detaljvisningen som
også kan åpnes fra kartet viser:

- driftsinntekter, driftsutgifter, netto driftsresultat og gjeld
- inntekts- og utgiftsfordeling
- historikk per innbygger mot Norge og relevant KOSTRA-gruppe, med folketall
- total → tjenesteområde → KOSTRA-funksjon → regnskapsart, med en tidsserie
  som følger total, valgt tjenesteområde og valgt funksjon. Regnskapsartene er
  siste års avsluttende detaljnivå

Sammenligning med Norge og KOSTRA-gruppe vises bare per innbygger. Totale
beløp påvirkes av regionenes størrelse og er derfor ikke et meningsfullt
sammenligningsgrunnlag. Rene kodebytter viderefører tidsserien uten eget varsel
i detaljvisningen; bare reelle grenseendringer vises som brudd i tidsserien.

## Arkitektur

Repoet er et statisk Vite-nettsted uten produksjonsdatabase eller server. Den
minste arkitekturen som beholder denne driftsmodellen er derfor:

1. `etl/kostra.py` henter data fra offisielle kilder og validerer dimensjonene.
2. `etl/kostra_schema.sql` oppretter en lokal SQLite-database i
   `etl/raw/kostra.sqlite`.
3. Importen normaliserer enheter, klassifikasjoner og fakta i SQLite.
4. Vanlige kartaggregater eksporteres til `kostra/index.json`.
5. Store detaljer splittes per kommune/fylke og lazy-lastes først ved behov.
6. `web/src/lib/kostra.js` er frontendens eneste dataseam. Nettleseren gjør
   ingen kall til SSB eller Kartverket.

SQLite-filen er et byggartefakt og committes ikke. JSON-filene bygges av ETL i
CI på samme måte som de eksisterende statsdataene.

## Offisielle kilder

| Nivå | Formål | SSB-tabell |
|------|--------|------------|
| Kommune | Finansielle nøkkeltall | 12137 |
| Kommune | Tjenesteområder og funksjoner | 12362 |
| Kommune | Funksjon og regnskapsart | 12367 |
| Fylke | Finansielle nøkkeltall | 12366 |
| Fylke | Tjenesteområder og funksjoner | 12163 |
| Fylke | Funksjon og regnskapsart | 12368 |

KOSTRA-grupper hentes fra SSB Klass, klassifikasjon 112 og nyeste publiserte
korrespondanse mot kommuneinndelingen. Kartflater hentes som landsdekkende
GeoJSON i ETRS89 (EPSG:4258) fra Kartverkets Atom-feeder for «Administrative
enheter kommuner» og «Administrative enheter fylker».

Importen bruker PxWebApi 2, har lokal rådatacache og deler uttrekk slik at de
holder seg under SSBs grense på 800 000 celler. Alle kilder er CC BY 4.0.
Den gjenbruker retry/`Retry-After`-håndteringen i `etl/download.py`.
`_download_ssb_tabell` brukes ikke her fordi den bare henter én aggregert
årsserie, mens KOSTRA krever kontrollerte uttrekk over region, funksjon, art
og statistikkvariabel.

## Normalisert modell

- `entity`: kommune, fylke, Norge eller KOSTRA-gruppe, med forelder,
  gruppetilhørighet og gyldighetsperiode.
- `entity_code`: regionkoder og perioden koden er gyldig.
- `entity_relation`: SSB Klass-overganger, klassifisert som rent kodebytte
  eller reell grenseendring.
- `dataset`: skiller regnskap, framtidige budsjetter og overføringer.
- `classification`: funksjoner, tjenesteområder og regnskapsarter.
- `fact`: én observasjon per datasett, enhet, år, mål, funksjon, art og kildetabell;
  inneholder både beløp i 1 000 kroner og verdi per innbygger.
- `source_run`: tabell, kildetittel, hentetid og siste publiserte periode.

Modellen er generell nok til at kommunebudsjetter og statlige overføringer kan
legges til som egne datasett uten å overskrive KOSTRA-regnskapet.

## Region-ID-er og historiske grenser

Kartet viser gjeldende grenser fra Kartverket. SSB-regionkoden er den eksterne
nøkkelen, mens den interne nøkkelen inkluderer enhetstype, for eksempel
`municipality:0301` og `county:03`.

Historiske koder og fakta lagres som egne, inaktive enheter med `valid_from` og
`valid_to`. Endringer hentes fra SSB Klass (kommuneinndeling 131 og
fylkesinndeling 104). En én-til-én-overgang videreføres i historikk og kartdata
som et rent kodebytte. Mange-til-én- og én-til-mange-overganger merkes som
grenseendringer og holdes adskilt. Detaljsiden forklarer skillet og lenker til
den historiske enheten. Importen summerer aldri tidligere kommuner på egen
hånd, så det oppstår verken dobbelttelling eller konstruerte tidsserier.

## Publisert data-interface

`web/public/data/kostra/` inneholder:

- `index.json`: skjema-versjon, år, mål, aktive/historiske enheter, kilder og
  forhåndsberegnede kartverdier.
- `boundaries.json`: forenklede og ferdigprojiserte SVG-baner for rask kartstart.
- `entities/municipality-{kode}.json`: kommuneoversikt, historikk,
  fordelinger og økonomisk drill-down.
- `entities/county-{kode}.json`: tilsvarende for fylkeskommunen.

Detaljfiler publiseres også for historiske enheter. `boundaryHistory` beskriver
overgangen, mens serier for aktive enheter inkluderer dokumenterte rene
kodebytter bakover i tid.

Manglende kildeverdier beholdes som manglende data, ikke som null. Ingen
placeholder- eller eksempelverdier publiseres.

Folketallet i kartoppsummeringen er merket `ca.` fordi det utledes av SSBs
publiserte KOSTRA-par `beløp (1000 kr)` og `beløp per innbygger (kr)`, som er
avrundet i kilden. Summerte per-innbyggerverdier befolkningsvektes.
En sum publiseres bare når valgt nøkkeltall finnes for alle områdene som vises.
Ved manglende observasjoner vises datadekningen eksplisitt, mens folketallet
fortsatt beregnes uavhengig av det valgte nøkkeltallet når grunnlaget finnes.

## Drift

```bash
make kostra       # bare KOSTRA
make etl          # hele datapipelinen, inkludert KOSTRA som valgfri kilde
make test         # alle Python-tester
cd web && npm test && npm run build
```

Første import er størst. Senere kjøringer bruker filcache med mindre `--force`
er valgt. Detaljfilene er bevisst større enn kartindeksen, men lastes bare når
en bruker åpner den aktuelle kommunen eller fylkeskommunen.
