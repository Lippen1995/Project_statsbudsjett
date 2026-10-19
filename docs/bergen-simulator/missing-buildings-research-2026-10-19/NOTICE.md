# Rettigheter og adskillelse

Dette er analysegrunnlag og kandidater i karantene, ikke en ny bygningssnapshot.
Ingen fil i denne mappen er lastet av applikasjonen eller godkjent som faktisk
ny bygningsgeometri. Det opprinnelige bygningsgrunnlaget og ID-ene er uendret.

- Eksisterende Bergen-geometri: © OpenStreetMap-bidragsytere,
  [ODbL 1.0](https://www.openstreetmap.org/copyright).
- `overture.geojson.gz`: © OpenStreetMap-bidragsytere, Overture Maps Foundation,
  Microsoft. Bygningstema utgave `2026-09-23.1`,
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  Opprinnelige GERS-/OSM-ID-er og per-egenskap-kilder/lisenser beholdes.
- `microsoft.geojson.gz`: Microsoft Global ML Building Footprints, flis `120020133`,
  nedlastet 19.10.2026 fra den tilgjengelige eldre indeksen. Dagens
  [utgiver-README](https://github.com/microsoft/GlobalMLBuildingFootprints)
  oppgir [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/).
  Behold denne lisensen ved viderelevering av den separate Microsoft-kopien.
  Denne nedlastingen er ikke omtalt som nyeste Microsoft-flis.
  `-1`-verdier er manglende data, aldri negative byggehøyder.
- Kryssammenstillinger mot OSM/Overture (`matches.json.gz`, `candidates.geojson.gz`,
  `candidate-triage.json.gz`, `height-attribute-candidates.json.gz`) gjøres tilgjengelige
  som avledet database under ODbL 1.0, med disse attribusjonene og underliggende
  rettigheter. De er selvstendig tilgjengelige her; ikke en lukket database.
- Høyderaster og avledede høyde-/takanalyser: © Kartverket, Bergen kommune,
  Terratec–Field. Åpne prosjektdata, [CC BY 4.0](https://www.kartverket.no/api-og-data/vilkar-for-bruk).
  NN2000/EUREF89; originaler og låser ligger uendret i simulatorens tidligere
  kildegrunnlag. Ikke rå LiDAR-punkter. Rasterne er ikke lastet opp til en AI-tjeneste.
- `registry-probes.json`: © Kartverket, Matrikkelen — Bygningspunkt, CC BY 4.0,
  hentet 19.10.2026, fire små utsnitt, utvalgte bygningsfelt. `registry-results.json`
  sammenstiller disse mot OSM/Overture under ODbL. Punktene er ikke fotavtrykk.
- Analysefigurer er bearbeidinger av disse datakildene, med kreditering i figuren;
  kart/figurer kan deles som Produced Works under CC BY 4.0 med kildeattribusjon.
  Den tilhørende databasen beholder ODbL. Ingen kommersiell bakgrunnskarttjeneste,
  Google-bilder, nye fasadefoto eller eksterne modeller er inkludert.

Rapporten er en teknisk rettighetsvurdering av de konkret undersøkte leveransene,
ikke et generelt unntak fra kommersiell lisenskontroll. Særlig FKB, høyoppløselig
ortofoto, nye laserprosjekter og AI-modellvekter trenger egen rettighetskontroll.
