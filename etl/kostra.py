#!/usr/bin/env python3
"""KOSTRA-import og eksport til Fellestalls statiske data-interface.

SQLite er den normaliserte lokale modellen. Nettleseren leser bare de
forhåndsberegnede JSON-filene under ``web/public/data/kostra``.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import re
import sqlite3
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree

import requests


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).with_name("kostra_schema.sql")
DEFAULT_DB = Path(__file__).parent / "raw" / "kostra.sqlite"
DEFAULT_OUTPUT = ROOT / "web" / "public" / "data"
RAW_KOSTRA = Path(__file__).parent / "raw" / "kostra"
SSB_API = "https://data.ssb.no/api/pxwebapi/v2"
KLASS_API = "https://data.ssb.no/api/klass/v1"

TABLES = {
    "municipality": {
        "overview": "12137", "service": "12362", "detail": "12367",
        "region": "KOKkommuneregion0000", "scope": "KOKregnskapsomfa0000",
    },
    "county": {
        "overview": "12366", "service": "12163", "detail": "12368",
        "region": "KOKfylkesregion0000", "scope": "KOKregnskapsomfa0000",
    },
}

GEODATA = {
    "municipality": {
        "feed": "https://nedlasting.geonorge.no/geonorge/ATOM-feeds/AdministrativeEnheterKommuner_AtomFeedGeoJSON.xml",
        "token": "Kommuner", "object": "Kommune", "code": "kommunenummer", "name": "kommunenavn",
    },
    "county": {
        "feed": "https://nedlasting.geonorge.no/geonorge/ATOM-feeds/AdministrativeEnheterFylker_AtomFeedGEOJSON.xml",
        "token": "Fylker", "object": "Fylke", "code": "fylkesnummer", "name": "fylkesnavn",
    },
}

METRICS = [
    {"id": "revenues", "label": "Driftsinntekter", "code": "AGD13", "polarity": "high"},
    {"id": "expenses", "label": "Driftsutgifter", "code": "AGD9", "polarity": "neutral"},
    {"id": "net_result", "label": "Netto driftsresultat", "code": "AGD23", "polarity": "high"},
    {"id": "debt", "label": "Netto lånegjeld", "code": "KG31", "polarity": "low"},
    {"id": "investments", "label": "Investeringsutgifter", "code": "AGI1", "polarity": "neutral"},
    {"id": "net_expenses", "label": "Netto driftsutgifter", "code": "AGD1", "polarity": "neutral"},
]

SERVICE_METRICS = {
    "AGD10": "gross_expenses",
    "AGD2": "net_expenses",
    "AGI5": "investments",
}

EXPENSE_ARTS = {"AG16", "AGD50", "AGD51", "AG34", "AGD43"}
# Gjensidig utelukkende hovedgrupper. AGD54/AGD56 er undergrupper av AGD49
# og tas derfor ikke med i samme fordeling (ellers dobbelttelles inntektene).
REVENUE_ARTS = {"A600", "AGD34", "AG48", "AGD49", "AGD28"}

MUNICIPAL_SERVICE_FUNCTIONS = {
    "FGK1a": {"100", "110"},
    "FGK1b": {"120", "121", "130", "190"},
    "FGK1c": {"170", "171", "172", "173", "180", "285", "290"},
    "FGK2": {"231", "365", "370", "373", "375", "377", "380", "381", "383", "385", "386"},
    "FGK3": {"301", "302", "303", "304", "305", "315", "335", "360"},
    "FGK4": {"320", "321", "322", "325", "329"},
    "FGK5": {"330", "332"},
    "FGK6a": {"121", "130", "221", "222", "261", "381", "386"},
    "FGK7": {"201", "211", "221"},
    "FGK8b": {"202", "213", "215", "222", "223"},
    "FGK9": {"232", "233", "234", "241", "253", "254", "256", "257", "258", "261"},
    "FGK12": {"242", "243", "265", "273", "275", "276", "281", "283"},
    "FGK13": {"244", "251", "252"},
    "FGK14": {"340", "345", "350", "353", "354", "355"},
    "FGK15": {"390", "392", "393"},
    "FGK16": {"265"},
    "FGK17": {"338", "339"},
}

COUNTY_SERVICE_FUNCTIONS = {
    "FGF1a": {"400", "410"},
    "FGF1b": {"420", "421", "430", "490"},
    "FGF1c": {"460", "465", "470", "471", "472", "473", "480"},
    "FGF2": {"713", "714", "715", "716"},
    "FGF3": {"740", "750", "760", "771", "772", "775", "790"},
    "FGF4": {"722", "730", "731", "732", "733", "734", "735"},
    "FGF5": {"701", "710", "711", "714", "715"},
    "FGF6a": {"421", "430", "510", "511", "553"},
    "FGF7": {str(code) for code in range(510, 600)},
    "FGF8": {"660", "665"},
}


def _service_codes(kind: str, function_code: str) -> list[str]:
    mapping = MUNICIPAL_SERVICE_FUNCTIONS if kind == "municipality" else COUNTY_SERVICE_FUNCTIONS
    return [service for service, functions in mapping.items() if function_code in functions]


def _ordered_codes(dimension: dict) -> list[str]:
    """Returner kategorikoder i JSON-stat-rekkefølge."""
    index = dimension.get("category", {}).get("index", {})
    if isinstance(index, list):
        return index
    return [code for code, _ in sorted(index.items(), key=lambda item: item[1])]


def iter_jsonstat(dataset: dict) -> Iterable[dict]:
    """Gjør en JSON-stat2-kube om til rader, i dokumentert row-major orden."""
    dimensions = dataset["id"]
    codes = [_ordered_codes(dataset["dimension"][dim]) for dim in dimensions]
    values = dataset.get("value", [])
    statuses = dataset.get("status") or []
    for offset, combination in enumerate(itertools.product(*codes)):
        row = dict(zip(dimensions, combination))
        row["value"] = values[offset] if offset < len(values) else None
        if isinstance(statuses, dict):
            row["status"] = statuses.get(str(offset), statuses.get(offset))
        else:
            row["status"] = statuses[offset] if offset < len(statuses) else None
        yield row


def _validity(label: str) -> tuple[int | None, int | None]:
    period = re.search(r"\((\d{4})-(\d{4})\)", label)
    if period:
        return int(period.group(1)), int(period.group(2))
    until = re.search(r"\(-\s*(\d{4})\)", label)
    if until:
        return None, int(until.group(1))
    since = re.search(r"\((\d{4})-\)", label)
    if since:
        return int(since.group(1)), None
    return None, None


def entity_from_region(code: str, label: str, default_kind: str, latest_year: int) -> dict:
    """Normaliser SSB-regionkoder uten å slå sammen ulike historiske enheter."""
    valid_from, valid_to = _validity(label)
    if code.startswith("EKG"):
        kind, entity_id = "peer_group", f"peer_group:{code}"
        valid_from = valid_from or 2020
    elif code.startswith(("EAK", "EAFK")):
        kind, entity_id = "country", f"country:{code}"
    elif default_kind == "county":
        kind, entity_id = "county", f"county:{code[:2]}"
    else:
        kind, entity_id = "municipality", f"municipality:{code}"
    return {
        "id": entity_id,
        "code": code,
        "name": re.sub(r"\s*\((?:\d{4})?-(?:\d{4})?\)\s*$", "", label).strip(),
        "kind": kind,
        "parent_id": f"county:{code[:2]}" if kind == "municipality" else None,
        "peer_group_id": None,
        "active": valid_to is None or valid_to >= latest_year,
        "valid_from": valid_from,
        "valid_to": valid_to,
        "source_label": label,
    }


def create_database(path: Path | str) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return connection


class SsbClient:
    """Liten cachet adapter for SSB PxWebApi 2 og Klass."""

    def __init__(self, cache_dir: Path = RAW_KOSTRA, force: bool = False):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.force = force
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Fellestall-KOSTRA/1.0 (https://fellestall.no)"})

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        for attempt in range(5):
            response = self.session.request(method, url, timeout=180, **kwargs)
            if response.status_code not in {429, 500, 502, 503, 504}:
                response.raise_for_status()
                return response
            if attempt == 4:
                response.raise_for_status()
            time.sleep(min(2 ** attempt, 12))
        raise RuntimeError("Uoppnåelig retry-tilstand")

    def json(self, url: str, cache_name: str) -> dict:
        path = self.cache_dir / cache_name
        if path.exists() and not self.force:
            return json.loads(path.read_text(encoding="utf-8"))
        data = self._request("GET", url).json()
        _write_json(path, data)
        return data

    def metadata(self, table: str) -> dict:
        return self.json(f"{SSB_API}/tables/{table}/metadata?lang=no", f"{table}-metadata.json")

    def data(self, table: str, selection: dict[str, list[str]]) -> dict:
        normalized = {key: list(values) for key, values in selection.items()}
        digest = hashlib.sha1(
            json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()[:12]
        path = self.cache_dir / f"{table}-{digest}.json"
        if path.exists() and not self.force:
            return json.loads(path.read_text(encoding="utf-8"))
        body = {
            "selection": [
                {"variableCode": code, "valueCodes": values}
                for code, values in normalized.items()
            ]
        }
        response = self._request(
            "POST",
            f"{SSB_API}/tables/{table}/data?lang=no&outputFormat=json-stat2",
            json=body,
        )
        data = response.json()
        _write_json(path, data)
        return data


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _classification_labels(db: sqlite3.Connection, dimension: str) -> dict[str, str]:
    return {
        row["code"]: row["label"]
        for row in db.execute("SELECT code, label FROM classification WHERE dimension=?", (dimension,))
    }


def _series(rows: Iterable[sqlite3.Row]) -> dict[str, dict]:
    result = {}
    for row in rows:
        result[str(row["year"])] = {"amount": row["amount"], "perCapita": row["per_capita"]}
    return result


def _entity_detail(db: sqlite3.Connection, entity: dict, latest_year: int) -> dict:
    function_labels = _classification_labels(db, "function")
    art_labels = _classification_labels(db, "accounting_art")

    overview = {}
    for metric in METRICS:
        rows = db.execute(
            """SELECT year, amount, per_capita FROM fact
               WHERE entity_id=? AND metric_code=? AND function_code='' AND accounting_art_code=''
               ORDER BY year""",
            (entity["id"], metric["code"]),
        )
        overview[metric["id"]] = _series(rows)

    service_rows = db.execute(
        """SELECT function_code, metric_code, year, amount, per_capita FROM fact
           WHERE entity_id=? AND function_code LIKE 'FG%' AND accounting_art_code=''
           ORDER BY function_code, year""",
        (entity["id"],),
    ).fetchall()
    services = {}
    for row in service_rows:
        service = services.setdefault(row["function_code"], {
            "code": row["function_code"],
            "name": function_labels.get(row["function_code"], row["function_code"]),
            "metrics": defaultdict(dict),
        })
        metric_id = SERVICE_METRICS.get(row["metric_code"], row["metric_code"])
        service["metrics"][metric_id][str(row["year"])] = {
            "amount": row["amount"], "perCapita": row["per_capita"]
        }

    function_rows = db.execute(
        """SELECT function_code, metric_code, year, amount, per_capita FROM fact
           WHERE entity_id=? AND function_code GLOB '[0-9][0-9][0-9]' AND accounting_art_code=''
           ORDER BY function_code, year""",
        (entity["id"],),
    ).fetchall()
    functions = {}
    for row in function_rows:
        function = functions.setdefault(row["function_code"], {
            "code": row["function_code"],
            "name": function_labels.get(row["function_code"], row["function_code"]),
            "serviceCodes": _service_codes(entity["kind"], row["function_code"]),
            "metrics": defaultdict(dict),
        })
        metric_id = SERVICE_METRICS.get(row["metric_code"], row["metric_code"])
        function["metrics"][metric_id][str(row["year"])] = {
            "amount": row["amount"], "perCapita": row["per_capita"]
        }

    art_rows = db.execute(
        """SELECT function_code, accounting_art_code, amount FROM fact
           WHERE entity_id=? AND year=? AND accounting_art_code<>'' AND amount IS NOT NULL
           ORDER BY function_code, accounting_art_code""",
        (entity["id"], latest_year),
    ).fetchall()
    arts_by_function = defaultdict(list)
    expense_breakdown = defaultdict(float)
    revenue_breakdown = defaultdict(float)
    for row in art_rows:
        art = {
            "code": row["accounting_art_code"],
            "name": art_labels.get(row["accounting_art_code"], row["accounting_art_code"]),
            "amount": row["amount"],
        }
        arts_by_function[row["function_code"]].append(art)
        if row["function_code"].isdigit():
            if row["accounting_art_code"] in EXPENSE_ARTS:
                expense_breakdown[row["accounting_art_code"]] += row["amount"]
            if row["accounting_art_code"] in REVENUE_ARTS:
                revenue_breakdown[row["accounting_art_code"]] += row["amount"]

    def breakdown(values):
        return [
            {"code": code, "name": art_labels.get(code, code), "amount": amount}
            for code, amount in sorted(values.items(), key=lambda item: abs(item[1]), reverse=True)
        ]

    return {
        "schemaVersion": 1,
        "entity": entity,
        "latestYear": latest_year,
        "overview": overview,
        "revenueBreakdown": breakdown(revenue_breakdown),
        "expenseBreakdown": breakdown(expense_breakdown),
        "services": list(services.values()),
        "functions": list(functions.values()),
        "accountingArts": arts_by_function,
        "comparisons": {
            "norwayEntityId": "country:EAK" if entity["kind"] == "municipality" else "country:EAFK",
            "peerGroupEntityId": entity.get("peer_group_id"),
        },
    }


def write_frontend_data(db: sqlite3.Connection, output_dir: Path | str, boundaries: dict) -> None:
    """Eksporter kartindeks og lazy-lastede detaljfiler fra SQLite-modellen."""
    output = Path(output_dir) / "kostra"
    output.mkdir(parents=True, exist_ok=True)
    entity_rows = db.execute(
        """SELECT * FROM entity WHERE active=1
           ORDER BY CASE kind WHEN 'county' THEN 0 WHEN 'municipality' THEN 1 ELSE 2 END, name"""
    ).fetchall()
    entities = [dict(row) for row in entity_rows]
    years = [row[0] for row in db.execute("SELECT DISTINCT year FROM fact ORDER BY year")]
    latest_year = max(years) if years else datetime.now().year - 1

    service_metrics = [
        {
            "id": f"service_{row['code']}",
            "label": row["label"],
            "code": "AGD2",
            "functionCode": row["code"],
            "polarity": "neutral",
            "category": "service",
        }
        for row in db.execute(
            "SELECT code, label FROM classification WHERE dimension='function' AND kind='service_area' ORDER BY label"
        )
    ]
    all_metrics = [{**metric, "category": "finance"} for metric in METRICS] + service_metrics
    values = {metric["id"]: {} for metric in all_metrics}
    for metric in all_metrics:
        function_code = metric.get("functionCode", "")
        rows = db.execute(
            """SELECT entity_id, year, amount, per_capita FROM fact
               WHERE metric_code=? AND function_code=? AND accounting_art_code=''""",
            (metric["code"], function_code),
        )
        for row in rows:
            values[metric["id"]].setdefault(str(row["year"]), {})[row["entity_id"]] = {
                "amount": row["amount"], "perCapita": row["per_capita"]
            }

    source_rows = [dict(row) for row in db.execute("SELECT * FROM source_run ORDER BY source_table")]
    index = {
        "schemaVersion": 1,
        "updated": datetime.now(timezone.utc).isoformat(),
        "latestYear": latest_year,
        "years": years,
        "metrics": all_metrics,
        "entities": entities,
        "values": values,
        "sources": source_rows,
    }
    _write_json(output / "index.json", index)
    _write_json(output / "boundaries.json", {"schemaVersion": 1, **boundaries})

    for entity in entities:
        if entity["kind"] not in {"municipality", "county"}:
            continue
        detail = _entity_detail(db, entity, latest_year)
        _write_json(output / "entities" / f"{entity['kind']}-{entity['code']}.json", detail)


def _labels(metadata: dict, dimension: str) -> dict[str, str]:
    category = metadata["dimension"][dimension]["category"]
    return category.get("label", {})


def _dimension_by_label(metadata: dict, label: str) -> str:
    for code in metadata["id"]:
        if metadata["dimension"][code].get("label", "").lower() == label.lower():
            return code
    raise KeyError(f"Fant ikke dimensjonen {label!r} i {metadata.get('id')}")


def _register_classification(db: sqlite3.Connection, metadata: dict, dimension: str, kind) -> None:
    for code, label in _labels(metadata, dimension).items():
        resolved_kind = kind(code) if callable(kind) else kind
        db.execute(
            "INSERT OR REPLACE INTO classification(dimension, code, label, kind) VALUES (?,?,?,?)",
            ("function" if "funksjon" in dimension.lower() else "accounting_art", code, label, resolved_kind),
        )


def _upsert_entity(db: sqlite3.Connection, entity: dict) -> None:
    db.execute(
        """INSERT INTO entity(id,code,name,kind,parent_id,peer_group_id,active,valid_from,valid_to,source_label)
           VALUES (:id,:code,:name,:kind,:parent_id,:peer_group_id,:active,:valid_from,:valid_to,:source_label)
           ON CONFLICT(id) DO UPDATE SET
             code=excluded.code,name=excluded.name,parent_id=COALESCE(excluded.parent_id,entity.parent_id),
             active=MAX(entity.active,excluded.active),valid_from=COALESCE(excluded.valid_from,entity.valid_from),
             valid_to=excluded.valid_to,source_label=excluded.source_label""",
        entity,
    )
    db.execute(
        "INSERT OR IGNORE INTO entity_code(entity_id,code,valid_from,valid_to,source) VALUES (?,?,?,?,?)",
        (entity["id"], entity["code"], entity["valid_from"], entity["valid_to"], "SSB Statbank"),
    )


def _upsert_fact(
    db: sqlite3.Connection,
    entity_id: str,
    year: int,
    metric_code: str,
    source_table: str,
    *,
    function_code: str = "",
    accounting_art_code: str = "",
    amount: float | None = None,
    per_capita: float | None = None,
) -> None:
    db.execute(
        """INSERT INTO fact(entity_id,year,metric_code,function_code,accounting_art_code,amount,per_capita,source_table)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(entity_id,year,metric_code,function_code,accounting_art_code,source_table)
           DO UPDATE SET amount=COALESCE(excluded.amount,fact.amount),
                         per_capita=COALESCE(excluded.per_capita,fact.per_capita)""",
        (entity_id, year, metric_code, function_code, accounting_art_code, amount, per_capita, source_table),
    )


def _entity_id(kind: str, code: str) -> str:
    if code.startswith("EKG"):
        return f"peer_group:{code}"
    if code.startswith(("EAK", "EAFK")):
        return f"country:{code}"
    return f"county:{code[:2]}" if kind == "county" else f"municipality:{code}"


def _record_source(db: sqlite3.Connection, table: str, metadata: dict) -> None:
    periods = [int(code) for code in _ordered_codes(metadata["dimension"]["Tid"]) if code.isdigit()]
    db.execute(
        "INSERT OR REPLACE INTO source_run VALUES (?,?,?,?)",
        (table, datetime.now(timezone.utc).isoformat(), metadata.get("label", table), max(periods)),
    )


def _import_overview(db: sqlite3.Connection, kind: str, table: str, metadata: dict, cube: dict) -> None:
    region_dim = TABLES[kind]["region"]
    concept_dim = _dimension_by_label(metadata, "regnskapsbegrep")
    content_labels = _labels(metadata, "ContentsCode")
    for row in iter_jsonstat(cube):
        value = row["value"]
        if value is None:
            continue
        content = content_labels.get(row["ContentsCode"], row["ContentsCode"]).lower()
        kwargs = {"per_capita": value} if "innbygger" in content else {"amount": value}
        _upsert_fact(
            db, _entity_id(kind, row[region_dim]), int(row["Tid"]), row[concept_dim], table, **kwargs
        )


def _import_services(db: sqlite3.Connection, kind: str, table: str, metadata: dict, cube: dict) -> None:
    region_dim = TABLES[kind]["region"]
    function_dim = _dimension_by_label(metadata, "funksjon")
    art_dim = _dimension_by_label(metadata, "art")
    content_labels = _labels(metadata, "ContentsCode")
    for row in iter_jsonstat(cube):
        value = row["value"]
        if value is None:
            continue
        content = content_labels.get(row["ContentsCode"], row["ContentsCode"]).lower()
        if "andel" in content:
            continue
        kwargs = {"per_capita": value} if "innbygger" in content else {"amount": value}
        _upsert_fact(
            db, _entity_id(kind, row[region_dim]), int(row["Tid"]), row[art_dim], table,
            function_code=row[function_dim], **kwargs,
        )


def _import_details(db: sqlite3.Connection, kind: str, table: str, metadata: dict, cube: dict) -> None:
    region_dim = TABLES[kind]["region"]
    function_dim = _dimension_by_label(metadata, "funksjon")
    art_dim = _dimension_by_label(metadata, "art")
    for row in iter_jsonstat(cube):
        if row["value"] is None:
            continue
        _upsert_fact(
            db, _entity_id(kind, row[region_dim]), int(row["Tid"]), "accounting_art", table,
            function_code=row[function_dim], accounting_art_code=row[art_dim], amount=row["value"],
        )


def _chunks(values: list[str], size: int = 85):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def _download_geojson(client: SsbClient, kind: str) -> dict:
    config = GEODATA[kind]
    cache = client.cache_dir / f"geonorge-{kind}.geojson"
    if cache.exists() and not client.force:
        return json.loads(cache.read_text(encoding="utf-8"))
    feed = client._request("GET", config["feed"]).content
    root = ElementTree.fromstring(feed)
    hrefs = [element.attrib.get("href", "") for element in root.iter() if element.attrib.get("href")]
    candidates = [
        href for href in hrefs
        if href.endswith(".zip") and "_0000_Norge_4258_" in href and config["token"] in href
    ]
    if not candidates:
        raise RuntimeError(f"Fant ikke landsdekkende GeoJSON i {config['feed']}")
    archive = zipfile.ZipFile(BytesIO(client._request("GET", candidates[0]).content))
    member = next(name for name in archive.namelist() if name.lower().endswith((".geojson", ".json")))
    data = json.loads(archive.read(member).decode("utf-8-sig"))
    _write_json(cache, data)
    return data


def _simplify(points: list, tolerance: float = 0.012) -> list:
    if len(points) <= 4:
        return points
    first, last = points[0], points[-1]
    dx, dy = last[0] - first[0], last[1] - first[1]
    denominator = dx * dx + dy * dy
    farthest, index = 0.0, 0
    for i, point in enumerate(points[1:-1], 1):
        if denominator == 0:
            distance = math.hypot(point[0] - first[0], point[1] - first[1])
        else:
            t = max(0, min(1, ((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / denominator))
            distance = math.hypot(point[0] - (first[0] + t * dx), point[1] - (first[1] + t * dy))
        if distance > farthest:
            farthest, index = distance, i
    if farthest <= tolerance:
        return [first, last]
    left = _simplify(points[:index + 1], tolerance)
    right = _simplify(points[index:], tolerance)
    return left[:-1] + right


def _project(lon: float, lat: float) -> tuple[float, float]:
    phi, lam = math.radians(lat), math.radians(lon)
    phi1, phi2, phi0, lam0 = map(math.radians, (55, 75, 65, 15))
    n = math.log(math.cos(phi1) / math.cos(phi2)) / math.log(
        math.tan(math.pi / 4 + phi2 / 2) / math.tan(math.pi / 4 + phi1 / 2)
    )
    factor = math.cos(phi1) * math.tan(math.pi / 4 + phi1 / 2) ** n / n
    rho = factor / math.tan(math.pi / 4 + phi / 2) ** n
    rho0 = factor / math.tan(math.pi / 4 + phi0 / 2) ** n
    return rho * math.sin(n * (lam - lam0)), rho0 - rho * math.cos(n * (lam - lam0))


def _polygon_rings(geometry: dict):
    if geometry["type"] == "Polygon":
        yield from geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield from polygon


def build_boundaries(geojson_by_kind: dict[str, dict]) -> tuple[dict, dict[str, list[dict]]]:
    """Gjør Kartverkets flater om til små, ferdigprojiserte SVG-baner."""
    extracted = {}
    all_points = []
    entities = defaultdict(list)
    for kind, data in geojson_by_kind.items():
        config = GEODATA[kind]
        extracted[kind] = []
        for feature in data["features"]:
            props = feature.get("properties", {})
            if props.get("objtype") != config["object"] or "Polygon" not in feature.get("geometry", {}).get("type", ""):
                continue
            code = str(props[config["code"]]).zfill(4 if kind == "municipality" else 2)
            name = props.get(config["name"]) or code
            rings = []
            for ring in _polygon_rings(feature["geometry"]):
                simplified = _simplify(ring)
                if len(simplified) < 4:
                    continue
                projected = [_project(point[0], point[1]) for point in simplified]
                rings.append(projected)
                all_points.extend(projected)
            extracted[kind].append((code, name, rings))
            entity = entity_from_region(
                f"{code}00" if kind == "county" else code, name, kind, datetime.now().year - 1
            )
            entity["active"] = True
            entity["valid_from"] = int(str(props.get("gyldigFra") or "")[:4]) if props.get("gyldigFra") else None
            entities[kind].append(entity)

    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    width, height, padding = 720, 980, 18
    scale = min((width - padding * 2) / (max_x - min_x), (height - padding * 2) / (max_y - min_y))

    boundaries = {"viewBox": f"0 0 {width} {height}", "municipality": {}, "county": {}}
    for kind, features in extracted.items():
        for code, name, rings in features:
            path_parts, sx, sy, count = [], 0.0, 0.0, 0
            for ring in rings:
                points = [((x - min_x) * scale + padding, height - ((y - min_y) * scale + padding)) for x, y in ring]
                if not points:
                    continue
                path_parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
                for x, y in points:
                    sx += x; sy += y; count += 1
            entity_id = f"county:{code}" if kind == "county" else f"municipality:{code}"
            boundaries[kind][entity_id] = {
                "id": entity_id, "code": f"{code}00" if kind == "county" else code,
                "name": name, "parentId": f"county:{code[:2]}" if kind == "municipality" else None,
                "path": "".join(path_parts), "labelPoint": [round(sx / count, 1), round(sy / count, 1)] if count else None,
            }
    return boundaries, entities


def _register_regions(
    db: sqlite3.Connection, kind: str, metadata: dict, current_codes: set[str], latest_year: int
) -> None:
    region_dim = TABLES[kind]["region"]
    for code, label in _labels(metadata, region_dim).items():
        if not (code.isdigit() or code.startswith("EKG") or code in {"EAK", "EAKUO", "EAFK", "EAFKUO"}):
            continue
        entity = entity_from_region(code, label, kind, latest_year)
        if code.isdigit():
            entity["active"] = code in current_codes
            # Historiske kommunekoder kan vise til et historisk fylke som ikke
            # er en aktiv kartforelder. Behold koden og gyldigheten, men ikke
            # lag en falsk relasjon til dagens fylkesstruktur.
            if kind == "municipality" and not entity["active"]:
                entity["parent_id"] = None
        _upsert_entity(db, entity)


def _attach_peer_groups(db: sqlite3.Connection, client: SsbClient) -> None:
    version = client.json(f"{KLASS_API}/versions/1450.json", "klass-kostra-groups.json")
    tables = version.get("correspondenceTables", [])
    table = max(tables, key=lambda item: int(re.search(r"(20\d{2})", item["target"]).group(1)))
    mapping = client.json(
        f"{KLASS_API}/correspondencetables/{table['id']}.json",
        f"klass-kostra-correspondence-{table['id']}.json",
    )
    for row in mapping.get("correspondenceMaps", []):
        db.execute(
            "UPDATE entity SET peer_group_id=? WHERE id=?",
            (f"peer_group:{row['sourceCode']}", f"municipality:{row['targetCode']}"),
        )


def ingest(client: SsbClient, db_path: Path, output: Path) -> dict:
    geojson = {kind: _download_geojson(client, kind) for kind in ("municipality", "county")}
    boundaries, geo_entities = build_boundaries(geojson)
    if db_path.exists():
        db_path.unlink()
    db = create_database(db_path)
    try:
        # Fylkene må finnes før kommunenes parent_id kan settes.
        for entity in geo_entities["county"]:
            _upsert_entity(db, entity)
        for entity in geo_entities["municipality"]:
            _upsert_entity(db, entity)

        metadata_by_kind = {}
        for kind in ("county", "municipality"):
            config = TABLES[kind]
            overview_meta = client.metadata(config["overview"])
            service_meta = client.metadata(config["service"])
            detail_meta = client.metadata(config["detail"])
            metadata_by_kind[kind] = (overview_meta, service_meta, detail_meta)
            latest_year = max(int(code) for code in _ordered_codes(overview_meta["dimension"]["Tid"]))
            current_codes = {entity["code"] for entity in geo_entities[kind]}
            _register_regions(db, kind, overview_meta, current_codes, latest_year)
            function_dim = _dimension_by_label(service_meta, "funksjon")
            art_dim = _dimension_by_label(detail_meta, "art")
            _register_classification(
                db, service_meta, function_dim,
                lambda code: "service_area" if code.startswith("FG") else "function",
            )
            _register_classification(db, detail_meta, art_dim, "accounting_art")
            for table, meta in [
                (config["overview"], overview_meta), (config["service"], service_meta), (config["detail"], detail_meta)
            ]:
                _record_source(db, table, meta)

        _attach_peer_groups(db, client)
        db.commit()

        for kind in ("county", "municipality"):
            config = TABLES[kind]
            overview_meta, service_meta, detail_meta = metadata_by_kind[kind]
            region = config["region"]
            current = [entity["code"] for entity in geo_entities[kind]]
            comparison = ["EAFK"] if kind == "county" else ["EAK"] + [f"EKG{i:02d}" for i in range(1, 18)]
            regions = current + [code for code in comparison if code in _labels(overview_meta, region)]

            concept_dim = _dimension_by_label(overview_meta, "regnskapsbegrep")
            overview_cube = client.data(config["overview"], {
                region: regions,
                concept_dim: [metric["code"] for metric in METRICS],
                "ContentsCode": ["*"],
                "Tid": ["*"],
            })
            _import_overview(db, kind, config["overview"], overview_meta, overview_cube)

            service_function = _dimension_by_label(service_meta, "funksjon")
            service_art = _dimension_by_label(service_meta, "art")
            service_contents = [
                code for code, label in _labels(service_meta, "ContentsCode").items()
                if "andel" not in label.lower()
            ]
            for region_chunk in _chunks(regions):
                cube = client.data(config["service"], {
                    region: region_chunk,
                    service_function: ["*"],
                    service_art: list(SERVICE_METRICS),
                    "ContentsCode": service_contents,
                    "Tid": ["*"],
                })
                _import_services(db, kind, config["service"], service_meta, cube)
                db.commit()

            detail_function = _dimension_by_label(detail_meta, "funksjon")
            detail_art = _dimension_by_label(detail_meta, "art")
            latest_detail_year = max(_ordered_codes(detail_meta["dimension"]["Tid"]), key=int)
            for region_chunk in _chunks(current):
                selection = {
                    region: region_chunk,
                    detail_function: ["*"],
                    detail_art: ["*"],
                    "ContentsCode": ["*"],
                    "Tid": [latest_detail_year],
                }
                if config["scope"] in detail_meta["id"]:
                    selection[config["scope"]] = ["A"]
                cube = client.data(config["detail"], selection)
                _import_details(db, kind, config["detail"], detail_meta, cube)
                db.commit()

        write_frontend_data(db, output, boundaries)
        return {"entities": db.execute("SELECT COUNT(*) FROM entity").fetchone()[0], "latestYear": max(
            row[0] for row in db.execute("SELECT latest_period FROM source_run")
        )}
    finally:
        db.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Importer KOSTRA-data fra SSB")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    result = ingest(SsbClient(force=args.force), args.db, args.output)
    print(f"KOSTRA: {result['entities']} enheter, siste år {result['latestYear']}")


if __name__ == "__main__":
    main()
