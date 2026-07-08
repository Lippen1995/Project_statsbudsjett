"""
KOSTRA – kommunale og fylkeskommunale regnskapstall fra SSB.

Datamodell (samme form som statsregnskapet): enhet (kommune/fylke/landet) →
funksjon (tjenesteområde) → art (kostnadsart) → beløp over år.

VIKTIG – metadata-drevet, ingen antatte verdikoder:
  SSB endrer/deprecerer KOSTRA-tabeller (vi har sett v0 400 og v2-beta 503).
  Derfor hardkoder vi ikke dimensjons- eller verdikoder. Vi leser tabellens
  FAKTISKE metadata ved kjøretid, klassifiserer dimensjonene på tekst/kode
  (region / funksjon / art / tid / contents) og bygger spørringen dynamisk.
  Kjenner vi ikke igjen skjemaet, feiler vi høyt (KildeFeil) og steget hoppes
  over av etl.py sin _valgfri(...) – vi fabrikkerer aldri tall.

  Alle tall kan spores til en nedlastet json-stat2-fil i etl/raw/kostra_*.

Enheter: kommunenummer normaliseres til stabile ID-er via
etl/mappings/kommune_mapping.json (håndterer 2020-sammenslåingene).
"""
import json
import logging
import re
from pathlib import Path

# Gjenbruk nedlastings-infrastrukturen fra statsregnskaps-ETL-en
from download import (
    RAW_DIR, HEADERS, KildeFeil, _get, _request_med_retry, _validate_not_html,
)

logger = logging.getLogger(__name__)

# Kandidat-tabeller for kommunalt DRIFTSregnskap etter region/funksjon/art.
# SSB-tabell-ID-er må bekreftes mot faktisk metadata (se probe i
# .github/workflows/debug-kilder.yml). Vi PRØVER hver i rekkefølge og bruker
# den første som gir gyldig KOSTRA-formet metadata (region + funksjon + tid).
KOSTRA_DRIFT_KANDIDATER = ["12134", "12167", "13924"]

MAPPINGS_DIR = Path(__file__).parent / "mappings"

# json-stat2 rolle-/kodegjenkjenning. SSB bruker koder som «Region»,
# «KOKkommuneregion0000», «KOKfunksjon0000», «KOKart0000», «ContentsCode»,
# «Tid». Vi matcher primært på den menneskelige teksten (var["text"]).
_RE_REGION = re.compile(r"region|kommun|fylke", re.I)
_RE_FUNKSJON = re.compile(r"funksjon", re.I)
_RE_ART = re.compile(r"\bart\b|artskonto|art\b", re.I)


# ---------------------------------------------------------------------------
# Kommunenummer-mapping (stabile ID-er over tid)

