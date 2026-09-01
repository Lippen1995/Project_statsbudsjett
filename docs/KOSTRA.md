# KOSTRA-modulen

## Omfang

Modulen publiserer kommune- og fylkeskommuneregnskap som seksjonen
«Kommuner og fylker» rett under «Utforsk staten» på hovedsiden. Hash-rutene
under `#kostra` bytter kart- og detaljinnhold i seksjonen uten å forlate siden.

Brukeren kan gå fra Norge til fylke og kommune, velge år, totalbeløp eller
kroner per innbygger, og velge mellom finansielle nøkkeltall og store
tjenesteområder. Kartets oppsummering viser valgt område ved hover og ellers
summen av alle synlige fylker eller kommuner, inkludert anslått folketall.
På fylkeskartet holdes fylkeskommuneregnskapet og summen av kommuneregnskapene
adskilt; de legges aldri sammen. På nasjonalt kartnivå vises de i en
tokolonners regnskapsoversikt med driftsinntekter, driftskostnader, netto
driftsresultat, renteinntekter, rentekostnader, investeringsutgifter,
driftsresultat etter investeringer, netto lånegjeld og netto driftsutgifter.
Kommuneoversikten kan bytte direkte mellom nominelt beløp og kroner per
innbygger uten å forlate kartet. Hver post har en kort forklaring som
kan åpnes med mus eller tastatur. «Driftsresultat etter investeringer» er
tydelig merket som et utledet mål og beregnes som netto driftsresultat minus
brutto investeringsutgifter; det er ikke en egen offisiell KOSTRA-regnskapslinje.
Oversikten forklarer også at Oslo er den eneste enheten som både er kommune og
fylkeskommune, samtidig som de to regnskapene fortsatt holdes fra hverandre.

Søket dekker alltid både aktive kommuner og fylker, uavhengig av kartnivå.
Oslo vises med bokmålsnavnet «Oslo kommune». På nasjonalt nivå kan kartet
veksle mellom alle fylker og alle 357 kommuner uten å bytte side.
Under kartet rangerer «Utforsk kommuner og fylker» de samme enhetene og viser
historisk utvikling. Kolonneoverskriftene sorterer tabellen etter kroner per
innbygger eller andel. Et klikk på en kommune eller et fylke åpner regnskapet
inne i samme seksjon, uten navigasjon til en ny side:

- kommune/fylke → inntekter, utgifter, investeringer og gjeld
- utgifter → tjenesteområde → KOSTRA-funksjon → regnskapsart
- investeringer → tjenesteområde → KOSTRA-funksjon
- inntekter → inntektsart
- gjeld stopper på totalen fordi kildetabellen ikke har en videre fordeling

På nasjonalt fylkesnivå kan tabellen bytte mellom fylkeskommunenes egne
regnskaper og kommuneregnskap summert per fylke. Fra kommunesummen driller et
fylke først til kommunelisten. Valget gjelder finansielle nøkkeltall;
fylkeskommunale tjenesteområder har ikke en tilsvarende kommunesum.
Kommunesummer navngis etter geografien, for eksempel «Vestland fylke», mens
Oslo beholder «Oslo kommune».

Brødsmuler lar brukeren gå tilbake ett eller flere nivåer. Detaljvisningen som
også kan åpnes fra kartet viser:

- driftsinntekter, driftsutgifter, netto driftsresultat og gjeld
- inntekts- og utgiftsfordeling
- historikk per innbygger mot Norge og relevant KOSTRA-gruppe, med folketall
- total → tjenesteområde → KOSTRA-funksjon → regnskapsart, med en tidsserie
  som følger total, valgt tjenesteområde og valgt funksjon. Regnskapsart er
  avsluttende detaljnivå og er tilgjengelig per publisert år
- inntektsutjevning, med en tydelig konklusjon om kommunen mottar et tillegg
  eller får et trekk, skatt før og etter utjevning og nivået mot
  landsgjennomsnittet. Oppstillingen viser skatt + rammetilskudd før
  inntektsutjevning + signert utjevning = skatt og bokført rammetilskudd, og
  sammenligner rammetilskuddet per innbygger med Norge og KOSTRA-gruppen
