# Data Schema – Statens regnskap

**Status: VERIFISERT** mot faktiske nedlastede filer 2026-07-02
(via GitHub Actions-kjøring, se `.github/workflows/debug-kilder.yml`).

## Kilder

| Kilde | URL | Oppdatering |
|-------|-----|-------------|
| DFØ Statsregnskapet | `https://statsregnskapet.dfo.no/last-ned` | Månedlig |
| SSB Folkemengde (tabell 07459) | `https://data.ssb.no/api/v0/no/table/07459` | Årlig |

## Faktiske nedlastings-URL-er (verifisert)

```
https://statsregnskapet.dfo.no/nedlasting/statsregnskapet_aar_{YYYY}.zip     # 2014–2025
https://statsregnskapet.dfo.no/nedlasting/bevilgninger_full_historikk.zip   # alle år
https://statsregnskapet.dfo.no/nedlasting/statsregnskapet_beskrivelse_av_kolonner.csv
https://statsregnskapet.dfo.no/nedlasting/bevilgninger_beskrivelse_av_kolonner.csv
```

Hver ZIP inneholder én CSV med samme navn. `statsregnskapet_aar_2023.csv`
er ~134 MB / ~285 000 rader. Det finnes også `statsregnskapet_SRS_aar_*.zip`
(periodisert SRS-regnskap per virksomhet, 2016–) som vi ikke bruker.

---

## 1. Regnskap: `statsregnskapet_aar_{YYYY}.csv`

| Egenskap | Verdi (verifisert) |
|----------|--------------------|
| Separator | `;` — alle felt kvotert med `"` |
| Desimaltegn | `,` (tre desimaler, øre) |
| Tegnsett | ISO-8859-1 (Latin-1) |
| Granularitet | Én rad per måned (`Periode` = ÅÅÅÅMM) per kontering |
| Beløpsenhet | Kroner (med øre) |
| Fortegn | Debet positivt (utgift), kredit negativt (inntekt) |

### Kolonner (fra `statsregnskapet_beskrivelse_av_kolonner.csv`)

| Kolonne | Forklaring |
|---------|-----------|
| `År` | Regnskapsår |
| `Periode` | Regnskapsperiode (ÅÅÅÅMM) |
| `Konto_no` / `Konto` | Statskontonummer/-navn |
| `Programområde_id` / `Programområde` | Formål |
| `Programkategori_id` / `Programkategori` | Nivå under formål |
| `Fagdepartement_id` / `Fagdepartement` | Departementet som disponerer bevilgningen (2 siffer) |
| `Kapittel_id` / `Kapittel` | Kapittel (4 siffer, f.eks. `1320`) |
| `Post_id` / `Post` | Post — **6 siffer: kapittel (4) + post (2)**, f.eks. `132001` |
| `Post_type` | Tekstlig posttype (se under) |
| `Kontoklasse_id` / `Kontoklasse` | Øverste artskontonivå (1 siffer, standard kontoplan) |
| `Kontogruppe_id` / `Kontogruppe` | Andre nivå (2 siffer) |
| `Artskonto_id` / `Artskonto` | Artskonto på **tresiffernivå** (NS 4102-basert) |
| `Fagdepartement_Virksomhet_id` / `_Virksomhet` | Departementet virksomheten tilhører |
| `Virksomhet_id` / `Virksomhet` | Org.nr. og navn på konterende virksomhet |
| `Regnskapsfører_id` / `Regnskapsfører` | Underliggende enhet |
| `Beløp` | Kroner og øre, signert |

### Post_type-verdier (fra kolonnebeskrivelsen)

| Postnummer | Type |
|------------|------|
| 01–29 | Utgifter til drift |
| 30–49 | Investeringer |
| 50–59 | Overføringer til andre |
| 60–69 | Overføringer til kommuneforvaltningen |
| 70–85 | Andre overføringer (tilskudd) |
| 90–99 | **Utlån, kapitaltilskudd og aksjer** (→ `fin`-flagg) |

