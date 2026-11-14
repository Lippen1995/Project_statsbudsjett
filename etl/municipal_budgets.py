"""Build the reviewed Stavanger budget snapshot from public Framsikt tables.

Use --source-dir to replay downloaded originals. Without it, fetch the exact
publications listed below. Review changed tables and links before committing.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.request import urlopen


FRAMSIKT = "https://pub.framsikt.net"
OUTPUT = Path(__file__).resolve().parents[1] / "web/src/sider/stavanger-budget.json"

PUBLICATIONS = {
    "accounts-2025": {
        "label": "Årsregnskap 2025",
        "path": "2025/stavanger/mr-202512-rapport_2025",
        "section": "accounting",
        "route": "acc/summary/accounting",
        "columns": {
            "column2": (2024, "actual", "Regnskap 2024"),
            "column3": (2025, "original", "Oppr. bud. 2025"),
            "column4": (2025, "adjusted", "Justert bud. 2025"),
            "column5": (2025, "actual", "Regnskap 2025"),
        },
        "tables": {
            "operations": ("accounting3_2020_", "2025-accounting3_2020_"),
            "areas": ("accounting1b_2020_", "2025-accounting1b_2020_"),
            "investment": ("accounting2a_2020_", "2025-accounting2a_2020_"),
        },
    },
    "adopted-2026": {
        "label": "Vedtatt HØP 2026–2029",
        "date": "2025-12-15",
        "path": "2026/stavanger/bm-2026-hop_26-29_endelig",
        "section": "budprp",
        "route": "generic/summary/budprp",
        "columns": {
            "column3": (2026, "original", "Øk.plan 2026"),
            **{f"column{i}": (year, "adoptedPlan", f"Øk.plan {year}")
               for i, year in enumerate(range(2027, 2030), 4)},
        },
        "tables": {
            "operations": ("budgetforms32020", "2026-summary-budprp-budgetforms32020"),
            "areas": ("budgetforms1b2020", "2026-summary-budprp-budgetforms1b2020"),
            "investment": ("budgetforms2a2020", "2026-budgetforms2a2020"),
        },
    },
    "proposal-2027": {
        "label": "Forslag til HØP 2027–2030",
        "date": "2026-10-23",
        "path": "2027/stavanger/bm-2027-hop_27-30",
        "section": "budprp",
        "route": "generic/summary/budprp",
        "columns": {
            "column2": (2026, "reference", "Oppr. budsjett 2026"),
            "column3": (2027, "proposal", "Øk.plan 2027"),
            **{f"column{i}": (year, "proposedPlan", f"Øk.plan {year}")
               for i, year in enumerate(range(2028, 2031), 4)},
        },
        "tables": {
            "operations": ("budgetforms32020", "2027-summary-budprp-budgetforms32020"),
            "areas": ("budgetforms1b2020", "2027-summary-budprp-budgetforms1b2020"),
            "investment": ("budgetforms2a2020", "2027-budgetforms2a2020"),
        },
    },
}

# Match only within the same statutory statement. Local budget areas keep
# Stavanger's labels and are never inferred from similar KOSTRA names.
GROUPS = {
    "operations": ("Drift etter art", "§ 5-6", "Sum driftsutgifter"),
    "areas": ("Lokale bevilgninger", "§ 5-4 andre ledd", "Sum bevilgninger drift, netto"),
    "investment": ("Investering og finansiering", "§ 5-5 første ledd", "Sum investeringsutgifter"),
}


def plain(value):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", "", value)).split())


def amount(value):
    value = plain(value).replace(" ", "").replace("−", "-")
    if value in ("", "-", "–", "—", ".."):
        return None
    if not re.fullmatch(r"-?\d+", value):
        raise ValueError(f"Unexpected amount: {value!r}")
    return int(value)


def read_table(raw, expected):
    table = json.loads(raw.decode("utf-8-sig"))
    headers = {col["field"]: plain(col["title"])
               for group in table["column"] for col in group.get("columns", [group])}
    for field, (_, _, label) in expected.items():
        if headers.get(field) != label:
            raise ValueError(f"{field}: expected {label!r}, found {headers.get(field)!r}")
    rows = {}
    for row in table["data"]:
        label = plain(row["column0"])
        if not label:
            continue
        values = [amount(row.get(field, "")) for field in expected]
        if not any(value is not None for value in values):
            continue
        if label in rows:
            raise ValueError(f"Duplicate row: {label}")
        rows[label] = values
    return rows


def build(source_dir=None):
    documents = {}
    groups = {}
    for key, (label, section, default) in GROUPS.items():
        tables = {}
        for doc, source in PUBLICATIONS.items():
            base = f"{FRAMSIKT}/{source['path']}"
            documents[doc] = {"label": source["label"],
                              "url": f"{base}#/{source['route']}",
                              **({"date": source["date"]} if "date" in source else {})}
            table_id, snapshot = source["tables"][key]
            url = f"{base}/content/data/summary/{source['section']}/{table_id}.json"
            if source_dir:
                raw = (source_dir / f"{snapshot}.json").read_bytes()
            else:
                with urlopen(url, timeout=25) as response:
                    raw = response.read()
            expected = source["columns"]
            tables[doc] = read_table(raw, expected)
            if default not in tables[doc]:
                raise ValueError(f"{doc} is missing {default}")
            groups.setdefault(key, {"label": label, "section": section,
                                    "default": default, "sources": {}, "rows": {}})
            groups[key]["sources"][doc] = {
                "url": url, "sha256": hashlib.sha256(raw).hexdigest(),
                "columns": [{"year": year, "kind": kind, "label": heading}
                            for year, kind, heading in expected.values()],
            }
        # Use rows present in all three publications. For local areas, stop
        # after the total: following rows are adjustments, not budget areas.
        for row in tables["accounts-2025"]:
            if all(row in table for table in tables.values()):
                groups[key]["rows"][row] = {doc: table[row] for doc, table in tables.items()}
            if key == "areas" and row == default:
                break
    return {"municipality": "1103", "unit": "1000 NOK",
            "documents": documents, "groups": groups}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    dataset = build(args.source_dir)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n")