- kommunevis budsjettberegning av rammetilskuddet fra Grønt hefte: grunnsum,
  utgiftsutjevning, særskilt fordeling, inntektsgaranti og regionale, vekst-,
  storby- og skjønnstilskudd. Budsjettgrunnlaget avstemmes synlig mot faktisk
  bokført KOSTRA-beløp

Inntektsutjevningen kan vises totalt eller per innbygger. Den signerte
sluttavregningen beholdes: negativt beløp er trekk/bidrag, mens positivt beløp
er tillegg/mottak. KOSTRA viser bokført rammetilskudd etter
inntektsutjevningen. Når utjevningen vises som egen linje, beregnes derfor
«rammetilskudd før inntektsutjevning» som bokført rammetilskudd minus signert
utjevning. Å legge utjevningen oppå det bokførte rammetilskuddet ville telt
samme beløp to ganger. Alle linjer i regnestykket bruker innbyggertallet i
KDDs sluttavregning, slik at ulike folketidspunkter ikke blandes i samme sum.

«Netto inntektsutjevning» finnes også som kommunevis nøkkeltall på kartet.
Valget bytter automatisk til kommunekart, bruker en divergerende fargeskala
(grønt trekk, rust tillegg) og viser alle publiserte kommuner i en sorterbar
tabell med skatt før utjevning, signert nettoutjevning og skatt etter
utjevning. Kartindeksen viser samlet tillegg og samlet trekk hver for seg;
beløpene nettosummeres ikke bort.

Inntektsutjevningen omfatter inntekts- og formuesskatt fra personlige
skattytere og naturressursskatt fra kraftforetak. Dette må ikke forveksles med
kommunens samlede inntekter. Frie inntekter er disse skatteinntektene sammen
med rammetilskudd, mens samlede inntekter i tillegg kan inneholde blant annet
gebyrer, øremerkede tilskudd og finansinntekter. Utbytte fra selskaper
kommunen eier er en finansinntekt og inngår ikke i beregningen av
inntektsutjevningen. Det samme gjelder blant annet eiendomsskatt. Denne
avgrensningen forklares synlig i grensesnittet slik at en utbytterik kommune
ikke feilaktig omtales som bidragsyter av den grunn.

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
4. Vanlige kartaggregater, inkludert kommunevis inntektsutjevning, eksporteres
   til `kostra/index.json`.
5. Store detaljer, inkludert flerårige artsserier, splittes per kommune/fylke
   og lazy-lastes først ved behov.
6. `web/src/lib/kostra.js` er frontendens eneste dataseam. Nettleseren gjør
   ingen kall til SSB eller Kartverket.

Kommunevis inntektsutjevning hentes fra Kommunal- og distriktsdepartementets
årlige sluttavregninger. ETL-en finner de offisielle XLSX-lenkene på siden for
løpende inntektsutjevning og normaliserer dem lokalt; regnearkene lastes aldri
av nettleseren.

Budsjettberegningen av rammetilskuddet hentes fra kommune-ODS-tabellene 1-k og
2-k i Grønt hefte. Importen finner årslenkene automatisk, normaliserer både
bokmåls- og nynorskoverskrifter og beholder tallene som budsjettgrunnlag. Det
bokførte KOSTRA-tallet er kontrolltotal; forskjellen mot budsjettgrunnlaget
forklares som endringer og avstemming gjennom året.

SQLite-filen er et byggartefakt og committes ikke. JSON-filene bygges av ETL i
CI på samme måte som de eksisterende statsdataene.

## Offisielle kilder

| Nivå | Formål | Kilde |
|------|--------|------------|
| Kommune | Finansielle nøkkeltall | 12137 |
| Kommune | Renteinntekter og rentekostnader | 13551 |
| Kommune | Tjenesteområder og funksjoner | 12362 |
| Kommune | Funksjon og regnskapsart | 12367 |
| Fylke | Finansielle nøkkeltall | 12366 |
| Fylke | Renteinntekter og rentekostnader | 13547 |
| Fylke | Tjenesteområder og funksjoner | 12163 |
| Fylke | Funksjon og regnskapsart | 12368 |
| Kommune | Rammetilskudd, faktisk regnskap | 12137, begrep A800 |
| Kommune | Skatt før/etter og netto inntektsutjevning | KDD, løpende inntektsutjevning |
| Kommune | Beregning av rammetilskudd | KDD, Grønt hefte tabell 1-k og 2-k |
| Kommunegeografi | Statlige skatter og avgifter | 07022 |

