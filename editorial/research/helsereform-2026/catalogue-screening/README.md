# SSB-gjennomgang for revisjon av PR 86, 19. november 2026

Hele tabellkatalogen ble hentet med includeDiscontinued=true: 7 817 unike tabeller på åtte sider. `all-tables.tsv.gz` bevarer alle titler, ID-er, perioder og fagområder. `relevant-tables.tsv` er et bredt tematisk bruttoutvalg (1 161 titler), ikke en påstand om at alle tabellceller er gjennomgått. Relevans ble vurdert ut fra titler, fagområder, perioder og deretter metadata i utvalgte tabeller. Ingen historiske tabeller ble utelatt fra katalogen.

Originalkatalog, sider og metadata: GitHub Actions 44566757368 / artefakt 14552083055, utvidet metadatakontroll 44567653550 / 14552262777. Manifestet dokumenterer sideantall, total og SHA-256. De numeriske uttrekkene er permanent arkivert under web/public/data/ssb-research/ og hashkontrollert. Importer 44568656924, 44568682346 og 44568973639 passerte.

## Utvalg og begrunnelse

- 13953: årsverk i spesialisthelsetjenesten etter yrke og tjenesteområde. Sammenligner sykepleiere, leger, somatikk, voksenpsykiatri, barnepsykiatri og rusbehandling. Organisasjonsendringer kan flytte årsverk mellom kategorier.
- 14533: kommunal omsorg totalt og sykepleiere/spesialsykepleiere. Viser ulik bemanningsvekst; avtalte årsverk er ikke faktisk jobbet tid eller pasientbelastning.
- 14789: legemeldt fravær for sykepleiere, leger og helsefagarbeidere. Årsserier for begge kjønn. Yrkesforskjeller identifiserer ikke årsaken til sykdom og må ikke tolkes som arbeidsinnsats.
- 12441: egen- og legemeldt fravær i helse/sosial mot alle næringer, etter SSBs rettelse 5. november. Kan sammenlignes innbyrdes, men ikke direkte med yrkesfraværet som utelater egenmelding.
- 14022: RHF-administrasjon og fellesfunksjoner samt personalkostnad uten pensjon. RHF-kategorien utelater sykehusenes fordelte administrasjon; beløpet er ikke et sparepotensial og summeres ikke med statens overføringer.
- 07459: summert befolkning fra åtti år, fordelt på kjønn i uttrekkene. En demografisk indikator, ikke antall omsorgsmottakere.
- 12292: tildelte timer i hjemmet. Omtrent stabilt gjennomsnitt; utelatt fra hovedfortellingen fordi tildelt tid ikke måler levert tid eller pleietyngde.

## Vurdert, men ikke brukt som sammenhengende hovedserie

13942 har brudd i aktivitetstall i 2025; en enkel produktivitetsbrøk ville være misvisende. 14123 har utvalgte undersøkelsesår; ingen interpolasjon til årlige observasjoner. 14534 (heltid), 11996 (tjenestemottakere) og 12293 (institusjoner) ble vurdert i metadatautvalget, men ikke brukt til å hevde en nasjonal reformeffekt. Historiske forgjengertabeller brukes ikke til å forlenge serier uten kontrollert bruddkobling. De tre storbyeksemplene i baseline er ikke et nasjonalt gjennomsnitt.

## Reform og beregninger

NOU 2026:12 heter Én helsetjeneste. Riktig offisiell PDF-tekst er kontrollert, side 159 (495 RHF-årsverk) og kapittel 33 (konsekvenser). Den gamle tittelen og URL-en er rettet. Forsøk på binær nedlasting i CI 44626400308 fikk HTTP 403. Vi påstår derfor ikke at en ny PDF-hash er kontrollert. `policy.json` lagrer eksplisitt tekstverifikasjon; hele policyfilen inngår fortsatt i rapportens kildehash. Dette er ikke bevis på direkte GitHub-tilgang til regjeringen.no.

Scenariet er illustrativt: 495 årsverk × 10 % tidsbesparelse × 50 % realisering = 24,75 årsverk. Med 1,2 millioner kroner per årsverk blir maksimal brutto kontanteffekt 29,7 millioner hvis all frigjort tid tas ut som redusert bemanning. Ved 50 millioner årlig merkostnad er netto −20,3 millioner, før en antatt engangskostnad på 500 millioner. Kostnadene er valgbare antakelser, ikke anslag fra utvalget. Kapasitet og kontantsparing telles aldri samtidig for samme årsverk.

Én prosent av 27 786 avtalte sykepleierårsverk i kommunal omsorg = 277,86 årsverksekvivalenter. Dette er en størrelsesillustrasjon, ikke et målt tidstap, en prognose for lavere sykefravær eller dokumentert reformgevinst. Partikildene i policy.json skiller daterte reaksjoner fra vedtatte programmer.
