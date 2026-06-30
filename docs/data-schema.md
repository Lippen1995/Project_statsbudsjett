# Data Schema – Statens regnskap

> **Merk:** Dette dokumentet er basert på kjent offentlig dokumentasjon av DFØs filer og bør verifiseres mot de faktiske nedlastede filene ved å kjøre `make etl --inspect-only` eller ved å åpne en rå CSV-fil fra `etl/raw/`.

## Kilder

| Kilde | URL | Oppdateringsfrekvens |
|-------|-----|---------------------|
| DFØ Statsregnskapet – Regnskapsdata | `https://statsregnskapet.dfo.no/last-ned` | Månedlig |
| DFØ Statsregnskapet – Bevilgningshistorikk | `https://statsregnskapet.dfo.no/last-ned` | Månedlig |
| SSB Folkemengde (tabell 07459) | `https://data.ssb.no/api/v0/no/table/07459` | Årlig |

---

## 1. Regnskapsdata (faktiske utgifter og inntekter)

### Filnavn / URL-mønster
```
https://statsregnskapet.dfo.no/last-ned?filnavn=regnskapsdata_{YEAR}.csv
```
Eksempel: `regnskapsdata_2023.csv`

### Filformat
| Egenskap | Verdi |
|----------|-------|
| Separator | `;` (semikolon) |
| Desimalskilletegn | `,` (komma) |
| Tegnsett | `ISO-8859-1` (Latin-1) |
| Tittelrad | Ja (første rad) |

### Kolonner (faktisk skjema, verifisert mot nedlastede filer)

| Kolonnenavn | Type | Beskrivelse |
|-------------|------|-------------|
| `Periode` | heltall | Regnskapsår, f.eks. `2023` |
| `Virksomhet` | streng | Virksomhetsnummer (4 siffer) |
| `Virksomhetnavn` | streng | Virksomhetens navn |
| `Departement` | streng | Departementsnummer (2 siffer) |
| `Departementnavn` | streng | Departementets navn |
| `Kapittel` | streng/heltall | Kapittelnummer (3–4 siffer) |
| `Kapittelnavn` | streng | Kapitterets navn |
| `Post` | streng/heltall | Postnummer (2 siffer) |
| `Postnavn` | streng | Postens navn |
| `Artstype` | streng | Artskontotype/klasse |
| `Artskonto` | streng | Artskontonummer (4 siffer) |
| `Artskontonavn` | streng | Artskontobeskrivelse |
| `Belopstegn` | streng | `D` = debet (utgift/kostnad), `K` = kredit (inntekt) |
| `Belop` | desimaltall | Beløp i kroner (tusen kr) – **NB: alltid positivt, bruk Belopstegn** |

### Belopstegn-konvensjon
- `D` (debet) → utgift/kostnad → **positivt beløp** i vår modell
- `K` (kredit) → inntekt → **negativt beløp** etter sign-flip i ETL

### Spesielle tilfeller
- **90-poster**: postnummer ≥ 90 indikerer finanstransaksjoner (utlån, aksjer, avdrag).
- **Nettobudsjetterte virksomheter**: (universiteter, høyskoler) rapporterer artskonto men ikke alltid kapittel/post etter 2018. Disse havner på kapittel `0000` og flagges med `netto=True`.
- **Inntektskapitler**: 5000-serien (skatt, avgift, utbytte) og utgiftskapittel+3000 (eks. kap. 732 → inntektskap. 3732).

---

## 2. Bevilgningshistorikk (vedtatt budsjett)

### Filnavn / URL-mønster
```
https://statsregnskapet.dfo.no/last-ned?filnavn=bevilgningshistorikk.csv
```
Én fil med alle år.

### Filformat
| Egenskap | Verdi |
|----------|-------|
| Separator | `;` |
| Desimalskilletegn | `,` |
| Tegnsett | `ISO-8859-1` |

### Kolonner