### Eksempelrad (faktisk)

```
"2023";"202302";"132001";"Driftsutgifter";"21";"Innenlands transport";"2130";"Veiformål";
"13";"Samferdselsdepartementet";"1320";"Statens vegvesen";"132001";"Driftsutgifter";
"Utgifter til drift";"3";"Salgs- og driftsinntekt";"30";"Salgsinntekt, avgiftspliktig";
"301";"Salgsinntekt varer, avgiftspliktig, fortsettelse";"13";"Samferdselsdepartementet";
"971032081";"Statens vegvesen";"971032081";"Statens vegvesen";"-847732,870"
```

Merk: salgsinntekter kan konteres (kreditert, negativt) på utgiftskapitler —
summen per post er det offisielle regnskapstallet for posten.

---

## 2. Bevilgninger: `bevilgninger_full_historikk.csv`

Samme filformat (`;`, kvotert, Latin-1, desimalkomma, kroner).
Én rad per **bevilgningsvedtak** per kap/post/år (~55 000 rader totalt).

| Kolonne | Forklaring |
|---------|-----------|
| `År`, `Periode`, `Tildelings_periode` | År; periode; når proposisjonen ble fremmet |
| `Programområde*`, `Programkategori*`, `Fagdepartement*` | Som i regnskapet |
| `Kapittel_id`/`Kapittel`, `Post_id`/`Post`, `Post_type` | Som i regnskapet (Post_id 6 siffer) |
| `Bevilgning_beløp` | Bevilget beløp (kroner) |
| `Bevilgning_overføres_beløp` | Kan overføres til neste år |
| `Bevilgning_overført_beløp` | Overført fra forrige år |
| `Bevilgning` | **Tekstlig vedtaksbeskrivelse**, f.eks. «Overført fra 2013», «Saldert budsjett …», proposisjonsreferanser |

### Serie-avledning i ETL (`parse_bevilgning.py`)

- `saldert` = sum av rader der `Bevilgning`-teksten inneholder «saldert»
- `revidert` = saldert + alle andre vedtak («endring»: RNB, nysaldering, tilleggsproposisjoner)
- Rader med «Overført fra …» holdes **utenfor** begge serier (disponible
  overføringer, ikke årets vedtak)
- ETL logger de 20 vanligste `Bevilgning`-tekstene per kjøring slik at
  klassifiseringen kan verifiseres i CI-loggen

---

## 3. SSB Folkemengde (tabell 07459)

`GET https://data.ssb.no/api/v0/no/table/07459` gir metadata. Variabler (verifisert):

| Kode | elimination | Verdier |
|------|-------------|---------|
| `Region` | true | 994 (inkl. `0` = Hele landet) |
| `Kjonn` | true | 2 |
| `Alder` | true | 106 |
| `ContentsCode` | false | 1 (`Personer1`) |
| `Tid` | false | 41 (1986–2026) |

### Fungerende spørring (verifisert, HTTP 200)

```json
POST https://data.ssb.no/api/v0/no/table/07459
{
  "query": [
    {"code": "Region", "selection": {"filter": "item", "values": ["0"]}},
    {"code": "ContentsCode", "selection": {"filter": "item", "values": ["Personer1"]}},
    {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}}
  ],
  "response": {"format": "json-stat2"}
}
```

`Kjonn` og `Alder` utelates (elimination=true → API-et summerer).
ETL bygger spørringen dynamisk fra metadata (`_build_ssb_query` i `download.py`).
Svar: JSON-stat2 med `dimension.Tid.category.index` → årsindeks og `value` → folketall.
Folketallet er per 1.1. i året.

### API-versjoner og fallback