KOSTRA-grupper hentes fra SSB Klass, klassifikasjon 112 og nyeste publiserte
korrespondanse mot kommuneinndelingen. Kartflater hentes som landsdekkende
GeoJSON i ETRS89 (EPSG:4258) fra Kartverkets Atom-feeder for «Administrative
enheter kommuner» og «Administrative enheter fylker».

Importen bruker PxWebApi 2, har lokal rådatacache og deler uttrekk slik at de
holder seg under SSBs grense på 800 000 celler. SSB- og Kartverket-kildene er
CC BY 4.0. KDD-regnearkene navngis og lenkes eksplisitt; lisens er ikke
spesifisert i selve regnearkene.
Den gjenbruker retry/`Retry-After`-håndteringen i `etl/download.py`.
`_download_ssb_tabell` brukes ikke her fordi den bare henter én aggregert
årsserie, mens KOSTRA krever kontrollerte uttrekk over region, funksjon, art
og statistikkvariabel.

Tabell 12367 og 12368 publiserer både summer, hovedgrupper og underarter i
samme artsdimensjon. Artsdrillen for brutto driftsutgifter viser derfor de
gjensidig utelukkende hovedgruppene `AG16`, `AGD50`, `AGD51`, `AG34` og
`A590`; underarter og totalen `AGD10` vises ikke som ekstra kostnader.
Komponentene avstemmes mot SSBs `AGD10` for valgt funksjon og år. Eventuelle
publiserte avvik vises i grensesnittet med originalt fortegn og blir aldri
justert eller skjult. Manglende observasjoner lagres ikke som null kroner.

Tabell 07022 er et akkumulert skatteregnskap i millioner kroner. Importen
velger derfor bare desemberobservasjonen for hvert år og konverterer til
modellens enhet på 1 000 kroner; månedene summeres aldri. Følgende adskilte
poster inngår: medlemsavgift til folketrygden, arbeidsgiveravgift til
folketrygden, fellesskatt og ordinær formues- og inntektsskatt til staten.
Kommunal og fylkeskommunal skatt er ikke med i «til staten»-summen.

## Normalisert modell

- `entity`: kommune, fylke, Norge eller KOSTRA-gruppe, med forelder,
  gruppetilhørighet og gyldighetsperiode.
- `entity_code`: regionkoder og perioden koden er gyldig.
- `entity_relation`: SSB Klass-overganger, klassifisert som rent kodebytte
  eller reell grenseendring.
- `dataset`: skiller regnskap, framtidige budsjetter, overføringer og skatter.
- `classification`: funksjoner, tjenesteområder og regnskapsarter.
- `fact`: én observasjon per datasett, enhet, år, mål, funksjon, art og kildetabell;
  inneholder både beløp i 1 000 kroner og verdi per innbygger.
- `public_flow_category`: retning, aktør, tekst og sortering for en pengestrøm.
- `public_flow_fact`: beløp, per-innbyggerverdi, grunnlag og kildeperiode per
  kommune, år og pengestrømkategori.
- `income_equalization_fact`: skatt før og etter utjevning, signert
  nettoutjevning, folketall og nivå mot landsgjennomsnittet per kommune og år.
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

- `index.json`: skjema-versjon, år, mål, aktive/historiske enheter, kilder,
  forhåndsberegnede kartverdier og et kompakt `incomeEqualization`-oppslag med
  skatt før/etter og signert nettoutjevning for kart og nasjonal tabell.
- `boundaries.json`: forenklede og ferdigprojiserte SVG-baner for rask kartstart.
- `entities/municipality-{kode}.json`: kommuneoversikt, historikk,
  fordelinger, økonomisk drill-down og `stateFlows` med adskilte inn- og
  utgående statlige pengestrømmer.
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
Per-innbyggerverdier for skatteregnskapet bruker samme utledede KOSTRA-
folketall. Hvis folketallet mangler, publiseres totalbeløpet mens verdien per
innbygger forblir manglende.

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