| Kolonnenavn | Type | Beskrivelse |
|-------------|------|-------------|
| `Periode` | heltall | Budsjettår |
| `Departement` | streng | Departementsnummer |
| `Departementnavn` | streng | |
| `Kapittel` | streng | Kapittelnummer |
| `Kapittelnavn` | streng | |
| `Post` | streng | Postnummer |
| `Postnavn` | streng | |
| `Bevilgningstype` | streng | `Saldert budsjett`, `Revidert nasjonalbudsjett`, `Nysaldering` |
| `Belop` | desimaltall | Beløp i tusen kroner (positiv for utgifter, kan være negativ) |

### Bevilgningstyper vi bruker
- `Saldert budsjett` → `saldert` i datamodellen
- `Revidert nasjonalbudsjett` / `Nysaldering` → siste verdi per år → `revidert` i datamodellen

---

## 3. SSB Folkemengde

### API
```
POST https://data.ssb.no/api/v0/no/table/07459
Content-Type: application/json
```

### Query-payload (PX-API JSON)
```json
{
  "query": [
    {"code": "Region", "selection": {"filter": "item", "values": ["0"]}},
    {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}}
  ],
  "response": {"format": "json-stat2"}
}
```

### Response
JSON-stat2-format. Nøkkelfelt:
- `dimension.Tid.category.index` → årstall-labels
- `value` → folkemengde (antall personer)

---

## 4. Normalisert output (`/web/public/data/`)

### Filer

| Fil | Beskrivelse |
|-----|-------------|
| `utgifter.json` | Brutto utgiftshierarki (departement→kapittel→post) |
| `inntekter.json` | Brutto inntektshierarki |
| `befolkning.json` | `{år: antall}` oppslag |
| `meta.json` | Siste oppdateringstidspunkt, årsintervall, datakilder |

### Node-skjema (TypeScript-definisjon)

```typescript
interface BudsjettNode {
  id: string;           // f.eks. "u-732-72" (type-kapittel-post)
  navn: string;
  tag?: string;         // "Kap. 732" / "Post 72"
  niva: "departement" | "kapittel" | "post";
  children?: BudsjettNode[];
  serier?: {
    [year: number]: {
      regnskap: number | null;   // null hvis ikke tilgjengelig
      saldert: number | null;
      revidert: number | null;
    }
  };
  artskonto?: {
    [year: number]: {
      [artskontoId: string]: {
        navn: string;
        belop: number;
      }
    }
  };
  fin?: boolean;        // 90-post (finanstransaksjon)
  transfer?: boolean;   // SPU-overføring (kap. 2800, 5800 mv.)
  netto?: boolean;      // nettobudsjettert virksomhet
}
```

### Beløpskonvensjon
- **Alle beløp i millioner kroner** (avrundet til 1 desimal)
- Utgifter: **positive tall**
- Inntekter: **positive tall** (brutto, ikke nettotall)

---

## 5. Kjente datafallgruver

### Departementsstrukturen endres
Departementer slås sammen og splittes over tid. Eksempler:
- Justis- og beredskapsdepartementet fikk endret kapittelnummer
- Kommunal- og moderniseringsdepartementet ble til KDD og SPD i 2022

Mappping-filer i `etl/mappings/`:
- `dept_mapping.json` – stabile ID-er på tvers av år
- `kap_mapping.json` – kapittelnummer-aliaser (omstrukturering over år)

### Netto vs brutto
Nettobudsjetterte virksomheter (primært universiteter/høyskoler, helseforetak):
- Rapporterer artskonto men ikke kapittel/post etter 2018
- Aggregeres under `kapittel=0000` i virksomhetens departement
- Flagges med `netto=True` og logges til `etl/warnings.log`

### Statsfondsoverføringer
- Kap. 2800 / 5800: overføringer til/fra Statens pensjonsfond utland
- Flagges med `transfer=True`
- Beløpene er svært store og forvrenger samlede stats tall uten filter

### 90-poster
- Post 90–99: utlån, avdrag, aksjer, finanstransaksjoner
- Flagges med `fin=True`
- Bør ikke inngå i ordinære drifts-/overføringsaggregater
