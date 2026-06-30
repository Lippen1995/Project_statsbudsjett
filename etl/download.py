"""
Download og caching av råfiler fra DFØ Statsregnskapet og SSB.
Feiler høyt hvis en kilde ikke kan nås — ingen fallback til mock-data.
"""
import os
import sys
import time
import logging
import hashlib
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

RAW_DIR = Path(__file__).parent / "raw"
RAW_DIR.mkdir(exist_ok=True)

BASE_URL = "https://statsregnskapet.dfo.no"
SSB_API = "https://data.ssb.no/api/v0/no/table/07459"

HEADERS = {
    "User-Agent": "statsbudsjett-visualisering/1.0 (open source; github.com)",
    "Accept": "text/csv,application/json,*/*",
}

YEARS = list(range(2014, 2026))  # 2014–2025


def _cache_path(name: str) -> Path:
    return RAW_DIR / name


def _download(url: str, dest: Path, force: bool = False) -> Path:
    if dest.exists() and not force:
        logger.info(f"  CACHE HIT: {dest.name}")
        return dest

    logger.info(f"  GET {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=120, stream=True)
        resp.raise_for_status()
    except requests.exceptions.ConnectionError as e:
        raise SystemExit(
            f"\nFEIL: Kan ikke koble til {url}\n"
            f"  {e}\n"
            "ETL krever nettverkstilgang til statsregnskapet.dfo.no og data.ssb.no.\n"
            "Sjekk at du kjører dette utenfor et begrenset nettverk."
        ) from e
    except requests.exceptions.HTTPError as e:
        raise SystemExit(
            f"\nFEIL: HTTP {resp.status_code} fra {url}\n{e}"
        ) from e

    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)

    size_kb = dest.stat().st_size // 1024
    logger.info(f"  -> {dest.name} ({size_kb} KB)")
    return dest


def download_regnskap(year: int, force: bool = False) -> Path:
    """Last ned regnskapsdata for et gitt år."""
    filename = f"regnskapsdata_{year}.csv"
    url = f"{BASE_URL}/last-ned?filnavn={filename}"
    dest = _cache_path(filename)
    return _download(url, dest, force=force)


def download_bevilgning(force: bool = False) -> Path:
    """Last ned bevilgningshistorikk (alle år, én fil)."""
    filename = "bevilgningshistorikk.csv"
    url = f"{BASE_URL}/last-ned?filnavn={filename}"
    dest = _cache_path(filename)
    return _download(url, dest, force=force)


def download_befolkning(force: bool = False) -> Path:
    """Hent folkemengde per år fra SSB (tabell 07459)."""
    dest = _cache_path("ssb_befolkning.json")
    if dest.exists() and not force:
        logger.info(f"  CACHE HIT: {dest.name}")
        return dest

    payload = {
        "query": [
            {"code": "Region", "selection": {"filter": "item", "values": ["0"]}},
            {"code": "Kjonn", "selection": {"filter": "item", "values": ["0"]}},
            {"code": "Alder", "selection": {"filter": "item", "values": ["000"]}},
            {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}},
        ],
        "response": {"format": "json-stat2"},
    }

    logger.info(f"  POST {SSB_API}")
    try:
        resp = requests.post(
            SSB_API, json=payload, headers={**HEADERS, "Content-Type": "application/json"},
            timeout=60
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError as e:
        raise SystemExit(
            f"\nFEIL: Kan ikke koble til SSB API ({SSB_API})\n{e}\n"
            "ETL krever nettverkstilgang til data.ssb.no."
        ) from e
    except requests.exceptions.HTTPError as e:
        raise SystemExit(f"\nFEIL: HTTP {resp.status_code} fra SSB API\n{e}") from e

    dest.write_bytes(resp.content)
    logger.info(f"  -> {dest.name}")
    return dest


def inspect_file(path: Path, n_rows: int = 5) -> None:
    """Skriv ut de første n radene av en fil – brukes for skjema-verifisering."""
    import chardet

    raw = path.read_bytes()[:4096]
    detected = chardet.detect(raw)
    encoding = detected.get("encoding", "utf-8") or "utf-8"

    print(f"\n=== {path.name} ===")
    print(f"Encoding (detektert): {encoding} (confidence={detected.get('confidence'):.0%})")
    print(f"Størrelse: {path.stat().st_size // 1024} KB")

    with open(path, encoding=encoding, errors="replace") as f:
        for i, line in enumerate(f):
            print(line.rstrip())
            if i >= n_rows:
                break


def download_all(years=None, force: bool = False, inspect: bool = False) -> dict:
    """Last ned alle kildefiler. Returnerer {navn: Path}."""
    if years is None:
        years = YEARS

    files = {}

    logger.info("--- Laster ned regnskapsdata ---")
    for year in years:
        try:
            p = download_regnskap(year, force=force)
            files[f"regnskap_{year}"] = p
            if inspect:
                inspect_file(p)
        except SystemExit as e:
            # Manglende fremtidige år er OK – logg og fortsett
            if year >= 2025:
                logger.warning(f"  Hopper over {year}: {e}")
            else:
                raise

    logger.info("--- Laster ned bevilgningshistorikk ---")
    files["bevilgning"] = download_bevilgning(force=force)
    if inspect:
        inspect_file(files["bevilgning"])

    logger.info("--- Laster ned befolkning fra SSB ---")
    files["befolkning"] = download_befolkning(force=force)
    if inspect:
        inspect_file(files["befolkning"])

    return files


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Tving re-nedlasting")
    parser.add_argument("--inspect", action="store_true", help="Skriv ut topplinjer av filene")
    parser.add_argument("--years", nargs="+", type=int, default=YEARS)
    args = parser.parse_args()

    download_all(years=args.years, force=args.force, inspect=args.inspect)
