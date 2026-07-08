"""
Download og caching av råfiler fra DFØ Statsregnskapet og SSB.
Feiler høyt hvis en kilde ikke kan nås — ingen fallback til mock-data.

Faktiske filer (verifisert mot statsregnskapet.dfo.no/last-ned 2026-07):
  /nedlasting/statsregnskapet_aar_{YYYY}.zip   – regnskap per år (2014–)
  /nedlasting/bevilgninger_full_historikk.zip  – bevilgningshistorikk, alle år
  /nedlasting/statsregnskapet_beskrivelse_av_kolonner.csv
  /nedlasting/bevilgninger_beskrivelse_av_kolonner.csv
"""
import io
import json
import logging
import time
import zipfile
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

# Retry-oppførsel for eksterne API-er. SSB (og av og til DFØ) svarer 429/503
# ved rate-limiting eller midlertidig overlast — da venter vi og prøver igjen
# med eksponentiell backoff i stedet for å felle ETL-en.
RETRY_STATUS = {429, 500, 502, 503, 504}
RETRY_BACKOFF = [2, 4, 8, 16]   # sekunder mellom forsøk (5 forsøk totalt)


def _sov(sekunder: float, grunn: str) -> None:
    logger.info(f"    venter {sekunder:.0f}s ({grunn})")
    time.sleep(sekunder)


def _request_med_retry(metode: str, url: str, **kwargs) -> requests.Response:
    """
    Utfør en HTTP-forespørsel med retry + eksponentiell backoff.
    Respekterer Retry-After-headeren når serveren oppgir den.
    Kaster KildeFeil først når alle forsøk er brukt opp.
    """
    headers = {**HEADERS, **kwargs.pop("headers", {})}
    siste_feil = None
    for forsok in range(len(RETRY_BACKOFF) + 1):
        try:
            resp = requests.request(metode, url, headers=headers, **kwargs)
        except requests.exceptions.ConnectionError as e:
            siste_feil = f"tilkoblingsfeil: {e}"
            resp = None
        else:
            if resp.status_code not in RETRY_STATUS:
                return resp
            siste_feil = f"HTTP {resp.status_code}"

        if forsok < len(RETRY_BACKOFF):
            vent = RETRY_BACKOFF[forsok]
            # Respekter Retry-After hvis serveren oppgir den
            if resp is not None:
                ra = resp.headers.get("Retry-After")
                if ra and ra.isdigit():
                    vent = max(vent, int(ra))
            _sov(vent, f"{siste_feil}, forsøk {forsok + 1}/{len(RETRY_BACKOFF)}")
        else:
            raise KildeFeil(
                f"\nFEIL: {metode} {url} feilet etter {len(RETRY_BACKOFF) + 1} forsøk "
                f"({siste_feil}). Sannsynlig midlertidig utfall eller rate-limiting."
            )
    raise KildeFeil(f"\nFEIL: {metode} {url}: {siste_feil}")

RAW_DIR = Path(__file__).parent / "raw"
RAW_DIR.mkdir(exist_ok=True)

BASE_URL = "https://statsregnskapet.dfo.no"
SSB_TABLE_URL = "https://data.ssb.no/api/v0/no/table/07459"

HEADERS = {
    "User-Agent": "statsbudsjett-visualisering/1.0 (open source)",
    "Accept": "*/*",
}

YEARS = list(range(2014, 2026))  # 2014–2025


class KildeFeil(SystemExit):
    """Nedlasting eller validering av kildefil feilet."""


def _get(url: str, timeout: int = 300) -> requests.Response:
    resp = _request_med_retry("GET", url, timeout=timeout)
    if resp.status_code != 200:
        raise KildeFeil(
            f"\nFEIL: HTTP {resp.status_code} fra {url}\n{resp.text[:300]}"
        )
    return resp


def _validate_not_html(content: bytes, url: str) -> None:
    """Feil høyt hvis serveren returnerte en HTML-side i stedet for data."""
    head = content[:512].lstrip().lower()
    if head.startswith(b"<!doctype") or head.startswith(b"<html"):
        raise KildeFeil(
            f"\nFEIL: {url} returnerte HTML i stedet for data.\n"
            "URL-mønsteret er sannsynligvis feil eller filen finnes ikke.\n"
            "Ingen fallback – rett opp URL-en i download.py."
        )