def last_kommune_mapping() -> dict:
    """Les etl/mappings/kommune_mapping.json. Returnerer {} hvis fila mangler."""
    sti = MAPPINGS_DIR / "kommune_mapping.json"
    if not sti.exists():
        return {}
    data = json.loads(sti.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def stabil_kommune_id(komnr: str, mapping: dict) -> str:
    """
    Map et (historisk) kommunenummer til stabilt nummer.
    Ved sammenslåing peker gamle numre til det nye. Ukjente numre beholdes.
    """
    komnr = (komnr or "").strip()
    m = mapping.get(komnr)
    if isinstance(m, dict):
        return str(m.get("ny", komnr))
    if isinstance(m, str):
        return m
    return komnr


# ---------------------------------------------------------------------------
# Metadata-klassifisering

def _finn_dim(variabler: list, regex: re.Pattern, ekskluder: set = frozenset()):
    """Finn første variabel der code eller text matcher regex (ikke i ekskluder)."""
    for v in variabler:
        code = v.get("code", "")
        if code in ekskluder:
            continue
        if regex.search(code) or regex.search(v.get("text", "")):
            return v
    return None


def klassifiser_dimensjoner(metadata: dict) -> dict:
    """
    Klassifiser tabellens variabler til roller.
    Returnerer {region, funksjon, art, tid, contents, ovrige} med variabel-dicts
    (art/ovrige kan være None). Kaster KildeFeil hvis region/funksjon/tid mangler
    – da er dette ikke en KOSTRA-tabell på forventet form.
    """
    variabler = metadata.get("variables", [])
    if not variabler:
        raise KildeFeil("FEIL: KOSTRA-metadata mangler 'variables'.")

    tid = next((v for v in variabler if v.get("code") == "Tid"), None)
    contents = next((v for v in variabler if v.get("code") == "ContentsCode"), None)
    brukt = {v["code"] for v in (tid, contents) if v}

    region = _finn_dim(variabler, _RE_REGION, brukt)
    if region:
        brukt.add(region["code"])
    funksjon = _finn_dim(variabler, _RE_FUNKSJON, brukt)
    if funksjon:
        brukt.add(funksjon["code"])
    art = _finn_dim(variabler, _RE_ART, brukt)
    if art:
        brukt.add(art["code"])

    mangler = [n for n, v in [("region", region), ("funksjon", funksjon),
                              ("Tid", tid)] if v is None]
    if mangler:
        koder = [(v.get("code"), v.get("text")) for v in variabler]
        raise KildeFeil(
            f"FEIL: KOSTRA-tabell mangler dimensjon(er) {mangler}. "
            f"Gjenkjente ikke skjemaet – variabler: {koder}"
        )

    ovrige = [v for v in variabler if v["code"] not in brukt and v is not contents]
    return {"region": region, "funksjon": funksjon, "art": art,
            "tid": tid, "contents": contents, "ovrige": ovrige}


def _velg_contents(contents: dict):
    """
    Velg ContentsCode-verdi for regnskapsførte kroner (ikke per innbygger).
    Returnerer (verdikode, faktor_til_mill_kr). KOSTRA oppgir vanligvis
    beløp i 1000 kr → faktor 1/1000 til mill. kr.
    """
    if not contents:
        return None, 1e-6  # ingen ContentsCode: anta rene kroner
    vals = contents.get("values", [])
    txts = contents.get("valueTexts", [])
    # Foretrekk «regnskap»/«beløp» i kroner, unngå «per innbygger»/«prosent»
    beste = None
    for v, t in zip(vals, txts):
        tl = (t or "").lower()
        if "innbygger" in tl or "prosent" in tl or "andel" in tl or "%" in tl:
            continue
        if "kr" in tl or "beløp" in tl or "regnskap" in tl:
            beste = (v, t)
            break
    if beste is None and vals:
        beste = (vals[0], txts[0] if txts else "")
    v, t = beste
    faktor = 1e-3 if "1000" in (t or "") else 1e-6  # 1000 kr → mill, ellers kr → mill
    logger.info(f"    ContentsCode: {v!r} ({t}) → faktor {faktor:g} til mill. kr")
    return v, faktor


# ---------------------------------------------------------------------------
# Nedlasting

def _post_ssb_v0(tabell_id: str, payload: dict, timeout: int = 180):
    url = f"https://data.ssb.no/api/v0/no/table/{tabell_id}"
    resp = _request_med_retry(
        "POST", url, json=payload,
        headers={**HEADERS, "Content-Type": "application/json"}, timeout=timeout)
    if resp.status_code != 200:
        raise KildeFeil(
            f"\nFEIL: HTTP {resp.status_code} fra KOSTRA-tabell {tabell_id}.\n"
            f"Svar: {resp.text[:400]}")
    _validate_not_html(resp.content, url)
    return resp.json()


def finn_kostra_tabell(kandidater=None) -> tuple:
    """
    Prøv kandidat-tabellene til én gir gyldig KOSTRA-metadata.
    Returnerer (tabell_id, metadata, roller). Kaster KildeFeil hvis ingen virker.
    """
    kandidater = kandidater or KOSTRA_DRIFT_KANDIDATER
    feil = []
    for tid in kandidater:
        url = f"https://data.ssb.no/api/v0/no/table/{tid}"
        try:
            logger.info(f"  GET {url} (metadata)")
            md = _get(url, timeout=60).json()
            roller = klassifiser_dimensjoner(md)
            logger.info(f"  KOSTRA-tabell {tid} gjenkjent: "
                        f"region={roller['region']['code']}, "
                        f"funksjon={roller['funksjon']['code']}, "
                        f"art={roller['art']['code'] if roller['art'] else '—'}")
            return tid, md, roller
        except KildeFeil as e:
            feil.append(f"tabell {tid}: {e}")
            logger.warning(f"  KOSTRA-kandidat {tid} forkastet — prøver neste")
    raise KildeFeil("\nFEIL: Ingen KOSTRA-tabell fungerte:\n" + "\n---\n".join(feil))


def _bygg_query(roller: dict, *, funksjon_filter="all", art_filter=None,
                region_values=None, contents_val=None, tid_values=None) -> dict:
    """
    Bygg v0-spørring. Region: alle (eller angitte). Funksjon: alle (eller
    aggregert bort). Art: utelatt (aggregeres) med mindre art_filter='all'.
    Tid: alle, eller de angitte årene (vi henter år-for-år for å holde oss
    trygt under SSBs celletak). Øvrige: elimineres hvis mulig, ellers første.
    """
    q = []
    reg = roller["region"]
    if region_values:
        q.append({"code": reg["code"],
                  "selection": {"filter": "item", "values": region_values}})
    else:
        q.append({"code": reg["code"], "selection": {"filter": "all", "values": ["*"]}})

    funk = roller["funksjon"]
    if funksjon_filter == "all":
        q.append({"code": funk["code"], "selection": {"filter": "all", "values": ["*"]}})
    # funksjon_filter None → utelat (elimineres av API-et)

    art = roller["art"]
    if art and art_filter == "all":
        q.append({"code": art["code"], "selection": {"filter": "all", "values": ["*"]}})
    # art utelatt ellers → API-et aggregerer over art

    if roller["contents"] and contents_val:
        q.append({"code": "ContentsCode",
                  "selection": {"filter": "item", "values": [contents_val]}})

    for v in roller["ovrige"]:
        if v.get("elimination", False):
            continue
        q.append({"code": v["code"],
                  "selection": {"filter": "item", "values": [v["values"][0]]}})

    if tid_values:
        q.append({"code": "Tid", "selection": {"filter": "item", "values": tid_values}})
    else:
        q.append({"code": "Tid", "selection": {"filter": "all", "values": ["*"]}})
    return {"query": q, "response": {"format": "json-stat2"}}


def download_kostra_hovedtabell(force: bool = False) -> dict:
    """
    Last ned KOSTRA driftsregnskap på region×funksjon×tid (art aggregert bort).
    Henter ÅR FOR ÅR (region×funksjon×1 år) for å holde oss trygt under SSBs
    celletak, og skriver én json-stat2-fil per år til etl/raw/. Returnerer
    {"tabell", "faktor", "roller_koder", "paths": [Path, …]}.
    """
    meta_dest = RAW_DIR / "kostra_drift_funksjon.meta.json"
    if meta_dest.exists() and not force:
        info = json.loads(meta_dest.read_text(encoding="utf-8"))
        paths = [RAW_DIR / n for n in info.get("filer", [])]
        if paths and all(p.exists() for p in paths):
            logger.info(f"  CACHE HIT: kostra_drift_funksjon ({len(paths)} filer)")
            return info | {"paths": paths}

    tabell_id, md, roller = finn_kostra_tabell()
    contents_val, faktor = _velg_contents(roller["contents"])
    aar_koder = roller["tid"].get("values", [])
    if not aar_koder:
        raise KildeFeil("FEIL: KOSTRA-tabell mangler Tid-verdier.")

    filer, paths = [], []
    for aar in aar_koder:
        payload = _bygg_query(roller, funksjon_filter="all", art_filter=None,
                              contents_val=contents_val, tid_values=[aar])
        logger.info(f"  POST KOSTRA {tabell_id} (region×funksjon, år {aar})")
        try:
            data = _post_ssb_v0(tabell_id, payload)
        except KildeFeil as e:
            # Enkeltår kan mangle/feile – hopp over det, ikke hele serien
            logger.warning(f"    hopper over år {aar}: {e}")
            continue
        navn = f"kostra_drift_funksjon_{aar}.json"
        p = RAW_DIR / navn
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        filer.append(navn)
        paths.append(p)
        logger.info(f"    -> {navn} ({p.stat().st_size // 1024} KB)")

    if not paths:
        raise KildeFeil(f"FEIL: Ingen KOSTRA-år kunne hentes fra tabell {tabell_id}.")

    info = {
        "tabell": tabell_id,
        "faktor": faktor,
        "filer": filer,
        "roller_koder": {
            "region": roller["region"]["code"],
            "funksjon": roller["funksjon"]["code"],
            "art": roller["art"]["code"] if roller["art"] else None,
        },
    }
    meta_dest.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
    return info | {"paths": paths}


# ---------------------------------------------------------------------------
# Parsing (json-stat2, generisk over dimensjoner)

def _jsonstat_iter(data: dict):
    """
    Iterer over en json-stat2-kube og gi (dim_code→verdikode, verdi).
    Bruker row-major indeksering (siste dimensjon varierer raskest).
    """
    dim_ids = data.get("id") or list(data.get("dimension", {}).keys())
    sizes = data.get("size") or [
        len(data["dimension"][d]["category"]["index"]) for d in dim_ids]
    values = data.get("value", [])

    # For hver dimensjon: posisjon → verdikode
    pos_koder = []
    for d in dim_ids:
        index = data["dimension"][d]["category"]["index"]
        if isinstance(index, dict):
            koder = sorted(index, key=lambda k: index[k])
        else:
            koder = list(index)
        pos_koder.append(koder)

    # strides for row-major
    strides = [1] * len(sizes)
    for i in range(len(sizes) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    total = 1
    for s in sizes:
        total *= s
    for flat in range(min(total, len(values))):
        v = values[flat]
        if v is None:
            continue
        koder = {}
        rest = flat
        for i, d in enumerate(dim_ids):
            pos = rest // strides[i]
            rest = rest % strides[i]
            koder[d] = pos_koder[i][pos]
        yield koder, v


def _labels(data: dict, dim_code: str) -> dict:
    return data.get("dimension", {}).get(dim_code, {}).get("category", {}).get("label", {})


def _klassifiser_enhet(code: str, navn: str) -> str:
    """Klassifiser en region-verdi som kommune/fylke/land/gruppe."""
    c = (code or "").strip()
    n = (navn or "").lower()
    if "hele landet" in n or c in ("0", "EAK", "EAKUO"):
        return "land"
    if "gruppe" in n or c.startswith("EKG") or c.startswith("EKA"):
        return "gruppe"
    if "fylke" in n or (c.isdigit() and len(c) <= 2) or c.startswith("EAF"):
        return "fylke"
    if c.isdigit() and len(c) == 4:
        return "kommune"
    # Ukjente aggregat-koder (bokstavprefiks) → gruppe
    if c and not c.isdigit():
        return "gruppe"
    return "kommune"


def parse_kostra_hovedtabell(path: Path, faktor: float, roller_koder: dict,
                             mapping: dict = None) -> dict:
    """
    Parse json-stat2 til {enhet_id: {"navn","type","funksjoner":{fkode:{navn,serier}}}}.
    serier = {år(int): beløp_mill(float)}. Beløp summeres ved sammenslåing.
    """
    mapping = mapping or {}
    data = json.loads(path.read_text(encoding="utf-8"))
    reg_code = roller_koder["region"]
    funk_code = roller_koder["funksjon"]

    reg_labels = _labels(data, reg_code)
    funk_labels = _labels(data, funk_code)

    enheter: dict = {}
    for koder, verdi in _jsonstat_iter(data):
        rk = koder.get(reg_code)
        fk = koder.get(funk_code)
        tid = koder.get("Tid")
        if rk is None or fk is None or tid is None:
            continue
        try:
            aar = int(str(tid)[:4])
        except ValueError:
            continue
        belop_mill = float(verdi) * faktor

        navn = reg_labels.get(rk, rk)
        etype = _klassifiser_enhet(rk, navn)
        if etype == "kommune":
            enhet_id = stabil_kommune_id(rk, mapping)
            m = mapping.get(rk)
            if isinstance(m, dict) and m.get("navn"):
                navn = m["navn"]   # bruk det nye (sammenslåtte) navnet
        else:
            enhet_id = rk

        e = enheter.setdefault(enhet_id, {"navn": navn, "type": etype, "funksjoner": {}})
        f = e["funksjoner"].setdefault(
            fk, {"navn": funk_labels.get(fk, fk), "serier": {}})
        f["serier"][aar] = round(f["serier"].get(aar, 0.0) + belop_mill, 3)

    if not enheter:
        raise KildeFeil(f"FEIL: Ingen KOSTRA-verdier i {path.name}.")
    logger.info(f"  -> {len(enheter)} enheter, "
                f"{sum(len(e['funksjoner']) for e in enheter.values())} enhet×funksjon")
    return enheter


def _merge_enheter(dst: dict, src: dict) -> None:
    """Slå src-enheter inn i dst (summerer overlappende år)."""
    for eid, e in src.items():
        d = dst.setdefault(eid, {"navn": e["navn"], "type": e["type"], "funksjoner": {}})
        for fk, f in e["funksjoner"].items():
            df = d["funksjoner"].setdefault(fk, {"navn": f["navn"], "serier": {}})
            for aar, v in f["serier"].items():
                df["serier"][aar] = round(df["serier"].get(aar, 0.0) + v, 3)


def parse_kostra_mange(paths: list, faktor: float, roller_koder: dict,
                       mapping: dict = None) -> dict:
    """Parse og slå sammen flere KOSTRA-årsfiler til én enheter-struktur."""
    enheter: dict = {}
    for p in paths:
        _merge_enheter(enheter, parse_kostra_hovedtabell(
            Path(p), faktor, roller_koder, mapping=mapping))
    return enheter


# ---------------------------------------------------------------------------
# Bygg output

def _enhet_node(enhet_id: str, enhet: dict) -> dict:
    """Bygg en enhet-node med funksjons-barn (BudsjettNode-lignende form)."""
    funk_noder = []
    total_serier: dict = {}
    for fk, f in enhet["funksjoner"].items():
        serier = {str(a): {"regnskap": round(v, 1)} for a, v in sorted(f["serier"].items())}
        for a, v in f["serier"].items():
            total_serier[a] = round(total_serier.get(a, 0.0) + v, 1)
        funk_noder.append({
            "id": f"kostra-{enhet_id}-f{fk}",
            "navn": f["navn"],
            "tag": f"Funksjon {fk}",
            "niva": "funksjon",
            "serier": serier,
        })
    # Sorter funksjoner etter siste års beløp
    def _siste(n):
        s = n["serier"]
        return s.get(max(s), {}).get("regnskap", 0) if s else 0
    funk_noder.sort(key=_siste, reverse=True)
    return {
        "id": f"kostra-{enhet_id}",
        "navn": enhet["navn"],
        "type": enhet["type"],
        "niva": "enhet",
        "serier": {str(a): {"regnskap": round(v, 1)} for a, v in sorted(total_serier.items())},
        "children": funk_noder,
    }


def bygg_kostra(output_dir: Path, force: bool = False) -> dict:
    """
    Hoved-inngang: last ned + parse + skriv kostra.json.
    Returnerer kostra-strukturen. Kaster KildeFeil ved SSB-utfall (skip i etl.py).
    """
    info = download_kostra_hovedtabell(force=force)
    mapping = last_kommune_mapping()
    enheter = parse_kostra_mange(
        info["paths"], info["faktor"], info["roller_koder"], mapping=mapping)

    noder = [_enhet_node(eid, e) for eid, e in enheter.items()]
    # Sorter: land, fylke, så kommuner (etter siste års total)
    type_rang = {"land": 0, "fylke": 1, "gruppe": 2, "kommune": 3}

    def _siste_total(n):
        s = n["serier"]
        return s.get(max(s), {}).get("regnskap", 0) if s else 0
    noder.sort(key=lambda n: (type_rang.get(n["type"], 9), -_siste_total(n)))

    alle_aar = sorted({int(a) for n in noder for a in n["serier"]})
    resultat = {
        "tabell": info["tabell"],
        "aar": alle_aar,
        "enheter": noder,
    }
    sanity_kostra(resultat)

    output_dir.mkdir(parents=True, exist_ok=True)
    sti = output_dir / "kostra.json"
    sti.write_text(json.dumps(resultat, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    logger.info(f"  Skrev {sti.name} ({sti.stat().st_size // 1024} KB, "
                f"{len(noder)} enheter, år {alle_aar[0] if alle_aar else '—'}"
                f"–{alle_aar[-1] if alle_aar else '—'})")
    return resultat


# ---------------------------------------------------------------------------
# Reconciliation / sanity

def _enhet_total(node: dict, aar: int) -> float:
    s = node.get("serier", {}).get(str(aar))
    return s.get("regnskap", 0.0) if s else 0.0


def sanity_kostra(resultat: dict, toleranse: float = 0.02) -> None:
    """
    Konsistenssjekker (feiler høyt ved klar feil, advarer ved avvik):
      1. Enhetens totalserie = sum av funksjonene (byggekonsistens).
      2. Hvis en «land»-enhet finnes: sammenlign totalen med summen av
         kommune-enhetene per år (reconciliation mot publisert landstall).
         Avvik logges (skala/scope kan variere) – felles ikke pipelinen.
    """
    noder = resultat.get("enheter", [])
    aar_liste = resultat.get("aar", [])

    for n in noder:
        for aar in aar_liste:
            total = _enhet_total(n, aar)
            funk_sum = sum(
                c.get("serier", {}).get(str(aar), {}).get("regnskap", 0.0)
                for c in n.get("children", [])
            )
            if abs(total - funk_sum) > max(1.0, abs(total) * 1e-6):
                raise KildeFeil(
                    f"FEIL: KOSTRA-inkonsistens for {n['navn']} {aar}: "
                    f"enhetstotal {total:.1f} ≠ sum funksjoner {funk_sum:.1f} mill."
                )

    land = next((n for n in noder if n["type"] == "land"), None)
    if land:
        for aar in aar_liste:
            land_total = _enhet_total(land, aar)
            komm_sum = sum(_enhet_total(n, aar) for n in noder if n["type"] == "kommune")
            if land_total and komm_sum and abs(land_total - komm_sum) / abs(land_total) > toleranse:
                logger.warning(
                    f"  [ADVARSEL] KOSTRA reconciliation {aar}: landstall "
                    f"{land_total:,.0f} vs. sum kommuner {komm_sum:,.0f} mill. "
                    f"(avvik {abs(land_total-komm_sum)/abs(land_total)*100:.1f} %) – "
                    "kan skyldes ulik scope/aggregering, sjekk mot publisert KOSTRA."
                )
            elif land_total:
                logger.info(
                    f"  [SANITY OK] KOSTRA {aar}: landstall {land_total:,.0f} mill., "
                    f"sum kommuner {komm_sum:,.0f} mill.")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="KOSTRA ETL (SSB)")
    p.add_argument("--force", action="store_true")
    p.add_argument("--out", default=str(Path(__file__).parent.parent / "web" / "public" / "data"))
    args = p.parse_args()
    bygg_kostra(Path(args.out), force=args.force)
