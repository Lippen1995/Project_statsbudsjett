# Statens regnskap – interaktiv visualisering

Webapplikasjon som visualiserer det norske statsbudsjettet og -regnskapet med ekte data fra DFØ Statsregnskapet og SSB.

**Livedemonstrasjon krever at ETL har vært kjørt** – se oppsett nedenfor.

## Funksjonalitet

To visninger deler samme datagrunnlag:

- **Forklart** – klarspråklig inngang for folk flest. Hele budsjettet regnet om
  til kroner per innbygger, med plain-tekst-forklaring av hva hvert område
  betaler for og hvor pengene kommer fra, samt hva som økte og ble kuttet mest
  mot året før. Viser også hvordan utgiftene finansieres (skatt vs. oljepengebruk)
  og Oljefonds-mekanismen, slik at det går fram at oljeinntektene spares og bare
  den regelstyrte overføringen fra fondet brukes på budsjettet. Klikk på et område
  for å hoppe rett inn i analyseverktøyet.
- **Utforsk** – analyseverktøyet med full drilldown og alle detaljer:

- Brutto inntekter og utgifter per år (2014→siste regnskapsår)
- Klikkbart hierarki: departement → kapittel → post
- Historikkgraf med regnskap, saldert budsjett og prognose-forlengelse
- Artskonto-pivot (lønn, kjøp, overføringer, investeringer …)
- Per-innbygger-skalering (SSB folkemengde)
- Filter for finanstransaksjoner og SPU-overføringer

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
│   ├── build_hierarchy.py   Bygger JSON-hierarkier
│   ├── requirements.txt
│   ├── raw/                 Nedlastede råfiler (gitignored)
│   ├── mappings/            Departementsaliaser mv.
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

Neste datadimensjon er **KOSTRA (kommune-/fylkesregnskap)**. Se
[`docs/ROADMAP-KOSTRA.md`](docs/ROADMAP-KOSTRA.md) for plan og metodikk.

## Datakilder

| Kilde | Lisens |
|-------|--------|
| [DFØ Statsregnskapet](https://statsregnskapet.dfo.no) | NLOD |
| [SSB Folkemengde](https://www.ssb.no/befolkning) | CC BY 4.0 |

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
