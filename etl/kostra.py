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
import unicodedata
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin
from xml.etree import ElementTree

import requests

from download import _request_med_retry


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).with_name("kostra_schema.sql")
DEFAULT_DB = Path(__file__).parent / "raw" / "kostra.sqlite"
DEFAULT_OUTPUT = ROOT / "web" / "public" / "data"
RAW_KOSTRA = Path(__file__).parent / "raw" / "kostra"
SSB_API = "https://data.ssb.no/api/pxwebapi/v2"
KLASS_API = "https://data.ssb.no/api/klass/v1"
METADATA_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60

TABLES = {
    "municipality": {
        "overview": "12137", "financial_detail": "13551", "investment_detail": "13552",
        "balance_detail": "13202", "service": "12362", "detail": "12367",
        "region": "KOKkommuneregion0000", "scope": "KOKregnskapsomfa0000",
    },
    "county": {
        "overview": "12366", "financial_detail": "13547", "investment_detail": "13548",
        "balance_detail": "13213", "service": "12163", "detail": "12368",
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

OVERVIEW_METRICS = [
    {"id": "revenues", "label": "Driftsinntekter", "code": "AGD13", "polarity": "high"},
    {"id": "expenses", "label": "Driftsutgifter", "code": "AGD9", "polarity": "neutral"},
    {"id": "net_result", "label": "Netto driftsresultat", "code": "AGD23", "polarity": "high"},
    {"id": "debt", "label": "Netto lånegjeld", "code": "KG31", "polarity": "low"},
    {"id": "investments", "label": "Investeringsutgifter", "code": "AGI1", "polarity": "neutral"},
    {"id": "net_expenses", "label": "Netto driftsutgifter", "code": "AGD1", "polarity": "neutral"},
]
INTEREST_METRICS = [
    {"id": "interest_income", "label": "Renteinntekter", "code": "AGD79", "polarity": "high"},
    {"id": "interest_expenses", "label": "Rentekostnader", "code": "AGD82", "polarity": "low"},
]
METRICS = OVERVIEW_METRICS[:2] + INTEREST_METRICS + OVERVIEW_METRICS[2:]

# KDD publiserer den løpende inntektsutjevningen som en egen kommunevis
# sluttavregning. Den hører derfor hjemme i samme forhåndsberegnede kartindeks,
# men er ikke et KOSTRA-regnskapsbegrep og finnes aldri for fylkeskommuner her.
INCOME_EQUALIZATION_METRIC = {
    "id": "income_equalization",
    "label": "Netto inntektsutjevning",
    "code": "KDD_NET_EQUALIZATION",
    "polarity": "diverging",
    "category": "finance",
    "municipalityOnly": True,
}

STATE_BLOCK_GRANT_CODE = "A800"
TAX_TABLE = "07022"
KDD_INCOME_EQUALIZATION_PAGE = (
    "https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/"
    "inntektssystemet-for-kommuner-og-fylkeskommuner/lopende-inntektsutjevning/id548672/"
)
KDD_INCOME_EQUALIZATION_SOURCE = "KDD_INCOME_EQUALIZATION"
KDD_GREEN_BOOK_PAGE = (
    "https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/gront-hefte/id547024/"
)
KDD_GREEN_BOOK_SOURCE = "KDD_GREEN_BOOK"
TAX_FLOW_CATEGORIES = {
    "08": "national_insurance_member",
    "09": "employer_national_insurance",
    "10": "common_tax",
    "11": "state_income_wealth_tax",
}

SERVICE_METRICS = {
    "AGD10": "gross_expenses",
    "AGD2": "net_expenses",
    "AGI5": "investments",
}

# Gjensidig utelukkende hovedgrupper som SSB bruker til å bygge AGD10
# (brutto driftsutgifter på funksjon/tjenesteområde). Delarter som A090,
# A260 og A370 ligger allerede i disse gruppene og må ikke summeres på nytt.
# Noen rapporteringer lar seg likevel ikke avstemme helt; avviket beholdes og
# forklares i klienten i stedet for at tallene justeres.
EXPENSE_ARTS = {"AG16", "AGD50", "AGD51", "AG34", "A590"}
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

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        headers = {
            "User-Agent": "Fellestall-KOSTRA/1.0 (https://fellestall.no)",
            **kwargs.pop("headers", {}),
        }
        response = _request_med_retry(
            method, url, timeout=kwargs.pop("timeout", 180), headers=headers, **kwargs
        )
        response.raise_for_status()
        return response

    def json(self, url: str, cache_name: str) -> dict:
        path = self.cache_dir / cache_name
        if path.exists() and not self.force:
            return json.loads(path.read_text(encoding="utf-8"))
        data = self._request("GET", url).json()
        _write_json(path, data)
        return data

    def content(self, url: str, cache_name: str, *, max_age: int | None = None) -> bytes:
        path = self.cache_dir / cache_name
        fresh = path.exists() and (
            max_age is None or time.time() - path.stat().st_mtime < max_age
        )
        if path.exists() and not self.force and fresh:
            return path.read_bytes()
        response = self._request("GET", url)
        path.write_bytes(response.content)
        return response.content

    def metadata(self, table: str) -> dict:
        path = self.cache_dir / f"{table}-metadata.json"
        if (
            path.exists() and not self.force
            and time.time() - path.stat().st_mtime < METADATA_CACHE_MAX_AGE_SECONDS
        ):
            return json.loads(path.read_text(encoding="utf-8"))
        try:
            data = self._request(
                "GET", f"{SSB_API}/tables/{table}/metadata?lang=no"
            ).json()
        except requests.RequestException:
            if path.exists() and not self.force:
                return json.loads(path.read_text(encoding="utf-8"))
            raise
        _write_json(path, data)
        return data

    def data(
        self, table: str, selection: dict[str, list[str]], cache_revision: str | int | None = None
    ) -> dict:
        normalized = {key: list(values) for key, values in selection.items()}
        cache_payload = normalized if cache_revision is None else {
            "selection": normalized,
            "revision": cache_revision,
        }
        digest = hashlib.sha1(
            json.dumps(cache_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
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


def _population_for_year(db: sqlite3.Connection, entity_id: str, year: int) -> int | None:
    """Utled folketallet fra en KOSTRA-post med beløp og per innbygger."""
    placeholders = ",".join("?" for _ in METRICS)
    codes = [metric["code"] for metric in METRICS]
    row = db.execute(
        f"""SELECT amount, per_capita FROM fact
             WHERE dataset_id='kostra_actuals' AND entity_id=? AND year=?
               AND function_code='' AND accounting_art_code=''
               AND metric_code IN ({placeholders})
               AND amount IS NOT NULL AND per_capita IS NOT NULL AND per_capita<>0
             ORDER BY CASE metric_code WHEN 'AGD13' THEN 0 WHEN 'AGD9' THEN 1 ELSE 2 END
             LIMIT 1""",
        (entity_id, year, *codes),
    ).fetchone()
    if not row:
        return None
    return round(abs(row["amount"] * 1000 / row["per_capita"]))


def _upsert_public_flow(
    db: sqlite3.Connection,
    dataset_id: str,
    entity_id: str,
    year: int,
    category_code: str,
    amount: float | None,
    per_capita: float | None,
    source_table: str,
    source_period: str,
) -> None:
    db.execute(
        """INSERT INTO public_flow_fact
             (dataset_id,entity_id,year,category_code,amount,per_capita,basis,source_table,source_period)
           VALUES (?,?,?,?,?,?,'actual',?,?)
           ON CONFLICT(dataset_id,entity_id,year,category_code,source_table)
           DO UPDATE SET amount=excluded.amount,per_capita=excluded.per_capita,
                         basis=excluded.basis,source_period=excluded.source_period""",
        (dataset_id, entity_id, year, category_code, amount, per_capita, source_table, source_period),
    )


def _sync_block_grant_flows(db: sqlite3.Connection) -> None:
    """Kopier faktisk rammetilskudd fra KOSTRA til den eksplisitte flytmodellen."""
    for row in db.execute(
        """SELECT entity_id,year,amount,per_capita,source_table FROM fact
             WHERE dataset_id='kostra_actuals' AND metric_code=?
               AND function_code='' AND accounting_art_code=''
               AND entity_id LIKE 'municipality:%'""",
        (STATE_BLOCK_GRANT_CODE,),
    ).fetchall():
        _upsert_public_flow(
            db, "kostra_state_transfers", row["entity_id"], row["year"],
            "state_block_grant", row["amount"], row["per_capita"],
            row["source_table"], str(row["year"]),
        )


def _import_tax_flows(db: sqlite3.Connection, metadata: dict, cube: dict) -> None:
    """Importer bare desemberstanden fra SSBs akkumulerte skatteregnskap.

    Tabell 07022 publiserer millioner kroner per måned som akkumulerte tall.
    Lokalmodellen bruker 1000 kroner, og månedene skal derfor aldri summeres.
    """
    unit = (
        metadata.get("dimension", {}).get("ContentsCode", {}).get("category", {})
        .get("unit", {}).get("Skatt", {}).get("base")
    )
    if not unit or "mill" not in unit.lower():
        raise ValueError(f"Uventet enhet i SSB {TAX_TABLE}: {unit}")

    existing_entities = {
        row[0] for row in db.execute("SELECT id FROM entity WHERE kind='municipality'")
    }
    for row in iter_jsonstat(cube):
        period = row.get("Tid", "")
        region = row.get("Region", "")
        category_code = TAX_FLOW_CATEGORIES.get(row.get("Skatteart"))
        if row.get("value") is None or not period.endswith("M12") or not re.fullmatch(r"\d{4}", region):
            continue
        entity_id = f"municipality:{region}"
        if category_code is None or entity_id not in existing_entities:
            continue
        year = int(period[:4])
        amount = float(row["value"]) * 1000
        population = _population_for_year(db, entity_id, year)
        per_capita = amount * 1000 / population if population else None
        _upsert_public_flow(
            db, "ssb_tax_accounts", entity_id, year, category_code,
            amount, per_capita, TAX_TABLE, period,
        )


class _SpreadsheetLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(href)


def _income_equalization_sources(page_html: str) -> dict[int, str]:
    """Finn KDDs kommunevise sluttavregninger uten å låse ETL-en til filstier."""
    parser = _SpreadsheetLinkParser()
    parser.feed(page_html)
    result = {}
    for href in parser.links:
        filename = href.rsplit("/", 1)[-1].lower()
        if not filename.endswith(".xlsx") or "_fykom" in filename:
            continue
        match = re.search(r"_(20\d{2})kom(?:\b|[-_.])", filename)
        if match:
            result[int(match.group(1))] = urljoin(KDD_INCOME_EQUALIZATION_PAGE, href)
    return result


def _green_book_sources(page_html: str) -> dict[int, dict[str, str]]:
    """Finn 1-k og 2-k for kommunene fra den offisielle årssiden."""
    parser = _SpreadsheetLinkParser()
    parser.feed(page_html)
    result: dict[int, dict[str, str]] = {}
    for href in parser.links:
        lowered = href.lower()
        if not lowered.endswith(".ods") or re.search(r"(?:^|[-_/])\d?-?fk(?:[-_.]|$)", lowered):
            continue
        table = None
        if re.search(r"tabell-?1-?k(?:[-_.]|$)", lowered):
            table = "table1"
        elif re.search(r"tabell-?2-?k(?:[-_.]|$)", lowered):
            table = "table2"
        year_match = re.search(r"(?:/|-)(20\d{2})(?:/|-|\.)", lowered)
        if table and year_match:
            result.setdefault(int(year_match.group(1)), {})[table] = urljoin(KDD_GREEN_BOOK_PAGE, href)
    return {year: sources for year, sources in result.items() if set(sources) == {"table1", "table2"}}


def _xlsx_rows(content: bytes) -> list[dict[str, str | None]]:
    """Les første ark i en XLSX med standardbiblioteket.

    KDD-filene har både delte og innebygde tekstceller. Formlene har lagrede
    verdier i ``<v>`` og kan derfor leses uten å evaluere regnearket lokalt.
    """
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    try:
        archive = zipfile.ZipFile(BytesIO(content))
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.findall(".//x:t", namespace))
                for item in root.findall("x:si", namespace)
            ]
        sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    except (KeyError, zipfile.BadZipFile, ElementTree.ParseError) as error:
        raise ValueError("KDD-filen er ikke en lesbar XLSX med forventet første ark") from error

    rows = []
    for row in sheet.findall(".//x:sheetData/x:row", namespace):
        values = {}
        for cell in row.findall("x:c", namespace):
            reference = cell.get("r", "")
            column_match = re.match(r"([A-Z]+)", reference)
            if not column_match:
                continue
            value_node = cell.find("x:v", namespace)
            if cell.get("t") == "s" and value_node is not None:
                value = shared[int(value_node.text)]
            elif cell.get("t") == "inlineStr":
                value = "".join(node.text or "" for node in cell.findall(".//x:t", namespace))
            else:
                value = value_node.text if value_node is not None else None
            values[column_match.group(1)] = value
        rows.append(values)
    return rows


def _number(value: str | int | float | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def _normalized_label(value: str | None) -> str:
    norwegian_ascii = (value or "").translate(str.maketrans({
        "ø": "o", "Ø": "O", "æ": "ae", "Æ": "Ae",
    }))
    decomposed = unicodedata.normalize("NFKD", norwegian_ascii)
    ascii_label = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_label.lower()).split())


def _ods_rows(content: bytes) -> list[list[str | float | None]]:
    """Les første tabell i en ODS uten å introdusere en ny ETL-avhengighet."""
    namespaces = {
        "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
        "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
        "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    }
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            root = ElementTree.fromstring(archive.read("content.xml"))
    except (KeyError, zipfile.BadZipFile, ElementTree.ParseError) as error:
        raise ValueError("Grønt hefte-filen er ikke en lesbar ODS") from error
    table = root.find(".//table:table", namespaces)
    if table is None:
        raise ValueError("Grønt hefte-filen mangler tabell")
    rows = []
    repeat_attribute = f"{{{namespaces['table']}}}number-columns-repeated"
    value_attribute = f"{{{namespaces['office']}}}value"
    for row in table.findall("table:table-row", namespaces):
        values = []
        for cell in row.findall("table:table-cell", namespaces):
            text_value = " ".join("".join(cell.itertext()).split())
            raw_value = cell.get(value_attribute)
            value = raw_value if raw_value not in (None, "") else text_value or None
            # Tomme sluttceller kan være komprimert med svært store repetisjoner.
            repeats = min(int(cell.get(repeat_attribute, "1")), 100)
            values.extend([value] * repeats)
        rows.append(values)
    return rows


def _green_book_table(content: bytes, required_header: str) -> tuple[list[str], list[list]]:
    rows = _ods_rows(content)
    for position, row in enumerate(rows):
        labels = [_normalized_label(str(value)) for value in row]
        if labels and labels[0] == "kommune" and any(required_header in label for label in labels):
            return labels, rows[position + 1:]
    raise ValueError(f"Grønt hefte mangler forventet kolonne {required_header!r}")


def _green_book_column(headers: list[str], *needles: str, exclude: tuple[str, ...] = ()) -> int:
    for index, header in enumerate(headers):
        if all(needle in header for needle in needles) and not any(word in header for word in exclude):
            return index
    raise ValueError(f"Grønt hefte mangler kolonne med {needles!r}")


def _green_book_optional_column(headers: list[str], *needles: str) -> int | None:
    try:
        return _green_book_column(headers, *needles)
    except ValueError:
        return None


def _green_book_municipality_rows(headers: list[str], rows: list[list]) -> dict[str, list]:
    municipalities = {}
    for row in rows:
        if not row:
            continue
        match = re.match(r"\s*(\d{4})\b", str(row[0] or ""))
        if match:
            municipalities[match.group(1)] = row + [None] * max(0, len(headers) - len(row))
    return municipalities


def _import_green_book_grants(
    db: sqlite3.Connection,
    year: int,
    source_url: str,
    table_1_content: bytes,
    table_2_content: bytes,
) -> int:
    """Importer statsbudsjettets kommunevise beregning av rammetilskuddet.

    Tabell 1-k viser tilskuddsdelene, mens 2-k åpner innbyggertilskuddet.
    Beløpene er budsjettall i 1 000 kroner. Den faktiske inntektsutjevningen
    kommer senere og lagres separat; den må aldri bygges inn i disse tallene.
    """
    headers_1, rows_1 = _green_book_table(table_1_content, "rammetilsk")
    headers_2, rows_2 = _green_book_table(table_2_content, "utgifts")
    by_code_1 = _green_book_municipality_rows(headers_1, rows_1)
    by_code_2 = _green_book_municipality_rows(headers_2, rows_2)

    column_1 = {
        "population_grant": _green_book_column(headers_1, "innbygg", "tilsk"),
        "district_south": _green_book_column(headers_1, "distrikt", "tilsk", "sor"),
        "district_north": _green_book_column(headers_1, "distrikt", "tilsk", "nord"),
        "regional_center_grant": _green_book_optional_column(headers_1, "regionsenter", "tilsk"),
        "growth_grant": _green_book_column(headers_1, "veksttilsk"),
        "metropolitan_grant": _green_book_column(headers_1, "storbytilsk"),
        "discretionary_grant": _green_book_column(headers_1, "skjon"),
        "budgeted_block_grant_before_income_equalization": _green_book_column(headers_1, "rammetilsk", str(year)),
    }
    column_2 = {
        "base_per_resident": _green_book_column(headers_2, "innbygg", "tilsk", "for omfordeling"),
        "expense_equalization": _green_book_column(headers_2, "utgifts"),
        "special_distribution": _green_book_column(headers_2, "saker", "saerskil", "fordeling"),
        "income_guarantee": _green_book_column(headers_2, "garanti", "ordning", exclude=("innbygg",)),
        "population_grant": _green_book_column(headers_2, "innbygg", "tilsk", "inkl", "garanti"),
    }
    component_order = [
        "base_per_resident", "expense_equalization", "special_distribution", "income_guarantee",
        "district_south", "district_north", "regional_center_grant", "growth_grant", "metropolitan_grant",
        "discretionary_grant", "budgeted_block_grant_before_income_equalization",
    ]
    existing_entities = {
        row[0] for row in db.execute("SELECT id FROM entity WHERE kind='municipality'")
    }
    imported = 0
    for code in sorted(set(by_code_1) & set(by_code_2)):
        entity_id = f"municipality:{code}"
        if entity_id not in existing_entities:
            continue
        row_1, row_2 = by_code_1[code], by_code_2[code]
        values = {
            component: _number(row_2[column]) for component, column in column_2.items()
        }
        values.update({
            component: _number(row_1[column])
            for component, column in column_1.items() if column is not None
        })
        population = _population_for_year(db, entity_id, year)
        for sort_order, component in enumerate(component_order, 10):
            if component not in values:
                continue
            amount = values.get(component)
            per_capita = amount * 1000 / population if amount is not None and population else None
            db.execute(
                """INSERT INTO block_grant_component_fact
                     (dataset_id,entity_id,year,component_code,amount,per_capita,sort_order,
                      basis,source_url,source_period)
                   VALUES ('kdd_green_book',?,?,?,?,?,?,'budget',?,?)
                   ON CONFLICT(dataset_id,entity_id,year,component_code) DO UPDATE SET
                     amount=excluded.amount,per_capita=excluded.per_capita,
                     sort_order=excluded.sort_order,basis=excluded.basis,
                     source_url=excluded.source_url,source_period=excluded.source_period""",
                (entity_id, year, component, amount, per_capita, sort_order, source_url, str(year)),
            )
        imported += 1
    if imported == 0:
        raise ValueError(f"Fant ingen kjente kommuner i Grønt hefte for {year}")
    return imported


def _import_income_equalization(
    db: sqlite3.Connection, year: int, source_url: str, content: bytes
) -> int:
    """Normaliser KDDs sluttavregning for kommunevis inntektsutjevning.

    Beløp utledes fra per-innbyggerkolonnene og folketallet. Det unngår en
    historisk enhetsendring i kolonne C, som er 1000 kroner i eldre filer og
    kroner i nyere filer. Den signerte nettoutjevningen beholdes: negativt er
    trekk/bidrag, positivt er tillegg/mottak.
    """
    rows = _xlsx_rows(content)
    expected_columns = len(rows) > 5 and rows[5].get("E") == "3" and rows[5].get("K") == "9"
    if len(rows) < 8 or "Knr" not in (rows[1].get("A") or "") or not expected_columns:
        raise ValueError(f"Uventet oppsett i KDDs inntektsutjevning for {year}")

    existing_entities = {
        row[0] for row in db.execute("SELECT id FROM entity WHERE kind='municipality'")
    }
    imported = 0
    for row in rows[7:]:
        raw_code = _number(row.get("A"))
        population = _number(row.get("D"))
        tax_before_per_capita = _number(row.get("E"))
        tax_before_national_ratio = _number(row.get("F"))
        equalization_per_capita = _number(row.get("K"))
        if raw_code is None or population is None or population <= 0:
            continue
        code = str(int(raw_code)).zfill(4)
        entity_id = f"municipality:{code}"
        if entity_id not in existing_entities:
            continue
        tax_after_per_capita = (
            tax_before_per_capita + equalization_per_capita
            if tax_before_per_capita is not None and equalization_per_capita is not None
            else None
        )
        tax_after_national_ratio = (
            tax_before_national_ratio * tax_after_per_capita / tax_before_per_capita
            if tax_before_national_ratio is not None and tax_after_per_capita is not None
               and tax_before_per_capita not in (None, 0)
            else None
        )
        population_int = round(population)
        def to_thousand(per_capita):
            return per_capita * population_int / 1000 if per_capita is not None else None
        db.execute(
            """INSERT INTO income_equalization_fact
                 (dataset_id,entity_id,year,population,tax_before_amount,tax_before_per_capita,
                  tax_before_national_ratio,equalization_amount,equalization_per_capita,
                  tax_after_amount,tax_after_per_capita,tax_after_national_ratio,basis,
                  source_url,source_period)
               VALUES ('kdd_income_equalization',?,?,?,?,?,?,?,?,?,?,?,'actual',?,?)
               ON CONFLICT(dataset_id,entity_id,year) DO UPDATE SET
                 population=excluded.population,tax_before_amount=excluded.tax_before_amount,
                 tax_before_per_capita=excluded.tax_before_per_capita,
                 tax_before_national_ratio=excluded.tax_before_national_ratio,
                 equalization_amount=excluded.equalization_amount,
                 equalization_per_capita=excluded.equalization_per_capita,
                 tax_after_amount=excluded.tax_after_amount,
                 tax_after_per_capita=excluded.tax_after_per_capita,
                 tax_after_national_ratio=excluded.tax_after_national_ratio,
                 basis=excluded.basis,source_url=excluded.source_url,
                 source_period=excluded.source_period""",
            (
                entity_id, year, population_int,
                to_thousand(tax_before_per_capita), tax_before_per_capita,
                tax_before_national_ratio,
                to_thousand(equalization_per_capita), equalization_per_capita,
                to_thousand(tax_after_per_capita), tax_after_per_capita,
                tax_after_national_ratio, source_url, str(year),
            ),
        )
        imported += 1
    if imported == 0:
        raise ValueError(f"Fant ingen kjente kommuner i KDDs inntektsutjevning for {year}")
    return imported


def _import_income_equalization_sources(
    db: sqlite3.Connection, client: SsbClient, years: set[int]
) -> None:
    page = client.content(
        KDD_INCOME_EQUALIZATION_PAGE,
        "kdd-income-equalization.html",
        max_age=METADATA_CACHE_MAX_AGE_SECONDS,
    ).decode("utf-8")
    sources = _income_equalization_sources(page)
    completed_years = sorted(year for year in years if year < datetime.now().year)
    missing = [year for year in completed_years if year not in sources]
    if missing:
        raise ValueError(f"KDD mangler kommunevis inntektsutjevning for {missing}")
    for year in completed_years:
        content = client.content(sources[year], f"kdd-income-equalization-{year}.xlsx")
        _import_income_equalization(db, year, sources[year], content)
    if completed_years:
        db.execute(
            "INSERT OR REPLACE INTO source_run VALUES (?,?,?,?)",
            (
                KDD_INCOME_EQUALIZATION_SOURCE,
                datetime.now(timezone.utc).isoformat(),
                "Kommunal- og distriktsdepartementet: løpende inntektsutjevning",
                max(completed_years),
            ),
        )


def _import_green_book_sources(
    db: sqlite3.Connection, client: SsbClient, years: set[int]
) -> None:
    page = client.content(
        KDD_GREEN_BOOK_PAGE,
        "kdd-green-book.html",
        max_age=METADATA_CACHE_MAX_AGE_SECONDS,
    ).decode("utf-8")
    sources = _green_book_sources(page)
    import_years = sorted(year for year in years if year in sources)
    if years and max(years) not in sources:
        raise ValueError(f"Grønt hefte mangler 1-k eller 2-k for {max(years)}")
    for year in import_years:
        table_1 = client.content(sources[year]["table1"], f"kdd-green-book-{year}-1-k.ods")
        table_2 = client.content(sources[year]["table2"], f"kdd-green-book-{year}-2-k.ods")
        _import_green_book_grants(db, year, sources[year]["table1"], table_1, table_2)
    if import_years:
        db.execute(
            "INSERT OR REPLACE INTO source_run VALUES (?,?,?,?)",
            (
                KDD_GREEN_BOOK_SOURCE,
                datetime.now(timezone.utc).isoformat(),
                "Kommunal- og distriktsdepartementet: Grønt hefte",
                max(import_years),
            ),
        )


def _continuity_entity_ids(db: sqlite3.Connection, entity_id: str) -> list[str]:
    """Følg bare dokumenterte én-til-én kodebytter bakover i tid."""
    result, pending = [entity_id], [entity_id]
    while pending:
        target = pending.pop()
        for row in db.execute(
            "SELECT source_entity_id FROM entity_relation WHERE target_entity_id=? AND relation_type='exact_successor'",
            (target,),
        ):
            if row[0] not in result:
                result.append(row[0])
                pending.append(row[0])
    return result


def _income_system_comparisons(
    db: sqlite3.Connection, entity: dict, series_entity_ids: list[str], years: list[int]
) -> dict | None:
    """Forhåndsberegn sammenlignbare per-innbyggerverdier for detaljsiden."""
    peer_group_id = entity.get("peer_group_id")
    comparison_ids = [entity["id"], peer_group_id, "country:EAK"]
    comparison_ids = [entity_id for entity_id in comparison_ids if entity_id]
    labels = {
        row["id"]: row["name"] for row in db.execute(
            "SELECT id,name FROM entity WHERE id IN ({})".format(
                ",".join("?" for _ in comparison_ids)
            ),
            comparison_ids,
        )
    }

    def aggregate_equalization(comparison_id: str, year: int):
        if comparison_id == entity["id"]:
            slots = ",".join("?" for _ in series_entity_ids)
            row = db.execute(
                """SELECT tax_before_per_capita,equalization_per_capita
                     FROM income_equalization_fact
                    WHERE entity_id IN (""" + slots + ") AND year=? LIMIT 1",
                (*series_entity_ids, year),
            ).fetchone()
            population_row = db.execute(
                "SELECT population FROM income_equalization_fact WHERE entity_id IN ({}) AND year=? LIMIT 1".format(slots),
                (*series_entity_ids, year),
            ).fetchone()
            return (
                row["tax_before_per_capita"], row["equalization_per_capita"],
                population_row["population"] if population_row else None,
            ) if row else (None, None, None)
        peer_clause = "AND e.peer_group_id=?" if comparison_id.startswith("peer_group:") else ""
        parameters = (year, comparison_id) if peer_clause else (year,)
        row = db.execute(
            """SELECT SUM(i.tax_before_amount)*1000.0/SUM(i.population) AS tax_before,
                      SUM(i.equalization_amount)*1000.0/SUM(i.population) AS equalization,
                      SUM(i.population) AS population
                 FROM income_equalization_fact i
                 JOIN entity e ON e.id=i.entity_id
                WHERE i.year=? """ + peer_clause,
            parameters,
        ).fetchone()
        return (row["tax_before"], row["equalization"], row["population"]) if row else (None, None, None)

    values = {}
    for year in years:
        rows = []
        for comparison_id in comparison_ids:
            if comparison_id == entity["id"]:
                slots = ",".join("?" for _ in series_entity_ids)
                grant = db.execute(
                    """SELECT amount,per_capita FROM fact
                         WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + slots + """)
                           AND year=? AND metric_code=? AND function_code=''
                           AND accounting_art_code='' LIMIT 1""",
                    (*series_entity_ids, year, STATE_BLOCK_GRANT_CODE),
                ).fetchone()
            else:
                grant = db.execute(
                    """SELECT amount,per_capita FROM fact
                         WHERE dataset_id='kostra_actuals' AND entity_id=? AND year=?
                           AND metric_code=? AND function_code='' AND accounting_art_code=''
                         LIMIT 1""",
                    (comparison_id, year, STATE_BLOCK_GRANT_CODE),
                ).fetchone()
            tax_before, equalization, population = aggregate_equalization(comparison_id, year)
            block_grant = (
                grant["amount"] * 1000 / population
                if grant and grant["amount"] is not None and population else
                grant["per_capita"] if grant else None
            )
            before_equalization = (
                block_grant - equalization
                if block_grant is not None and equalization is not None else None
            )
            rows.append({
                "id": comparison_id,
                "label": labels.get(comparison_id, comparison_id),
                "taxBeforePerCapita": tax_before,
                "equalizationPerCapita": equalization,
                "blockGrantBeforeEqualizationPerCapita": before_equalization,
                "blockGrantPerCapita": block_grant,
            })
        values[str(year)] = rows
    return {"years": years, "values": values} if values else None


def _entity_detail(db: sqlite3.Connection, entity: dict, latest_year: int) -> dict:
    function_labels = _classification_labels(db, "function")
    art_labels = _classification_labels(db, "accounting_art")
    series_entity_ids = _continuity_entity_ids(db, entity["id"])
    entity_slots = ",".join("?" for _ in series_entity_ids)

    overview = {}
    for metric in METRICS:
        rows = db.execute(
            """SELECT year, amount, per_capita FROM fact
               WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + entity_slots + """) AND metric_code=?
                 AND function_code='' AND accounting_art_code=''
               ORDER BY year""",
            (*series_entity_ids, metric["code"]),
        )
        overview[metric["id"]] = _series(rows)

    service_rows = db.execute(
        """SELECT function_code, metric_code, year, amount, per_capita FROM fact
           WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + entity_slots + """)
             AND function_code LIKE 'FG%' AND accounting_art_code=''
           ORDER BY function_code, year""",
        series_entity_ids,
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
           WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + entity_slots + """)
             AND function_code GLOB '[0-9][0-9][0-9]' AND accounting_art_code=''
           ORDER BY function_code, year""",
        series_entity_ids,
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
        """SELECT function_code, accounting_art_code, year, amount FROM fact
           WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + entity_slots + """)
             AND accounting_art_code<>'' AND amount IS NOT NULL
           ORDER BY function_code, accounting_art_code, year""",
        series_entity_ids,
    ).fetchall()
    arts_by_function = defaultdict(dict)
    expense_breakdown = defaultdict(float)
    revenue_breakdown = defaultdict(float)
    for row in art_rows:
        art = arts_by_function[row["function_code"]].setdefault(row["accounting_art_code"], {
            "code": row["accounting_art_code"],
            "name": art_labels.get(row["accounting_art_code"], row["accounting_art_code"]),
            "values": {},
        })
        art["values"][str(row["year"])] = {"amount": row["amount"]}
        if row["year"] == latest_year and row["function_code"].isdigit():
            if row["accounting_art_code"] in EXPENSE_ARTS:
                expense_breakdown[row["accounting_art_code"]] += row["amount"]
            if row["accounting_art_code"] in REVENUE_ARTS:
                revenue_breakdown[row["accounting_art_code"]] += row["amount"]

    accounting_arts = {
        function_code: list(arts.values())
        for function_code, arts in arts_by_function.items()
    }

    statement_data = {}
    statement_sources = {
        "result": TABLES[entity["kind"]]["financial_detail"],
        "investment": TABLES[entity["kind"]]["investment_detail"],
        "balance": TABLES[entity["kind"]]["balance_detail"],
    }
    for statement, source_table in statement_sources.items():
        codes = {}
        rows = db.execute(
            """SELECT metric_code,year,amount,per_capita FROM fact
                 WHERE dataset_id='kostra_actuals' AND entity_id IN (""" + entity_slots + """)
                   AND source_table=? AND function_code='' AND accounting_art_code=''
                 ORDER BY metric_code,year""",
            (*series_entity_ids, source_table),
        ).fetchall()
        label_dimension = "balance_chapter" if statement == "balance" else f"statement_{statement}"
        labels = _classification_labels(db, label_dimension)
        for row in rows:
            item = codes.setdefault(row["metric_code"], {
                "code": row["metric_code"],
                "name": labels.get(row["metric_code"], row["metric_code"]),
                "sourceTable": source_table,
                "values": {},
            })
            item["values"][str(row["year"])] = {
                "amount": row["amount"], "perCapita": row["per_capita"],
            }
        statement_data[statement] = codes

    def breakdown(values):
        return [
            {"code": code, "name": art_labels.get(code, code), "amount": amount}
            for code, amount in sorted(values.items(), key=lambda item: abs(item[1]), reverse=True)
        ]

    boundary_history = [dict(row) for row in db.execute(
        """SELECT r.change_year AS changeYear, r.relation_type AS relationType,
                  source.id AS sourceId, source.code AS sourceCode, source.name AS sourceName,
                  target.id AS targetId, target.code AS targetCode, target.name AS targetName
           FROM entity_relation r
           JOIN entity source ON source.id=r.source_entity_id
           JOIN entity target ON target.id=r.target_entity_id
           WHERE r.source_entity_id IN (""" + entity_slots + """)
              OR r.target_entity_id IN (""" + entity_slots + """)
           ORDER BY r.change_year""",
        (*series_entity_ids, *series_entity_ids),
    )]

    state_flows = None
    income_equalization = None
    block_grant_calculation = None
    income_system_comparisons = None
    if entity["kind"] == "municipality":
        flow_rows = db.execute(
            """SELECT f.year,f.category_code,f.amount,f.per_capita,f.basis,
                      f.source_table,f.source_period,c.label,c.direction,c.actor_scope,
                      c.description,c.sort_order
                 FROM public_flow_fact f
                 JOIN public_flow_category c ON c.code=f.category_code
                WHERE f.entity_id IN (""" + entity_slots + """)
                ORDER BY c.sort_order,f.year""",
            series_entity_ids,
        ).fetchall()
        facts_by_category = defaultdict(list)
        for row in flow_rows:
            facts_by_category[row["category_code"]].append(row)
        categories = db.execute(
            "SELECT * FROM public_flow_category ORDER BY sort_order"
        ).fetchall()
        incoming, outgoing, flow_years = [], [], set()
        for category in categories:
            values = {}
            for row in facts_by_category.get(category["code"], []):
                values[str(row["year"])] = {
                    "amount": row["amount"],
                    "perCapita": row["per_capita"],
                    "basis": row["basis"],
                    "sourceTable": row["source_table"],
                    "sourcePeriod": row["source_period"],
                }
                flow_years.add(row["year"])
            item = {
                "code": category["code"],
                "label": category["label"],
                "actorScope": category["actor_scope"],
                "description": category["description"],
                "values": values,
            }
            (incoming if category["direction"] == "from_state" else outgoing).append(item)
        state_flows = {
            "years": sorted(flow_years),
            "incoming": incoming,
            "outgoing": outgoing,
        }
        equalization_rows = db.execute(
            """SELECT year,population,tax_before_amount,tax_before_per_capita,
                      tax_before_national_ratio,equalization_amount,equalization_per_capita,
                      tax_after_amount,tax_after_per_capita,tax_after_national_ratio,
                      basis,source_url,source_period
                 FROM income_equalization_fact
                WHERE entity_id IN (""" + entity_slots + ") ORDER BY year",
            series_entity_ids,
        ).fetchall()
        if equalization_rows:
            income_equalization = {
                "years": [row["year"] for row in equalization_rows],
                "values": {
                    str(row["year"]): {
                        "population": row["population"],
                        "taxBefore": {
                            "amount": row["tax_before_amount"],
                            "perCapita": row["tax_before_per_capita"],
                            "nationalRatio": row["tax_before_national_ratio"],
                        },
                        "equalization": {
                            "amount": row["equalization_amount"],
                            "perCapita": row["equalization_per_capita"],
                        },
                        "taxAfter": {
                            "amount": row["tax_after_amount"],
                            "perCapita": row["tax_after_per_capita"],
                            "nationalRatio": row["tax_after_national_ratio"],
                        },
                        "basis": row["basis"],
                        "sourceUrl": row["source_url"],
                        "sourcePeriod": row["source_period"],
                    }
                    for row in equalization_rows
                },
            }
            income_system_comparisons = _income_system_comparisons(
                db, entity, series_entity_ids, [row["year"] for row in equalization_rows]
            )
        component_rows = db.execute(
            """SELECT year,component_code,amount,per_capita,sort_order,basis,
                      source_url,source_period
                 FROM block_grant_component_fact
                WHERE entity_id IN (""" + entity_slots + ") ORDER BY year,sort_order",
            series_entity_ids,
        ).fetchall()
        if component_rows:
            calculation_values = {}
            for row in component_rows:
                value = calculation_values.setdefault(str(row["year"]), {
                    "basis": row["basis"],
                    "sourceUrl": row["source_url"],
                    "sourcePeriod": row["source_period"],
                    "components": [],
                })
                value["components"].append({
                    "code": row["component_code"],
                    "amount": row["amount"],
                    "perCapita": row["per_capita"],
                })
            block_grant_calculation = {
                "years": sorted(int(year) for year in calculation_values),
                "values": calculation_values,
            }

    return {
        "schemaVersion": 5,
        "entity": entity,
        "latestYear": latest_year,
        "overview": overview,
        "revenueBreakdown": breakdown(revenue_breakdown),
        "expenseBreakdown": breakdown(expense_breakdown),
        "services": list(services.values()),
        "functions": list(functions.values()),
        "accountingArts": accounting_arts,
        "statementData": statement_data,
        "boundaryHistory": boundary_history,
        "stateFlows": state_flows,
        "incomeEqualization": income_equalization,
        "blockGrantCalculation": block_grant_calculation,
        "incomeSystemComparisons": income_system_comparisons,
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
    historical_entities = [dict(row) for row in db.execute(
        """SELECT * FROM entity WHERE active=0
           ORDER BY kind, valid_to DESC, name"""
    )]
    years = [row[0] for row in db.execute(
        "SELECT DISTINCT year FROM fact WHERE dataset_id='kostra_actuals' ORDER BY year"
    )]
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
    all_metrics = (
        [{**metric, "category": "finance"} for metric in METRICS]
        + [INCOME_EQUALIZATION_METRIC]
        + service_metrics
    )
    values = {metric["id"]: {} for metric in all_metrics}
    exact_successors = {
        row["source_entity_id"]: row["target_entity_id"]
        for row in db.execute(
            "SELECT source_entity_id, target_entity_id FROM entity_relation WHERE relation_type='exact_successor'"
        )
    }
    active_ids = {entity["id"] for entity in entities}

    def current_entity_id(entity_id: str) -> str:
        original_id = entity_id
        seen = set()
        while entity_id in exact_successors and entity_id not in seen:
            seen.add(entity_id)
            entity_id = exact_successors[entity_id]
        return entity_id if entity_id in active_ids else original_id

    for metric in all_metrics:
        if metric["id"] == INCOME_EQUALIZATION_METRIC["id"]:
            continue
        function_code = metric.get("functionCode", "")
        rows = db.execute(
            """SELECT entity_id, year, amount, per_capita FROM fact
               WHERE dataset_id='kostra_actuals' AND metric_code=?
                 AND function_code=? AND accounting_art_code=''""",
            (metric["code"], function_code),
        )
        for row in rows:
            export_entity_id = current_entity_id(row["entity_id"])
            year_values = values[metric["id"]].setdefault(str(row["year"]), {})
            point = {
                "amount": row["amount"], "perCapita": row["per_capita"]
            }
            # Behold original-ID for historiske detaljsider, og legg samme
            # observasjon på aktiv ID når Klass dokumenterer et rent kodebytte.
            year_values[row["entity_id"]] = point
            year_values[export_entity_id] = point

    income_equalization = {}
    equalization_rows = db.execute(
        """SELECT entity_id,year,population,tax_before_amount,tax_before_per_capita,
                  tax_before_national_ratio,equalization_amount,equalization_per_capita,
                  tax_after_amount,tax_after_per_capita,tax_after_national_ratio,
                  basis,source_url,source_period
             FROM income_equalization_fact
            ORDER BY year,entity_id"""
    )
    for row in equalization_rows:
        export_entity_id = current_entity_id(row["entity_id"])
        point = {
            "population": row["population"],
            "taxBefore": {
                "amount": row["tax_before_amount"],
                "perCapita": row["tax_before_per_capita"],
                "nationalRatio": row["tax_before_national_ratio"],
            },
            "equalization": {
                "amount": row["equalization_amount"],
                "perCapita": row["equalization_per_capita"],
            },
            "taxAfter": {
                "amount": row["tax_after_amount"],
                "perCapita": row["tax_after_per_capita"],
                "nationalRatio": row["tax_after_national_ratio"],
            },
            "basis": row["basis"],
            "sourceUrl": row["source_url"],
            "sourcePeriod": row["source_period"],
        }
        year_key = str(row["year"])
        year_values = income_equalization.setdefault(year_key, {})
        year_values[row["entity_id"]] = point
        year_values[export_entity_id] = point
        map_point = {
            "amount": row["equalization_amount"],
            "perCapita": row["equalization_per_capita"],
        }
        metric_values = values[INCOME_EQUALIZATION_METRIC["id"]].setdefault(year_key, {})
        metric_values[row["entity_id"]] = map_point
        metric_values[export_entity_id] = map_point

    source_rows = [dict(row) for row in db.execute("SELECT * FROM source_run ORDER BY source_table")]
    index = {
        "schemaVersion": 2,
        "updated": datetime.now(timezone.utc).isoformat(),
        "latestYear": latest_year,
        "years": years,
        "metrics": all_metrics,
        "entities": entities,
        "historicalEntities": historical_entities,
        "values": values,
        "incomeEqualization": income_equalization,
        "sources": source_rows,
    }
    _write_json(output / "index.json", index)
    _write_json(output / "boundaries.json", {"schemaVersion": 1, **boundaries})

    for entity in entities + historical_entities:
        if entity["kind"] not in {"municipality", "county"}:
            continue
        entity_latest_year = db.execute(
            "SELECT MAX(year) FROM fact WHERE dataset_id='kostra_actuals' AND entity_id=?",
            (entity["id"],),
        ).fetchone()[0] or latest_year
        detail = _entity_detail(db, entity, entity_latest_year)
        _write_json(output / "entities" / f"{entity['kind']}-{entity['code']}.json", detail)


def _labels(metadata: dict, dimension: str) -> dict[str, str]:
    category = metadata["dimension"][dimension]["category"]
    return category.get("label", {})


def _dimension_by_label(metadata: dict, label: str) -> str:
    for code in metadata["id"]:
        if metadata["dimension"][code].get("label", "").lower() == label.lower():
            return code
    raise KeyError(f"Fant ikke dimensjonen {label!r} i {metadata.get('id')}")


def _register_classification(
    db: sqlite3.Connection,
    metadata: dict,
    dimension: str,
    kind,
    storage_dimension: str | None = None,
) -> None:
    for code, label in _labels(metadata, dimension).items():
        resolved_kind = kind(code) if callable(kind) else kind
        resolved_dimension = storage_dimension or (
            "function" if "funksjon" in dimension.lower() else "accounting_art"
        )
        db.execute(
            "INSERT OR REPLACE INTO classification(dimension, code, label, kind) VALUES (?,?,?,?)",
            (resolved_dimension, code, label, resolved_kind),
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
        """INSERT INTO fact(dataset_id,entity_id,year,metric_code,function_code,accounting_art_code,amount,per_capita,source_table)
           VALUES ('kostra_actuals',?,?,?,?,?,?,?,?)
           ON CONFLICT(dataset_id,entity_id,year,metric_code,function_code,accounting_art_code,source_table)
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
    periods = [
        int(code[:4]) for code in _ordered_codes(metadata["dimension"]["Tid"])
        if re.fullmatch(r"\d{4}(?:M\d{2})?", code)
    ]
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


def _import_financial_details(
    db: sqlite3.Connection, kind: str, table: str, metadata: dict, cube: dict
) -> None:
    """Bakoverkompatibel adapter for resultatoppstillingen."""
    _import_statement_details(db, kind, table, metadata, cube, "art", "result")


def _import_statement_details(
    db: sqlite3.Connection,
    kind: str,
    table: str,
    metadata: dict,
    cube: dict,
    dimension_label: str,
    statement: str,
) -> None:
    """Importer én offisiell regnskapsoppstilling uten å endre fortegn.

    Oppstillingstabellene publiserer beløp i 1000 kroner, men ikke
    kroner per innbygger. Folketallet utledes fra de allerede importerte
    KOSTRA-parene for samme enhet og år; mangler grunnlaget, beholdes
    per-innbyggerverdien som manglende i stedet for å settes til null.
    """
    if statement not in {"result", "investment", "balance"}:
        raise ValueError(f"Ukjent regnskapsoppstilling: {statement}")
    region_dim = TABLES[kind]["region"]
    value_dim = _dimension_by_label(metadata, dimension_label)
    for row in iter_jsonstat(cube):
        if row["value"] is None:
            continue
        entity_id = _entity_id(kind, row[region_dim])
        year = int(row["Tid"])
        amount = float(row["value"])
        population = _population_for_year(db, entity_id, year)
        _upsert_fact(
            db, entity_id, year, row[value_dim], table,
            amount=amount,
            per_capita=amount * 1000 / population if population else None,
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


def region_codes_for_import(metadata: dict, dimension: str, current: list[str], comparisons: list[str]) -> list[str]:
    """Velg aktive, historiske og sammenligningsregioner som tabellen faktisk tilbyr."""
    available = _labels(metadata, dimension)
    active = [code for code in current if code in available]
    historical = [code for code in available if code.isdigit() and code not in active]
    return active + historical + [code for code in comparisons if code in available]


def detail_region_codes_for_import(
    db: sqlite3.Connection, metadata: dict, dimension: str, kind: str, current: list[str]
) -> list[str]:
    """Ta med alle publiserte enheter, men hold ulike geografier adskilt.

    Eksporten kan følge rene kodebytter i samme tidsserie. Reelle
    grenseendringer importeres også, men beholdes i egne historiske filer.
    """
    available = _labels(metadata, dimension)
    result = []
    candidates = list(current) + [
        row[0] for row in db.execute(
            """SELECT code FROM entity WHERE kind=?
               ORDER BY active DESC, COALESCE(valid_to,9999) DESC, code""",
            (kind,),
        )
    ]
    for code in candidates:
        if code in available and code not in result:
            result.append(code)
    return result


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


def classify_code_changes(code_changes: list[dict], kind: str) -> list[tuple[str, str, int, str]]:
    """Skill rene kodebytter fra sammenslåinger/delinger i Klass-endringer."""
    candidates = [
        row for row in code_changes
        if row.get("oldCode") and row.get("newCode") and row["oldCode"] != row["newCode"]
    ]
    source_targets = defaultdict(set)
    target_sources = defaultdict(set)
    for row in candidates:
        key = row["changeOccurred"]
        source_targets[(key, row["oldCode"])].add(row["newCode"])
        target_sources[(key, row["newCode"])].add(row["oldCode"])

    relations = []
    for row in candidates:
        date = row["changeOccurred"]
        relation_type = "exact_successor" if (
            len(source_targets[(date, row["oldCode"])]) == 1
            and len(target_sources[(date, row["newCode"])]) == 1
        ) else "boundary_change"
        relations.append((
            _entity_id(kind, row["oldCode"]),
            _entity_id(kind, row["newCode"]),
            int(date[:4]),
            relation_type,
        ))
    return relations


def _attach_boundary_changes(db: sqlite3.Connection, client: SsbClient, latest_year: int) -> None:
    for kind, classification_id in (("municipality", 131), ("county", 104)):
        data = client.json(
            f"{KLASS_API}/classifications/{classification_id}/changes"
            f"?from=2014-01-01&to={latest_year + 1}-12-31",
            f"klass-{kind}-changes.json",
        )
        for source_id, target_id, change_year, relation_type in classify_code_changes(
            data.get("codeChanges", []), kind
        ):
            if source_id == target_id:
                continue
            exists = db.execute(
                "SELECT COUNT(*) FROM entity WHERE id IN (?,?)", (source_id, target_id)
            ).fetchone()[0]
            if exists == 2:
                db.execute(
                    "INSERT OR REPLACE INTO entity_relation VALUES (?,?,?,?,?)",
                    (source_id, target_id, change_year, relation_type, "SSB Klass"),
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
        tax_meta = client.metadata(TAX_TABLE)
        for kind in ("county", "municipality"):
            config = TABLES[kind]
            overview_meta = client.metadata(config["overview"])
            financial_meta = client.metadata(config["financial_detail"])
            investment_meta = client.metadata(config["investment_detail"])
            balance_meta = client.metadata(config["balance_detail"])
            service_meta = client.metadata(config["service"])
            detail_meta = client.metadata(config["detail"])
            metadata_by_kind[kind] = (
                overview_meta, financial_meta, investment_meta, balance_meta,
                service_meta, detail_meta,
            )
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
            financial_art_dim = _dimension_by_label(financial_meta, "art")
            investment_art_dim = _dimension_by_label(investment_meta, "art")
            balance_chapter_dim = _dimension_by_label(balance_meta, "balansedata")
            _register_classification(
                db, financial_meta, financial_art_dim, "statement_line", "statement_result"
            )
            _register_classification(
                db, investment_meta, investment_art_dim, "statement_line", "statement_investment"
            )
            _register_classification(
                db, balance_meta, balance_chapter_dim, "balance_chapter", "balance_chapter"
            )
            for table, meta in [
                (config["overview"], overview_meta),
                (config["financial_detail"], financial_meta),
                (config["investment_detail"], investment_meta),
                (config["balance_detail"], balance_meta),
                (config["service"], service_meta),
                (config["detail"], detail_meta),
            ]:
                _record_source(db, table, meta)
        _record_source(db, TAX_TABLE, tax_meta)

        _attach_peer_groups(db, client)
        _attach_boundary_changes(db, client, latest_year)
        db.commit()

        for kind in ("county", "municipality"):
            config = TABLES[kind]
            (
                overview_meta, financial_meta, investment_meta, balance_meta,
                service_meta, detail_meta,
            ) = metadata_by_kind[kind]
            region = config["region"]
            current = [entity["code"] for entity in geo_entities[kind]]
            comparison = ["EAFK"] if kind == "county" else ["EAK"] + [f"EKG{i:02d}" for i in range(1, 18)]
            # Behold utgåtte koder og serier på geografien SSB faktisk
            # publiserte. Ulike grenser blir aldri kunstig sydd sammen.
            overview_regions = region_codes_for_import(overview_meta, region, current, comparison)
            service_regions = region_codes_for_import(service_meta, region, current, comparison)

            concept_dim = _dimension_by_label(overview_meta, "regnskapsbegrep")
            overview_concepts = [metric["code"] for metric in OVERVIEW_METRICS]
            if kind == "municipality":
                overview_concepts.append(STATE_BLOCK_GRANT_CODE)
            overview_cube = client.data(config["overview"], {
                region: overview_regions,
                concept_dim: overview_concepts,
                "ContentsCode": ["*"],
                "Tid": ["*"],
            })
            _import_overview(db, kind, config["overview"], overview_meta, overview_cube)

            financial_regions = region_codes_for_import(
                financial_meta, region, current, comparison
            )
            financial_art = _dimension_by_label(financial_meta, "art")
            financial_cube = client.data(config["financial_detail"], {
                region: financial_regions,
                financial_art: ["*"],
                "ContentsCode": ["*"],
                "Tid": ["*"],
            })
            _import_statement_details(
                db, kind, config["financial_detail"], financial_meta,
                financial_cube, "art", "result",
            )

            for statement, meta, table_key, dimension_label in [
                ("investment", investment_meta, "investment_detail", "art"),
                ("balance", balance_meta, "balance_detail", "balansedata"),
            ]:
                statement_regions = region_codes_for_import(meta, region, current, [])
                statement_dimension = _dimension_by_label(meta, dimension_label)
                statement_cube = client.data(config[table_key], {
                    region: statement_regions,
                    statement_dimension: ["*"],
                    "ContentsCode": ["*"],
                    "Tid": ["*"],
                })
                _import_statement_details(
                    db, kind, config[table_key], meta, statement_cube,
                    dimension_label, statement,
                )

            service_function = _dimension_by_label(service_meta, "funksjon")
            service_art = _dimension_by_label(service_meta, "art")
            service_contents = [
                code for code, label in _labels(service_meta, "ContentsCode").items()
                if "andel" not in label.lower()
            ]
            for region_chunk in _chunks(service_regions):
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
            detail_regions = detail_region_codes_for_import(
                db, detail_meta, region, kind, current
            )
            detail_functions = [
                code for code in _labels(detail_meta, detail_function)
                if re.fullmatch(r"\d{3}", code)
            ]
            latest_detail_year = max(_ordered_codes(detail_meta["dimension"]["Tid"]), key=int)
            detail_cache_revision = detail_meta.get("updated") or latest_detail_year
            # A090/A099 forklarer sosialkostnadene på laveste tilgjengelige
            # artsnivå. A710 gjør det mulig å avstemme AG16 (etter refusjon)
            # mot brutto lønn og sosiale kostnader i resultatoppstillingen.
            expense_detail_arts = sorted(EXPENSE_ARTS | {"AGD10", "A090", "A099", "A710"})
            # Bare gjensidig utelukkende hovedarter og kontrolltotalen hentes
            # for alle år. Å hente alle summer og underarter ville mangedoblet
            # datamengden og gitt dobbelttelling i klienten.
            for region_chunk in _chunks(detail_regions):
                selection = {
                    region: region_chunk,
                    detail_function: detail_functions,
                    detail_art: expense_detail_arts,
                    "ContentsCode": ["*"],
                    "Tid": ["*"],
                }
                if config["scope"] in detail_meta["id"]:
                    selection[config["scope"]] = ["A"]
                cube = client.data(
                    config["detail"], selection, cache_revision=detail_cache_revision
                )
                _import_details(db, kind, config["detail"], detail_meta, cube)
                db.commit()

            # Inntektsarter må følge årvelgeren på samme måte som utgiftsarter.
            # Fem gjensidig utelukkende grupper er små nok til hele tidsserien.
            for region_chunk in _chunks(detail_regions):
                selection = {
                    region: region_chunk,
                    detail_function: detail_functions,
                    detail_art: sorted(REVENUE_ARTS),
                    "ContentsCode": ["*"],
                    "Tid": ["*"],
                }
                if config["scope"] in detail_meta["id"]:
                    selection[config["scope"]] = ["A"]
                cube = client.data(
                    config["detail"], selection, cache_revision=detail_cache_revision
                )
                _import_details(db, kind, config["detail"], detail_meta, cube)
                db.commit()

        _sync_block_grant_flows(db)
        available_tax_regions = _labels(tax_meta, "Region")
        tax_regions = [
            row[0] for row in db.execute(
                "SELECT code FROM entity WHERE kind='municipality' ORDER BY code"
            ) if row[0] in available_tax_regions
        ]
        kostra_years = {
            row[0] for row in db.execute(
                "SELECT DISTINCT year FROM fact WHERE dataset_id='kostra_actuals'"
            )
        }
        available_tax_periods = set(_ordered_codes(tax_meta["dimension"]["Tid"]))
        tax_periods = [
            f"{year}M12" for year in sorted(kostra_years)
            if f"{year}M12" in available_tax_periods
        ]
        for region_chunk in _chunks(tax_regions):
            tax_cube = client.data(TAX_TABLE, {
                "Region": region_chunk,
                "Skatteart": list(TAX_FLOW_CATEGORIES),
                "ContentsCode": ["Skatt"],
                "Tid": tax_periods,
            })
            _import_tax_flows(db, tax_meta, tax_cube)
            db.commit()

        _import_income_equalization_sources(db, client, kostra_years)
        _import_green_book_sources(db, client, kostra_years)
        db.commit()

        write_frontend_data(db, output, boundaries)
        return {
            "entities": db.execute("SELECT COUNT(*) FROM entity").fetchone()[0],
            "latestYear": db.execute(
                "SELECT MAX(year) FROM fact WHERE dataset_id='kostra_actuals'"
            ).fetchone()[0],
        }
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
