# Ukraina-grunnlaget i den korte oljepengeanalysen

Kontrollert 7. oktober 2026. Dette retter den tidligere påstanden om at historiske sammenligningstall manglet. De finnes, men programramme, regnskap og budsjettbevilgning må holdes fra hverandre.

## Sammenlignbare programrammer

- Riksrevisjonens oppdaterte 2025-ramme er 84,9 mrd. kroner: 72,5 militært og 12,4 sivilt. Regjeringens temaside omtaler «85», men har også kombinasjonen 84,9 / 72,5 / 12,5. Vi bruker revisjonskildens avstemte tall og forklarer avrundingen.
- Regjeringens offisielle 2026-omtale gir 85 mrd. kroner: 70 militært og 15 sivilt. RNBs A–Å viderefører den sivile støtten på 15. Militærkapitlet beskriver omdisponeringer og tekniske endringer.
- Regjeringen foreslår å videreføre 85 mrd. kroner i 2027 gjennom Nansen-programmet. Fordeling på sivil og militær støtte er ikke oppgitt i den arkiverte 2027-kilden og vises som uavklart.
- Den nominelle programrammen øker dermed med null fra 2026 til 2027. Dette dokumenterer ikke et nullbidrag fra Ukraina til kontantutbetalinger eller strukturelt underskudd: betalingstidspunkter, materiellverdier og gjenanskaffelser kan være forskjellige.

## Poster på tvers av kapitler og departementer

Fellestalls eksplisitte poster er frosset fra data-commit `dd0aea50715160014256844e4b4429d99cf02dff`, med hele datafilens SHA-256 og oppdateringstid. Tabellen viser regnskap i 2025 og løpende revidert budsjett i 2026; den er et avgrenset utvalg, ikke alle Ukraina-kostnader.

| Type | 2025 regnskap, mill. kr | 2026 løpende revidert, mill. kr |
| --- | ---: | ---: |
| FD 1700/79 militær tilskuddspost | 41 227,3 | Ikke samme post |
| FD 1750/21 anskaffelser og drift | Ikke samme post | 48 462,2 |
| FD 1750/79 militære tilskudd | Ikke samme post | 18 776,6 |
| UD 159/73 Ukraina og naboland | 12 153,9 | 14 382,6 |
| UD Norfund risikokapital, 162/77 → 165/72 | 125,0 | 250,0 |
| UD Norfund kapitalinnskudd, 162/97 → 165/92 | 125,0 | 250,0 |

Den militære tilskuddsposten i 2025 utelater blant annet annen drifts- og materiellføring under Forsvaret. Generelle forsvarsposter telles ikke som Ukraina-utgifter uten dokumentert andel. Den sivile regionposten inkluderer naboland; Norfund er en separat del av postkartleggingen, ikke støtte som skal legges oppå programrammen. Kapitalinnskudd er finansposter og må ikke behandles som tilsvarende bidrag til strukturelt underskudd.

## RNB-avstemming og dobbelttelling

Parseren avstemmer tre aktuelle poster direkte mot de arkiverte RNB-forslagene:

- 1750/21: 28 610 + 19 387,7 + 458,3 + 6,2 = 48 462,2 mill. kroner.
- 1750/79: 38 596 + 483 + 14,3 − 19 387,7 − 929 = 18 776,6 mill. kroner.
- 159/73: 14 413,1 − 25 − 5,5 = 14 382,6 mill. kroner.

Overføringen mellom 1750/79 og /21 er en ompostering, ikke ny støtte. Midlene fra 1720/01 og 1700/78 er flytting inn i det samlede Ukraina-kapitlet. De 25 og 5,5 millionene på UD-siden gjelder ambassade-/administrative formål på andre poster; fallet i regionposten er derfor ikke automatisk et kutt i programrammen. Verdi av donert materiell trekkes fra i donasjonsåret og gjenanskaffelser finansieres når kontantutbetalingen skjer.

Avstemmingen viser samsvar med RNB-forslaget for disse postene, ikke et arkivert endelig parlamentarisk vedtak. DFØs løpende reviderte serie kan også inneholde andre endringsvedtak.

## Andre Ukraina-relaterte kostnader

Flyktningmottak, bosetting, integrering og tjenester i Norge er egne kostnadskategorier. Store generelle flyktning- og integreringsposter inneholder flere grupper og kan ikke tilordnes Ukraina fullt ut. Sivil støtte til Moldova innen Nansen er noe annet enn utgifter til flyktninger i Norge.

Lånegarantiordninger som følger av krigen kan ha drifts- og tapsavsetninger under næringsområdet. De er ikke automatisk støtte til Ukraina gjennom Nansen. «Nansen Fredssenter» under utdanning er et annet formål og utelates. Navnesøk alene brukes derfor ikke som en automatisk Ukraina-sum.

Original HTML, kilde-URL-er, kontrolltidspunkt og hash ligger i `web/public/data/oil-funds/ukraine/`. Rapporten og reviewtabellen oppgir det frosne postutvalget, kildefasene og begrensningene. To eksisterende makrografer beholdes; disse postene presenteres i tabell for å unngå en misvisende tidsserie av regnskap mot budsjett.
