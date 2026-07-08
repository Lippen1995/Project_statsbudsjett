# Statens regnskap – interaktiv visualisering

Webapplikasjon som visualiserer det norske statsbudsjettet og -regnskapet med ekte data fra DFØ Statsregnskapet og SSB.

**Livedemonstrasjon krever at ETL har vært kjørt** – se oppsett nedenfor.

## Funksjonalitet

- Brutto inntekter og utgifter per år (2014→siste regnskapsår)
- Klikkbart hierarki: departement → kapittel → post
- Historikkgraf med regnskap, saldert budsjett og prognose-forlengelse
- Artskonto-pivot (lønn, kjøp, overføringer, investeringer …)
- Per-innbygger-skalering (SSB folkemengde)
- Filter for finanstransaksjoner og SPU-overføringer
- Stortingets budsjettbehandling (voteringer per parti)
- **KOSTRA**: kommune-/fylkesregnskap fordelt på funksjon (tjenesteområde), per enhet og år (valgfritt – vises når SSB-data er hentet)

## Forutsetninger

- Python 3.11+
- Node.js 18+
- Nettverkstilgang til `statsregnskapet.dfo.no` og `data.ssb.no`

## Oppsett

```bash
# 1. Klon og installer avhengigheter
git clone <repo>
cd Project_statsbudsjett
make install

# 2. Last ned og prosesser data (én gang, ~5–15 min første gang)
make etl

# 3. Start utviklingsserver
make dev
# Åpne http://localhost:5173
```

## Kommandoer

| Kommando | Beskrivelse |
|----------|-------------|
| `make install` | Installer Python- og Node-avhengigheter |
| `make etl` | Last ned og prosesser data (cacher råfiler) |
| `make etl-force` | Re-last ned alle filer |
| `make etl-inspect` | Last ned og skriv ut topplinjer av kildefilene |
| `make test` | Kjør Python-enhetstester |
| `make dev` | Start Vite-utviklingsserver |
| `make build` | Bygg produksjonsversjon til `web/dist/` |
| `make clean` | Slett cache og bygde filer |

## Prosjektstruktur

```
Project_statsbudsjett/
├── etl/                     ETL-pipeline (Python)
│   ├── etl.py               Hoved-orkestrator
│   ├── download.py          Nedlasting og caching av kildefiler
│   ├── parse_regnskap.py    Parser for regnskapsdata-CSV
│   ├── parse_bevilgning.py  Parser for bevilgningshistorikk-CSV
│   ├── parse_befolkning.py  Parser for SSB JSON-stat2
│   ├── stortinget.py        Stortingets budsjettbehandling (data.stortinget.no)
│   ├── kostra.py            KOSTRA kommune/fylke (SSB, metadata-drevet, valgfritt)
│   ├── build_hierarchy.py   Bygger JSON-hierarkier
│   ├── requirements.txt
│   ├── raw/                 Nedlastede råfiler (gitignored)
│   ├── mappings/            Departementsaliaser + kommune_mapping.json (2020-reformen)
│   └── tests/               Enhetstester
├── web/                     Frontend (Vite + React + Recharts)
│   ├── src/
│   │   ├── App.jsx          Rot-komponent
│   │   ├── components/      UI-komponenter
│   │   └── lib/             Data-hjelper og formatering
│   └── public/data/         Normalisert JSON (gitignored)
└── docs/
    └── data-schema.md       Faktisk filskjema, dokumentert
```

## Videre arbeid

**KOSTRA (kommune-/fylkesregnskap)** er lagt til som valgfri datadimensjon
(`etl/kostra.py` + `web/src/components/Kostra.jsx`). ETL-en er metadata-drevet
og henter KOSTRA automatisk når SSBs API svarer; se
[`docs/ROADMAP-KOSTRA.md`](docs/ROADMAP-KOSTRA.md) og
[`docs/data-schema.md`](docs/data-schema.md) §7. Gjenstår: bekrefte tabell-ID/
dimensjonskoder mot live SSB-metadata (SSB var nede ved bygging), komplettere
kommune-mappingen, og evt. legge til art-nivå + per-innbygger-sammenligning.

## Datakilder

| Kilde | Lisens |
|-------|--------|
| [DFØ Statsregnskapet](https://statsregnskapet.dfo.no) | NLOD |
| [SSB Folkemengde, KPI, nasjonalregnskap](https://www.ssb.no) | CC BY 4.0 |
| [SSB KOSTRA](https://www.ssb.no/offentlig-sektor/kostra) | CC BY 4.0 |
| [Stortinget (data.stortinget.no)](https://data.stortinget.no) | NLOD |

## Datafallgruver

Se [`docs/data-schema.md`](docs/data-schema.md) for detaljert dokumentasjon av:
- Brutto vs. netto (nettobudsjetterte virksomheter)
- 90-poster (finanstransaksjoner)
- SPU-overføringer (kap. 2800/5800)
- Departementsomstruktureringer og kapittelmappinger
- Belopstegn-konvensjon (D=utgift, K=inntekt)

## Teknologi

- **ETL**: Python 3.11, pandas, requests, chardet
- **Frontend**: Vite, React, Recharts
- **Dataformat**: Statisk JSON, ingen backend i drift
- **Hosting**: Statisk (GitHub Pages, Cloudflare Pages o.l.)