SSB migrerer fra det klassiske v0-APIet (`/api/v0/no/table/{id}`) til
PxWebApi 2.0 (`/api/pxwebapi/v2-beta/tables/{id}`). KPI (03013/08981) og BNP
(09189) hentes derfor med **fallback**: `_download_ssb_tabell` prøver v0 først,
så v2-beta. Alle forespørsler har retry med eksponentiell backoff (2/4/8/16s)
på 429/5xx. KPI og BNP er tilleggsserier — hvis begge API-versjoner er nede
(f.eks. SSB-utfall), hopper ETL over dem med advarsel og skriver ikke
kpi.json/bnp.json; frontend skjuler da «faste kroner»/«% av BNP». Ingen
fabrikkerte erstatningstall.

---

## 4. Normalisert output (`/web/public/data/`)

| Fil | Innhold |
|-----|---------|
| `utgifter.json` | Utgiftshierarki: departement → kapittel → post (kap. 0001–2999). **Slanket** — artskonto/virksomheter ligger i detaljfiler. Poster med detaljer har `harDetaljer: true`. |
| `inntekter.json` | Inntektshierarki (kap. 3000–5999) |
| `detaljer/{u\|i}-{dept}.json` | Lazy-lastet per departement: `{postNodeId: {artskonto, virksomheter}}` |
| `befolkning.json` | `{år: folketall}` |
| `kpi.json` | `{år: KPI-totalindeks}` (SSB 08981/03013) — for faste kroner |
| `bnp.json` | `{år: BNP løpende priser, mill. kr}` (SSB 09189) — for %-av-BNP |
| `meta.json` | Årsintervall, oppdateringstid, kilder, `kpi_basisaar` |

**Ytelse:** hovedtrærne lastes ved oppstart (~1–2 MB); artskonto og
virksomheter (det store volumet) lastes først når man driller til en post,
fra `detaljer/`-filen for postens departement.

**Beløpsenhet i output: millioner kroner** (1 desimal).
Utgifter positive; inntekter positive (fortegn snus for kap. ≥ 3000 i ETL).

### Node-skjema

```typescript
interface BudsjettNode {
  id: string;              // "u-13-1320-01" (side-dept-kap-post)
  navn: string;
  tag?: string;            // "Kap. 1320" / "Post 01"
  niva: "departement" | "kapittel" | "post";
  children?: BudsjettNode[];
  serier: {
    [year: string]: {
      regnskap: number | null;   // null = ikke (fullt) regnskapsført
      saldert: number | null;
      revidert: number | null;
    }
  };
  artskonto?: {              // kun post-nivå
    [year: string]: {
      [artskontoId: string]: {   // 3-siffer artskonto
        navn: string;
        klasse: string;          // kontoklasse-id (1 siffer)
        klasseNavn: string;      // fra faktiske rader
        belop: number;           // mill. kr
      }
    }
  };
  fin?: boolean;           // post 90–99
  transfer?: boolean;      // kap. 2800/5800 (SPU)
}
```

---

## 5. Datafallgruver (håndtert i ETL)

1. **90-poster og SPU**: post ≥ 90 → `fin: true`; kap. 2800/5800 → `transfer: true`.
   Frontend filtrerer dem bort som standard.
2. **Nettobudsjetterte virksomheter** (universiteter/høyskoler m.fl.): rapporterer
   artskonto men mangler gyldig `Kapittel_id`/`Post_id`. ETL flagger radene,
   logger antall og beløp til `etl/warnings.log`, og ekskluderer dem fra
   kapittel/post-hierarkiet.
3. **Fortegn**: debet positivt, kredit negativt. Inntektskapitler krediteres —
   ETL snur fortegnet for kap. ≥ 3000 slik at inntekter er positive.
4. **Månedsrader**: regnskapet har én rad per måned; ETL summerer til årsnivå.
5. **Prognoseår**: siste budsjettår har bevilgning men ikke (fullt) regnskap.
   `regnskap` er tallet som faktisk er bokført så langt (eller `null`);
   frontend viser saldert som stiplet prognose.
