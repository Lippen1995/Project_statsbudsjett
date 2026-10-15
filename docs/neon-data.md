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

## Publisering fra Neon

Den ordinære `deploy.yml` bruker `neon` som datakilde. ETL fortsetter å lage
filene og arkivere dem i repositoryet. Før hvert bygg importeres det komplette
grunnlaget til Neon og eksporteres til en ny mappe med full hashkontroll.
Først denne eksporten brukes av frontendbygget. Det er dermed Neon som leverer
byggets datagrunnlag, mens repositoryet fortsatt er en kontrollert reserve.

Versjonens ID registreres i Actions-oppsummeringen. Databasens aktive ID betyr
siste godkjente dataversjon; om selve hosting-publiseringen etterpå feiler,
kan nettstedet fremdeles vise forrige bygg. Bruk derfor både Actions-status
og versjonsrapport ved tilbakeføring. En Vercel-rollback endrer ikke databasen.

API-nøkkelen brukes bare til å hente en privat miljøfil i GitHub-miljøet
`vercel-migration`. Databaseverdier legges aldri i frontendens `VITE_*`-miljø.
Feil i Neon, eksport, hashkontroll eller bygg stopper ny publisering; allerede
publiserte statiske sider fortsetter å fungere.

Tilbakeføring uten databaseavhengighet:

```sh
gh workflow run deploy.yml --ref main -f data_source=repository
```

Legg til `-f verify_only=true` for å prøve reservebygget uten å publisere,
aktivere data eller sende publiseringsvarsler. Den samme tørrkjøringen støttes
med `data_source=neon`.

Dette bygger fra reservegrunnlaget i `main` og bruker fortsatt eksisterende
analyseforhåndsvisning og Vercel-speiling. Det er en egen manuell nødvei;
vanlige publiseringer feiler tydelig dersom Neon ikke kan verifiseres.
Den felles concurrency-gruppen serialiserer databaseoperasjoner med manuell
migrering. Ved en pågående feilende migrering må den avsluttes før nødbygget
kan overta gruppen.

## Vercel og overgang av domene

Tidligere hash-navngitte filer under `assets/` beholdes i nye bygg. Dermed kan
åpne faner og bufret HTML hente eldre JS/CSS også etter en utrulling eller
DNS-overgang. Gamle ressurser kan ryddes etter en avtalt kompatibilitetsperiode.

Den ordinære Vercel-jobben utruller uten domenetilknytning, sammenligner
innholdet og promoterer deretter det kontrollerte bygget. Først da kontrolleres
`fellestall.no` og `www.fellestall.no` direkte mot Vercel-IP-ene med korrekt
Host/SNI og vanlig sertifikatvalidering. Forside og metadata må matche bygget,
`www` må svare med 308 til hoveddomenet, og hoveddomenet skal være indekserbart.
Dette kan kontrolleres uten å endre DNS hos Domeneshop.

Ved en separat manuell kjøring av `vercel-mirror.yml` er promotering avslått
som standard; velg `promote=true` for også å aktivere en kontrollert utrulling.
Vanlige kall fra publiseringsworkflowen promoterer automatisk etter kontroll.

Vercels domeneoppslag 15. oktober 2026 anbefalte A-adressene `216.150.1.1` og
`216.150.16.1`, og CNAME `4181bd34fd5d90bd.vercel-dns-016.com.`. Slå opp disse
på nytt ved en senere overgang. DNS-endringen gjøres først etter bestått
domene-/HTTPS-kontroll; GitHub Pages beholdes gjennom cache- og stabiliseringstiden.

## Verifisert migrering 15. oktober 2026

Den isolerte kontrollen bestod i [Actions 38720388398](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/38720388398).
Produksjonsimport og aktivering bestod i [Actions 38720617926](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/38720617926).
Begge rekonstruerte identisk versjon
`569da60cc361c2d32202f097fd311122c4eea6989fca1023369f489c86eb17b2`:
1142 filer og 421387831 rå byte, med beståtte frontendtester, bygg og SEO.