def _download_zip_extract(url: str, dest_dir: Path, force: bool = False) -> list[Path]:
    """Last ned en ZIP og pakk ut CSV-innholdet til dest_dir. Returner utpakkede filer."""
    if dest_dir.exists() and not force:
        existing = sorted(dest_dir.glob("*"))
        if existing:
            logger.info(f"  CACHE HIT: {dest_dir.name}/ ({len(existing)} filer)")
            return existing

    logger.info(f"  GET {url}")
    resp = _get(url)
    _validate_not_html(resp.content, url)

    try:
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
    except zipfile.BadZipFile as e:
        raise KildeFeil(
            f"\nFEIL: {url} er ikke en gyldig ZIP-fil "
            f"({len(resp.content)} bytes, starter med {resp.content[:40]!r})"
        ) from e

    dest_dir.mkdir(parents=True, exist_ok=True)
    extracted = []
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        target = dest_dir / Path(name).name
        target.write_bytes(zf.read(name))
        extracted.append(target)
        logger.info(f"  -> {target.relative_to(RAW_DIR)} ({target.stat().st_size // 1024} KB)")

    if not extracted:
        raise KildeFeil(f"\nFEIL: ZIP fra {url} var tom.")
    return extracted


def download_regnskap(year: int, force: bool = False) -> list[Path]:
    """Last ned regnskaps-ZIP for et år og pakk ut. Returnerer CSV-filstier."""
    url = f"{BASE_URL}/nedlasting/statsregnskapet_aar_{year}.zip"
    dest_dir = RAW_DIR / f"regnskap_{year}"
    return _download_zip_extract(url, dest_dir, force=force)


def download_bevilgning(force: bool = False) -> list[Path]:
    """Last ned bevilgningshistorikk-ZIP (alle år) og pakk ut."""
    url = f"{BASE_URL}/nedlasting/bevilgninger_full_historikk.zip"
    dest_dir = RAW_DIR / "bevilgninger"
    return _download_zip_extract(url, dest_dir, force=force)


def download_kolonnebeskrivelser(force: bool = False) -> dict:
    """Last ned kolonnebeskrivelsene (for dokumentasjon/validering)."""
    files = {}
    for name in ["statsregnskapet_beskrivelse_av_kolonner.csv",
                 "bevilgninger_beskrivelse_av_kolonner.csv"]:
        dest = RAW_DIR / name
        if dest.exists() and not force:
            files[name] = dest
            continue
        url = f"{BASE_URL}/nedlasting/{name}"
        logger.info(f"  GET {url}")
        resp = _get(url)
        _validate_not_html(resp.content, url)
        dest.write_bytes(resp.content)
        files[name] = dest
    return files


def _build_ssb_query(metadata: dict) -> dict:
    """
    Bygg en gyldig PX-API-spørring fra tabellens metadata.
    Strategi: Region=0 (hele landet), Tid=alle, ContentsCode=Personer*.
    Variabler med elimination=true utelates (summeres automatisk av API-et).
    Variabler med elimination=false og ikke i listen over: velg første verdi.
    """
    query = []
    for var in metadata["variables"]:
        code = var["code"]
        if code == "Region":
            if "0" not in var["values"]:
                raise KildeFeil("FEIL: SSB tabell 07459 mangler Region='0' (hele landet).")
            query.append({"code": "Region", "selection": {"filter": "item", "values": ["0"]}})
        elif code == "Tid":
            query.append({"code": "Tid", "selection": {"filter": "all", "values": ["*"]}})
        elif code == "ContentsCode":
            personer = [v for v, t in zip(var["values"], var["valueTexts"])
                        if "person" in t.lower()]
            valgt = personer[0] if personer else var["values"][0]
            query.append({"code": "ContentsCode", "selection": {"filter": "item", "values": [valgt]}})
        elif var.get("elimination", False):
            continue  # API-et aggregerer bort denne dimensjonen
        else:
            # Ikke-eliminerbar dimensjon vi ikke kjenner: ta første verdi og logg
            logger.warning(
                f"  [ADVARSEL] SSB-variabel '{code}' kan ikke elimineres – "
                f"velger første verdi '{var['values'][0]}' ({var['valueTexts'][0]})"
            )
            query.append({"code": code, "selection": {"filter": "item", "values": [var["values"][0]]}})
    return {"query": query, "response": {"format": "json-stat2"}}


def _hint_treff(vals, txts, hint):
    """Returner første verdikode der teksten inneholder hint, ellers None."""
    for v, t in zip(vals, txts):
        if hint.lower() in (t or "").lower():
            return v
    return None


