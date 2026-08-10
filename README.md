# Fellestall.no – statsfinansene, normalisert og forklart

Webapplikasjon som visualiserer det norske statsbudsjettet og -regnskapet med ekte data fra DFØ Statsregnskapet og SSB.

**Livedemonstrasjon krever at ETL har vært kjørt** – se oppsett nedenfor.

## Funksjonalitet

Forsiden er én sammenhengende gjennomgang som går fra helheten til den enkelte
posten. Alle seksjonene leser samme datagrunnlag:

1. **Vokser staten raskere enn prisene?** – utgift per innbygger mot
   konsumprisindeksen, begge indeksert til startåret. Dra over grafen for å
   snevre inn perioden. Krever `kpi.json` fra ETL-en.
2. **Hele budsjettet på ett kart** – squarified treemap, klikkbar nedover
   departement → kapittel → post.
3. **Fra inntekt til utgift** – sankeydiagram fra inntektskildene, gjennom
   statsbudsjettet, ut til departementene.
4. **Hvor pengene går** – utgiftene rangert i kroner per innbygger.
5. **Hva økte, hva ble kuttet** – vannfallsdiagram mellom to valgfrie tall
   (to regnskapsår, eller regnskap mot budsjett), med nedbryting nivå for nivå.
6. **Oljefondet** – hva som spares og hva som brukes, uttaket målt mot
   rettesnoren på 3 prosent.
7. **Hva staten får av lønnen din** – skattemodell med Stortingets satser for
   2025, fordelt på stat, kommune og fylkeskommune, og statens del fordelt
   etter den faktiske utgiftsfordelingen.
8. **Utforsk hver krone** – analyseverktøyet uten forenklinger:
   - Klikkbart hierarki: departement → kapittel → post → artskonto
   - Regnskap, saldert og revidert budsjett, per år (2014→siste budsjettår)
   - Historikkgraf med årlig vekstrate og fest-til-sammenligning
   - Stablet areal for sammensetningen over tid
   - Søk på tvers av alle poster, per-innbygger-skalering og CSV-eksport
   - Filter for finanstransaksjoner og SPU-overføringer

Det opprinnelige analyseverktøyet – med Stortingets voteringer
(`politikk.json`) og virksomhetsnivået, som ennå ikke har fått plass i den nye
visningen – ligger på `#klassisk` (f.eks. `http://localhost:5173/#klassisk`).

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
├── web/                     Frontend (Vite + React)
│   ├── src/
│   │   ├── main.jsx         Inngang – Fellestall, eller App på #klassisk
│   │   ├── fellestall/      Forsiden
│   │   │   ├── Fellestall.jsx   Skall, tilstand og avledede tall
│   │   │   ├── kompakt.js       Adapter fra ETL-format + oppslag
│   │   │   ├── design.js        Farger, kortnavn og redaksjonelle tekster
│   │   │   ├── tall.js          Tallformatering
│   │   │   ├── bruk.js          Hooks: inntoning og scroll-markering
│   │   │   ├── seksjoner/       Én komponent per seksjon
│   │   │   └── grafer/          SVG-grafer (linje, treemap, sankey, vannfall)
│   │   ├── App.jsx          Rot-komponent for den klassiske visningen
│   │   ├── components/      UI-komponenter for den klassiske visningen
│   │   └── lib/             Datalasting, aggregering og formatering
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
| [NBIM – Oljefondets markedsverdi](https://www.nbim.no) | Årsrapporter (referansetabell) |

## Datafallgruver

Se [`docs/data-schema.md`](docs/data-schema.md) for detaljert dokumentasjon av:
- Brutto vs. netto (nettobudsjetterte virksomheter)
- 90-poster (finanstransaksjoner)
- SPU-overføringer (kap. 2800/5800)
- Departementsomstruktureringer og kapittelmappinger
- Belopstegn-konvensjon (D=utgift, K=inntekt)

## Teknologi

- **ETL**: Python 3.11, pandas, requests, chardet
- **Frontend**: Vite, React. Forsidens grafer er håndtegnet SVG uten
  grafbibliotek; den klassiske visningen bruker Recharts.
- **Dataformat**: Statisk JSON, ingen backend i drift
- **Hosting**: Statisk (GitHub Pages, Cloudflare Pages o.l.)
