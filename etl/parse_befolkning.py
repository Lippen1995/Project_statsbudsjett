"""
Parser for SSB befolkningsdata (JSON-stat2 format).
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_ssb_aarsserie(path: Path, navn: str = "SSB-serie") -> dict:
    """
    Les en SSB JSON-stat2-fil og returner {år: verdi}.
    Håndterer både årlige Tid-labels ("2023") og månedlige ("2023M01" —
    månedsverdiene snittes til årsgjennomsnitt, brukt for KPI).
    """
    logger.info(f"  Parser {navn}: {path.name}")
    data = json.loads(path.read_text(encoding="utf-8"))

    try:
        tid = data["dimension"]["Tid"]["category"]["index"]
        values = data["value"]
    except KeyError as e:
        raise ValueError(
            f"Uventet JSON-stat2-format i {path.name}: mangler {e}"
        ) from e

    summer, antall = {}, {}
    for label, idx in tid.items():
        aar_str = label.split("M")[0].split("K")[0]
        try:
            aar = int(aar_str)
        except ValueError:
            continue
        v = values[idx]
        if v is None:
            continue
        summer[aar] = summer.get(aar, 0.0) + float(v)
        antall[aar] = antall.get(aar, 0) + 1

    if not summer:
        raise ValueError(f"Ingen verdier funnet i {path.name}")

    result = {aar: summer[aar] / antall[aar] for aar in summer}
    logger.info(f"  -> {len(result)} år: {min(result)}–{max(result)}")
    return result


def parse_befolkning(path: Path) -> dict:
    """
    Les SSB JSON-stat2 fil og returner {år_int: folkemengde_int}.
    """
    logger.info(f"  Parser befolkning: {path.name}")
    data = json.loads(path.read_text(encoding="utf-8"))

    try:
        tid_dim = data["dimension"]["Tid"]
        labels = tid_dim["category"]["label"]  # {"2014": "2014", ...}
        index = tid_dim["category"]["index"]   # {"2014": 0, "2015": 1, ...}
        values = data["value"]
    except KeyError as e:
        raise ValueError(
            f"Uventet JSON-stat2-format i {path.name}: mangler nøkkel {e}\n"
            "Sjekk at SSB API returnerer forventet format og oppdater parse_befolkning.py."
        ) from e

    result = {}
    for tid_label, idx in index.items():
        try:
            year = int(tid_label)
        except ValueError:
            continue
        v = values[idx]
        if v is not None:
            result[year] = int(v)

    if not result:
        raise ValueError(f"Ingen befolkningstall funnet i {path.name}")

    logger.info(f"  -> {len(result)} år: {min(result)}-{max(result)}, siste: {result[max(result)]:,}")
    return result