def _download_ssb_v2(tabell_id: str, dest: Path, *,
                     contents_hint=None, var_hints=None) -> Path:
    """
    Hent en SSB-serie via det nye PxWebApi 2.0 (v2-beta).
    Metadata og data returneres som json-stat2. Vi leser dimensjonene fra
    metadataen, bygger valueCodes (Tid=* + hint-matchede verdier), og henter
    data. Skriver json-stat2 til dest — samme format parse_ssb_aarsserie leser.
    """
    base = f"https://data.ssb.no/api/pxwebapi/v2-beta/tables/{tabell_id}"
    logger.info(f"  GET {base}/metadata (v2)")
    meta = _request_med_retry(
        "GET", f"{base}/metadata",
        params={"lang": "no", "outputFormat": "json-stat2"}, timeout=60)
    if meta.status_code != 200:
        raise KildeFeil(f"\nFEIL: HTTP {meta.status_code} fra v2-metadata for {tabell_id}")
    md = meta.json()

    dims = md.get("dimension", {})
    ids = md.get("id") or list(dims.keys())
    roles = (md.get("role") or {})
    tid_koder = set(roles.get("time", [])) | {"Tid"}
    metric_koder = set(roles.get("metric", [])) | {"ContentsCode"}

    params = {"lang": "no", "outputFormat": "json-stat2"}
    for code in ids:
        cat = dims.get(code, {}).get("category", {})
        index = cat.get("index") or {}
        koder = list(index.keys()) if isinstance(index, dict) else list(index)
        labels = cat.get("label") or {}
        txts = [labels.get(k, "") for k in koder]

        if code in tid_koder:
            params[f"valueCodes[{code}]"] = "*"
            continue
        hint = (contents_hint if code in metric_koder else (var_hints or {}).get(code))
        valgt = (_hint_treff(koder, txts, hint) if hint else None) or (koder[0] if koder else None)
        if valgt is not None:
            params[f"valueCodes[{code}]"] = valgt
            logger.info(f"    {code}: '{valgt}'" + (f" (hint '{hint}')" if hint else ""))

    logger.info(f"  GET {base}/data (v2)")
    resp = _request_med_retry("GET", f"{base}/data", params=params, timeout=120)
    if resp.status_code != 200:
        raise KildeFeil(
            f"\nFEIL: HTTP {resp.status_code} fra v2-data for {tabell_id}.\n"
            f"Params: {params}\nSvar: {resp.text[:300]}"
        )
    _validate_not_html(resp.content, f"{base}/data")
    dest.write_bytes(resp.content)
    logger.info(f"  -> {dest.name} (v2)")
    return dest


def _download_ssb_tabell(tabell_id: str, dest: Path, *,
                         contents_hint: str = None,
                         var_hints: dict = None,
                         force: bool = False) -> Path:
    """
    Generisk SSB-nedlaster. Prøver det gamle v0-APIet først, og faller tilbake
    på det nye v2-beta-APIet (SSB migrerer mellom dem). Bygger spørring fra
    tabellens metadata:
    - Tid: alle verdier
    - ContentsCode: verdi hvis tekst matcher contents_hint, ellers første
    - Andre variabler: verdi hvis tekst matcher var_hints[kode], ellers
      utelatt (elimination=true) eller første verdi
    Kaster KildeFeil hvis begge API-versjoner feiler.
    """
    if dest.exists() and not force:
        logger.info(f"  CACHE HIT: {dest.name}")
        return dest

    try:
        return _download_ssb_v0(tabell_id, dest,
                                contents_hint=contents_hint, var_hints=var_hints)
    except KildeFeil as e_v0:
        logger.warning(f"  v0-API feilet for {tabell_id} — prøver v2-beta")
        try:
            return _download_ssb_v2(tabell_id, dest,
                                    contents_hint=contents_hint, var_hints=var_hints)
        except KildeFeil as e_v2:
            raise KildeFeil(
                f"\nFEIL: Både v0 og v2 feilet for tabell {tabell_id}.\n"
                f"--- v0 ---{e_v0}\n--- v2 ---{e_v2}"
            )


