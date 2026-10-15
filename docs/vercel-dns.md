# DNS-overgang fra GitHub Pages til Vercel

Datagrunnlaget er migrert til Neon og har bestått full import/eksport med
identiske filhash (1142 filer, 421387831 byte). Ordinære bygg leser den
verifiserte Neon-eksporten. GitHub Pages beholdes som parallell vert og reserve.

## Før trafikken flyttes

- Den ordinære publiseringen må ha grønn Vercel-aktivering og domene-preflight.
- Preflight går direkte til begge Vercel-IP-er med produksjonsnavn som SNI/Host.
  Den krever gyldig TLS, identisk forside/metadata, korrekt `www`-videresending
  og fravær av `noindex` på hoveddomenet.
- Eksporter eller ta kopi av hele DNS-sonen hos leverandøren. Offentlige
  oppslag alene er ikke en fullstendig sonekopi.
- Behold GitHub Pages-oppsettet, CNAME-filen og eksisterende sertifikat.
- Unngå nye innholds-/datautrullinger i det korte DNS-overgangsvinduet.

## Endringer hos Domeneshop

Verdiene er hentet fra Vercels prosjektspesifikke domeneoppslag 15. oktober 2026.
Ved en senere overgang må de kontrolleres på nytt.

| Type | Navn | Ny verdi | TTL |
| --- | --- | --- | --- |
| A | @ | 216.150.1.1 | 300 |
| A | @ | 216.150.16.1 | 300 |
| CNAME | www | 4181bd34fd5d90bd.vercel-dns-016.com. | 300 |

Disse erstatter de fire GitHub Pages-A-postene og `www`-CNAME-en.
Fjern de fire GitHub Pages-AAAA-postene på `@`, slik at IPv6 ikke fortsetter
å rute til gammel vert. Ikke legg inn en ny AAAA uten at Vercel oppgir en.

La NS, MX og TXT, inkludert Google-verifikasjon og ACME-poster, være urørt.
Ingen registrar- eller navneserveroverføring er nødvendig.

## Kontroll etter lagring

Kontroller A/AAAA/CNAME fra flere DNS-oppslag og åpne hoveddomene og `www`
over HTTPS. Kontroller også analyser, en kommuneside/kartvisning, JSON/CSV og
en ugyldig adresse. Sammenlign innholdet med den kontrollerte utrullingen.
Gamle DNS-svar kan fortsatt gå til GitHub Pages en stund; begge verter skal
betjene fungerende, like bygg. DNS-tilbakeføring er heller ikke øyeblikkelig.

Behold gammel vert i minst 48–72 timers stabil drift, gjennom gammel TTL og
en verifisert dataoppdatering. Arkiv og manifest i
`/workspace/migration-fellestall/reference/` må kopieres til varig lagring
før gammel hosting avvikles. Ikke slett gamle ressurser for åpne faner i
overgangsperioden.

## Tilbakeføring

Gjenopprett følgende tidligere webposter ved et Vercel-/domeneproblem:

| Type | Navn | Tidligere verdi | TTL |
| --- | --- | --- | --- |
| A | @ | 185.199.108.153 | 300 |
| A | @ | 185.199.109.153 | 300 |
| A | @ | 185.199.110.153 | 300 |
| A | @ | 185.199.111.153 | 300 |
| AAAA | @ | 2606:50c0:8000::153 | 300 |
| AAAA | @ | 2606:50c0:8001::153 | 300 |
| AAAA | @ | 2606:50c0:8002::153 | 300 |
| AAAA | @ | 2606:50c0:8003::153 | 300 |
| CNAME | www | lippen1995.github.io. | 300 |

Ved et rent databaseproblem fungerer allerede publiserte sider fortsatt.
Om en ny publisering må gjøres uten Neon, er reservebygget:

```sh
gh workflow run deploy.yml --ref main -f data_source=repository
```

Bygget kan prøves uten publisering med `-f verify_only=true`.
