# KOSTRA-modulen

## Omfang

Modulen publiserer kommune- og fylkeskommuneregnskap som en egen visning på
`#kostra`. Den eksisterende statsvisningen og dens datamodell er ikke endret.

Brukeren kan gå fra Norge til fylke og kommune, velge år, totalbeløp eller
kroner per innbygger, og velge mellom finansielle nøkkeltall og store
tjenesteområder. En detaljside viser:

- driftsinntekter, driftsutgifter, netto driftsresultat og gjeld
- inntekts- og utgiftsfordeling
- historikk mot Norge og relevant KOSTRA-gruppe
- total → tjenesteområde → KOSTRA-funksjon → regnskapsart

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

## Normalisert modell

- `entity`: kommune, fylke, Norge eller KOSTRA-gruppe, med forelder,
  gruppetilhørighet og gyldighetsperiode.
- `entity_code`: regionkoder og perioden koden er gyldig.
- `classification`: funksjoner, tjenesteområder og regnskapsarter.
- `fact`: én observasjon per enhet, år, mål, funksjon, art og kildetabell;
  inneholder både beløp i 1 000 kroner og verdi per innbygger.
- `source_run`: tabell, kildetittel, hentetid og siste publiserte periode.

Modellen er generell nok til at kommunebudsjetter og statlige overføringer kan
legges til som nye kildetabeller og fakta uten å endre kart- eller detaljflaten.

## Region-ID-er og historiske grenser

Kartet viser gjeldende grenser fra Kartverket. SSB-regionkoden er den eksterne
nøkkelen, mens den interne nøkkelen inkluderer enhetstype, for eksempel
`municipality:0301` og `county:03`.

Historiske koder lagres som egne, inaktive enheter med `valid_from` og
`valid_to` utledet fra SSBs regionetiketter. De kobles ikke automatisk til et
dagens fylke eller en ny kommune. For en aktiv kommune brukes tidsserien som
SSB selv publiserer på dagens regionkode; importen summerer aldri tidligere
kommuner på egen hånd. Dermed oppstår verken dobbelttelling eller konstruerte
tidsserier ved sammenslåinger og delinger.

## Publisert data-interface

`web/public/data/kostra/` inneholder:

- `index.json`: skjema-versjon, år, mål, aktive enheter, kilder og
  forhåndsberegnede kartverdier.
- `boundaries.json`: forenklede og ferdigprojiserte SVG-baner for rask kartstart.
- `entities/municipality-{kode}.json`: kommuneoversikt, historikk,
  fordelinger og økonomisk drill-down.
- `entities/county-{kode}.json`: tilsvarende for fylkeskommunen.

Manglende kildeverdier beholdes som manglende data, ikke som null. Ingen
placeholder- eller eksempelverdier publiseres.

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