def _download_ssb_v0(tabell_id: str, dest: Path, *,
                     contents_hint: str = None,
                     var_hints: dict = None) -> Path:
    """Hent en SSB-serie via det klassiske v0-APIet (GET metadata + POST query)."""
    url = f"https://data.ssb.no/api/v0/no/table/{tabell_id}"
    logger.info(f"  GET {url} (metadata)")
    metadata = _get(url, timeout=60).json()

    query = []
    for var in metadata["variables"]:
        code = var["code"]
        if code == "Tid":
            query.append({"code": "Tid", "selection": {"filter": "all", "values": ["*"]}})
            continue
        hint = (contents_hint if code == "ContentsCode"
                else (var_hints or {}).get(code))
        if hint:
            treff = [v for v, t in zip(var["values"], var["valueTexts"])
                     if hint.lower() in t.lower()]
            valgt = treff[0] if treff else var["values"][0]
            query.append({"code": code, "selection": {"filter": "item", "values": [valgt]}})
            logger.info(f"    {code}: '{valgt}' (hint: '{hint}', treff: {len(treff)})")
        elif var.get("elimination", False):
            continue
        else:
            query.append({"code": code, "selection": {"filter": "item", "values": [var["values"][0]]}})
            logger.info(f"    {code}: første verdi '{var['values'][0]}' ({var['valueTexts'][0]})")

    payload = {"query": query, "response": {"format": "json-stat2"}}
    logger.info(f"  POST {url}")
    resp = _request_med_retry("POST", url, json=payload,
                              headers={**HEADERS, "Content-Type": "application/json"},
                              timeout=120)
    if resp.status_code != 200:
        variabler = [
            f"{v['code']} (elim={v.get('elimination')}): {v['valueTexts'][:5]}"
            for v in metadata["variables"]
        ]
        raise KildeFeil(
            f"\nFEIL: HTTP {resp.status_code} fra SSB tabell {tabell_id}.\n"
            f"Spørring: {json.dumps(payload, ensure_ascii=False)}\n"
            f"Tilgjengelige variabler:\n  " + "\n  ".join(variabler) + "\n"
            f"Svar: {resp.text[:400]}"
        )

    dest.write_bytes(resp.content)
    logger.info(f"  -> {dest.name}")
    return dest


def download_kpi(force: bool = False) -> Path:
    """
    KPI totalindeks per år. Prøver årsgjennomsnitt-tabellen først,
    faller tilbake på månedstabellen 03013 (parseren snitter månedene).
    """
    dest = _cache_json("ssb_kpi.json")
    feil = []
    for tabell in ["08981", "03013"]:
        try:
            return _download_ssb_tabell(
                tabell, dest,
                contents_hint="konsumprisindeks",
                var_hints={"Konsumgrp": "totalindeks", "VareTjenestegruppe": "totalindeks"},
                force=force,
            )
        except KildeFeil as e:
            feil.append(f"tabell {tabell}: {e}")
            logger.warning(f"  KPI-tabell {tabell} feilet — prøver neste")
    raise KildeFeil("\nFEIL: Ingen KPI-tabell fungerte:\n" + "\n---\n".join(feil))


def download_bnp(force: bool = False) -> Path:
    """BNP i løpende priser per år (nasjonalregnskapet, tabell 09189)."""
    return _download_ssb_tabell(
        "09189", _cache_json("ssb_bnp.json"),
        contents_hint="løpende priser",
        var_hints={"Makrost": "bruttonasjonalprodukt"},
        force=force,
    )


def _cache_json(name: str) -> Path:
    return RAW_DIR / name


def download_befolkning(force: bool = False) -> Path:
    """Hent folkemengde per år fra SSB (tabell 07459), metadata-drevet spørring."""
    dest = RAW_DIR / "ssb_befolkning.json"
    if dest.exists() and not force:
        logger.info(f"  CACHE HIT: {dest.name}")
        return dest

    logger.info(f"  GET {SSB_TABLE_URL} (metadata)")
    metadata = _get(SSB_TABLE_URL, timeout=60).json()
    payload = _build_ssb_query(metadata)

    logger.info(f"  POST {SSB_TABLE_URL}")
    resp = _request_med_retry(
        "POST", SSB_TABLE_URL, json=payload,
        headers={"Content-Type": "application/json"}, timeout=120,
    )
    if resp.status_code != 200:
        raise KildeFeil(
            f"\nFEIL: HTTP {resp.status_code} fra SSB API.\n"
            f"Spørring: {json.dumps(payload, ensure_ascii=False)}\n"
            f"Svar: {resp.text[:500]}"
        )

    dest.write_bytes(resp.content)
    logger.info(f"  -> {dest.name}")
    return dest


def download_all(years=None, force: bool = False) -> dict:
    """Last ned alle kildefiler. Returnerer {nøkkel: Path eller [Path]}."""
    if years is None:
        years = YEARS

    files = {}

    logger.info("--- Laster ned kolonnebeskrivelser ---")
    files["beskrivelser"] = download_kolonnebeskrivelser(force=force)

    logger.info("--- Laster ned regnskapsdata ---")
    for year in years:
        try:
            files[f"regnskap_{year}"] = download_regnskap(year, force=force)
        except KildeFeil as e:
            # Manglende fremtidige/pågående år er OK – logg og fortsett
            if year >= max(years) - 1:
                logger.warning(f"  Hopper over {year}: {e}")
            else:
                raise

    logger.info("--- Laster ned bevilgningshistorikk ---")
    files["bevilgning"] = download_bevilgning(force=force)

    logger.info("--- Laster ned befolkning fra SSB ---")
    files["befolkning"] = download_befolkning(force=force)

    return files


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--years", nargs="+", type=int, default=YEARS)
    args = parser.parse_args()

    download_all(years=args.years, force=args.force)
