# Versjonert datagrunnlag i Neon

Første migrering bevarer dagens dataformat, beregninger, adresser og kildefiler.
Hele `data/` fra én publisert `gh-pages`-commit importeres, inkludert JSON,
PDF, Excel og frosne originalkilder. Et senere normalisert SQL-skjema for
analyseforespørsler er en separat endring; denne broen erstatter ikke
KOSTRA-modellens semantikk.

## Lagring og integritet

`scripts/neon/migrations/001-data-snapshots.sql` oppretter et eget skjema,
`fellestall_data`, uten å endre andre tabeller. Migreringens SHA-256 lagres;
endring av allerede kjørt migreringsfil avvises.

Hver dataversjon har et kanonisk manifest av filsti, rå filstørrelse og
SHA-256. Manifestets SHA-256 er versjonens ID. Originale bytes komprimeres
med gzip og deles i biter på maksimalt 256 KiB for HTTP-transport. Tall
tolkes ikke om og JSON serialiseres ikke på nytt.

Importen går fra `staging` til `complete` etter opptelling av filer og biter.
Eksporten må deretter dekomprimere hver fil, kontrollere størrelse og hash,
og rekonstruere nøyaktig samme manifest før versjonen merkes `verified`.
Eksport skjer til en ny mappe, og et avbrudd rydder den ufullstendige mappen.
Eksisterende eksport og publisert nettsted overskrives ikke av en feil.

Import av samme versjon er idempotent og en ufullstendig import kan
gjenopptas. Bare `verified` kan bli aktiv. Aktivering sammenligner forrige
aktive ID slik at en forsinket jobb ikke overskriver en nyere aktivering.
Eldre versjoner slettes ikke automatisk. Diskbruk og retention må følges
opp i Neon-abonnementet; hver ny versjon kan lagre nye komprimerte kopier.

## Kjøring

Workflowen «Neon – migrer og verifiser datagrunnlaget» bruker GitHub-miljøet
`vercel-migration` og eksisterende prosjektavgrenset `NEON_API_KEY`.

- `mode=verify`: opprett en isolert gren fra `production`, migrer skjemaet,
  importer hele publisert grunnlag og eksporter/kontroller det igjen.
- `mode=migrate`: gjennomfør den samme isolerte kontrollen først; importer
  deretter den verifiserte eksporten til `production`, eksporter og kontroller
  på nytt, og aktiver bare den godkjente ID-en.

Testgrenene utløper etter 24 timer. Rapportene inneholder bare versjons-ID,
filantall, rå byteantall og aktiveringsstatus, og oppbevares i Actions i 30 dager.
Miljøfiler og CLI-rålogger lastes ikke opp. Kjøringen bygger frontend med den
tilbakeeksporterte datamappen, men publiserer ikke nettstedet eller endrer DNS.

Lokalt, etter konfigurert databaseinnlogging:

```sh
npm test
npm run data:roundtrip -- --source web/public/data --output /tmp/fellestall-neon-export --source-commit <git-sha>
```

`--activate` er et eget, uttrykkelig valg. Uten flagget endres ikke aktiv versjon.
Bruk `scripts/neon/data-cli.mjs export --snapshot <id> --output <ny-mappe>`
med samme Node-/miljøfilflagg som `data:roundtrip` for å gjenopprette en eldre
versjon. Nettstedet kan også settes tilbake til et tidligere komplett bygg.
