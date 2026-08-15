"""Atferdstester for KOSTRA-modulens offentlige ETL-grensesnitt."""
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kostra import (  # noqa: E402
    METRICS,
    create_database,
    entity_from_region,
    iter_jsonstat,
    write_frontend_data,
)


def _cube():
    return {
        "class": "dataset",
        "id": ["Region", "ContentsCode", "Tid"],
        "size": [2, 2, 2],
        "dimension": {
            "Region": {"category": {
                "index": {"0301": 0, "EAK": 1},
                "label": {"0301": "Oslo", "EAK": "Landet"},
            }},
            "ContentsCode": {"category": {
                "index": {"sum": 0, "person": 1},
                "label": {"sum": "Beløp", "person": "Per innbygger"},
            }},
            "Tid": {"category": {
                "index": {"2024": 0, "2025": 1},
                "label": {"2024": "2024", "2025": "2025"},
            }},
        },
        "value": [10, 11, 100, 101, 20, None, 200, 201],
        "status": [None, None, None, None, None, ".", None, None],
    }


def test_jsonstat_blir_til_navngitte_rader_uten_aa_flytte_nullverdier():
    rows = list(iter_jsonstat(_cube()))
    assert rows[0] == {"Region": "0301", "ContentsCode": "sum", "Tid": "2024", "value": 10, "status": None}
    assert rows[5] == {"Region": "EAK", "ContentsCode": "sum", "Tid": "2025", "value": None, "status": "."}
    assert rows[-1]["value"] == 201


def test_regioner_beholder_kode_og_gyldighetsperiode():
    current = entity_from_region("3103", "Moss", "municipality", latest_year=2025)
    historical = entity_from_region("3002", "Moss (2020-2023)", "municipality", latest_year=2025)
    old = entity_from_region("0104", "Moss (-2019)", "municipality", latest_year=2025)
    group = entity_from_region("EKG11", "KOSTRA-gruppe 11", "municipality", latest_year=2025)

    assert current["id"] == "municipality:3103" and current["active"] is True
    assert historical["valid_from"] == 2020 and historical["valid_to"] == 2023
    assert old["valid_to"] == 2019
    assert group["kind"] == "peer_group"


def test_frontenddata_har_kartverdier_og_lazy_detaljfil(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    entities = [
        ("country:EAK", "EAK", "Landet", "country", None, None, 1, None, None, "Landet"),
        ("peer_group:EKG11", "EKG11", "KOSTRA-gruppe 11", "peer_group", None, None, 1, 2020, None, "KOSTRA-gruppe 11"),
        ("county:03", "0300", "Oslo", "county", None, None, 1, 2024, None, "Oslo"),
        ("municipality:0301", "0301", "Oslo", "municipality", "county:03", "peer_group:EKG11", 1, 2024, None, "Oslo"),
    ]
    db.executemany("INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)", entities)
    for entity_id, value in [("municipality:0301", 1000), ("country:EAK", 900)]:
        db.execute(
            "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?)",
            (entity_id, 2025, "AGD13", "", "", value, value * 10, "12137"),
        )
    db.execute(
        "INSERT INTO classification VALUES (?,?,?,?)",
        ("function", "FGK8b", "Grunnskole", "service_area"),
    )
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?)",
        ("municipality:0301", 2025, "AGD10", "FGK8b", "", 400, 4000, "12362"),
    )
    db.commit()

    out = tmp_path / "data"
    write_frontend_data(db, out, boundaries={"county": {}, "municipality": {}})
    index = json.loads((out / "kostra" / "index.json").read_text(encoding="utf-8"))
    detail = json.loads((out / "kostra" / "entities" / "municipality-0301.json").read_text(encoding="utf-8"))

    assert index["values"]["revenues"]["2025"]["municipality:0301"]["amount"] == 1000
    assert index["values"]["revenues"]["2025"]["municipality:0301"]["perCapita"] == 10000
    assert detail["services"][0]["code"] == "FGK8b"
    assert any(m["id"] == "debt" for m in METRICS)