6. **Struktuendringer over tid**: departementsnumrene i filene er allerede
   normalisert av DFØ til dagens struktur (f.eks. står 2014-rader med
   «Kommunal- og distriktsdepartementet», som ble opprettet i 2022) —
   historiske tidsserier per departement er dermed konsistente i kildedataene.
   `etl/mappings/` beholdes for ev. fremtidige avvik.

---

## 6. Stortingets behandling av budsjettet (data.stortinget.no)

**Status: VERIFISERT** mot faktiske API-svar 2026-07-08 (via GitHub Actions).

Åpent JSON-API (også XML). `.NET`-datoformat: `/Date(ms+tz)/`. Ingen bot-vegg.
statsbudsjettet.no og regjeringen.no svarer 403 på maskinelle kall — derfor
brukes Stortingets API som strukturert kilde til den *politiske behandlingen*
(selve Prop. 1 S-prosaen er ikke maskinlesbart tilgjengelig).

### Endepunkter (alle med `&format=json`)

| Endepunkt | Innhold |
|-----------|---------|
| `/eksport/sesjoner` | Alle stortingssesjoner (`sesjoner_liste`, `id` som «2024-2025») |
| `/eksport/saker?sesjonid={id}` | `saker_liste` — alle saker; budsjettsaker har «budsjett» i `tittel` |
| `/eksport/sak?sakid={id}` | Detaljer for én sak |
| `/eksport/voteringer?sakid={id}` | `sak_votering_liste` — én rad per votering: `votering_id`, `votering_tema`, `antall_for`, `antall_mot`, `vedtatt` |
| `/eksport/voteringsresultat?voteringid={id}` | `voteringsresultat_liste` — 169 representanter: `representant.etternavn`, `representant.parti.navn`, `votering` (tallkode) |

### `votering`-tallkode (verifisert enum)

Bekreftet empirisk mot faktiske svar 2026-07: **`2` = for, `3` = mot,
`1` = ikke tilstede**. ETL bruker denne faste mappingen (`stortinget.KODE`) og
bruker `antall_for`/`antall_mot` kun som *verifisering* (reconcile). Voteringer
uten opptelt resultat (`antall_* = -1`) er avgjort ved akklamasjon og merkes
`akklamasjon: true` uten partifordeling. Voteringer som ikke reconcilerer
publiseres uten partifordeling (aldri gjettet).

### Output

| Fil | Innhold |
|-----|---------|
| `politikk.json` | Budsjettsaker per sesjon, med nøkkelvoteringer og partifordeling (for/mot) |
| `detaljer/votering-{id}.json` | Representantnivå per votering (lazy-lastet) |

## Oljefondets markedsverdi og uttaksprosent

For å vise oljepengebruken som andel av fondet (handlingsregelen) trengs
Oljefondets (SPU) markedsverdi. Denne finnes ikke i regnskapsdataene — den
avhenger av avkastning og valuta — og hentes fra en manuelt vedlikeholdt
referansetabell: `etl/mappings/fondsverdi.json` (samme kategori som de øvrige
mapping-filene). Tallene er årssluttverdier fra NBIMs årsrapporter.

ETL (`_skriv_fondsverdi`) skriver `web/public/data/fondsverdi.json`
(`år -> mill. kr`). Filen er valgfri: mangler den, skjules uttaksprosenten i
frontend (aldri gjettet).

**Metodikk:** uttaksprosenten for et budsjettår regnes som
`overføring fra fondet (Kap. 5800) / fondets verdi ved INNGANGEN til året`,
der inngangsverdien er verdien ved utgangen av året før. Dette er *faktisk*
uttak som andel av fondsverdien. Merk at regjeringens offisielle uttaksprosent
bruker det *strukturelle* oljekorrigerte underskuddet (glattet), ikke det
faktiske uttaket, så tallene kan avvike noe. 3 %-rettesnoren gjelder over tid,
ikke det enkelte år (jf. 2020: ~4 % under pandemien).

| Fil | Innhold |
|-----|---------|
| `fondsverdi.json` | Oljefondets markedsverdi ved årsslutt (`år -> mill. kr`) |
