"""Atferdstester for KOSTRA-modulens offentlige ETL-grensesnitt."""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kostra import (  # noqa: E402
    METRICS,
    SsbClient,
    TAX_FLOW_CATEGORIES,
    _import_details,
    _import_overview,
    _import_tax_flows,
    _sync_block_grant_flows,
    classify_code_changes,
    create_database,
    detail_region_codes_for_import,
    entity_from_region,
    iter_jsonstat,
    region_codes_for_import,
    write_frontend_data,
)


# Offisielt publisert i SSB-tabell 12137 for Oslo, 2024 (1000 kroner / kroner
# per innbygger). Dette lille uttrekket gjør testen deterministisk samtidig som
# parser og normalisering av beløp/per-innbygger avstemmes mot Statbank.
OSLO_2024_REVENUES = {"amount": 86_642_212, "per_capita": 119_624}
BERGEN_2024_STATE_TAX_MILL = {
    "08": 10_106.2,
    "09": 15_036.9,
    "10": 16_656.2,
    "11": 8_396.4,
}


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


def test_importlisten_beholder_historiske_regioner_uten_aa_blande_koder():
    metadata = {"dimension": {"Region": {"category": {"label": {
        "3103": "Moss", "3002": "Moss (2020-2023)", "0104": "Moss (-2019)", "EAK": "Landet",
    }}}}}

    assert region_codes_for_import(metadata, "Region", ["3103"], ["EAK"]) == [
        "3103", "3002", "0104", "EAK",
    ]


def test_detaljimport_foelger_rene_kodebytter_men_ikke_grenseendringer(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.executemany("INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)", [
        ("municipality:0104", "0104", "Moss", "municipality", None, None, 0, None, 2019, "Moss"),
        ("municipality:3002", "3002", "Moss", "municipality", None, None, 0, 2020, 2023, "Moss"),
        ("municipality:3103", "3103", "Moss", "municipality", None, None, 1, 2024, None, "Moss"),
    ])
    db.executemany("INSERT INTO entity_relation VALUES (?,?,?,?,?)", [
        ("municipality:3002", "municipality:3103", 2024, "exact_successor", "SSB Klass"),
        ("municipality:0104", "municipality:3002", 2020, "boundary_change", "SSB Klass"),
    ])
    metadata = {"dimension": {"Region": {"category": {"label": {
        "0104": "Moss (-2019)", "3002": "Moss (2020-2023)", "3103": "Moss",
    }}}}}

    assert detail_region_codes_for_import(
        db, metadata, "Region", "municipality", ["3103"]
    ) == ["3103", "3002", "0104"]


def test_detaljimport_bruker_full_offisiell_fylkeskode(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("county:46", "4600", "Vestland", "county", None, None, 1, None, None, "Vestland"),
    )
    metadata = {"dimension": {"Region": {"category": {"label": {
        "4600": "Vestland fylkeskommune",
    }}}}}

    assert detail_region_codes_for_import(
        db, metadata, "Region", "county", ["4600"]
    ) == ["4600"]


def test_ssb_cache_skiller_rullerende_uttrekk_paa_siste_publiserte_aar(tmp_path, monkeypatch):
    client = SsbClient(cache_dir=tmp_path)
    calls = []

    class Response:
        def json(self):
            return {"call": len(calls)}

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return Response()

    monkeypatch.setattr(client, "_request", fake_request)
    selection = {"Region": ["4601"], "Tid": ["*"]}

    assert client.data("12367", selection, cache_revision=2025) == {"call": 1}
    assert client.data("12367", selection, cache_revision=2025) == {"call": 1}
    assert client.data("12367", selection, cache_revision=2026) == {"call": 2}
    assert len(calls) == 2


def test_regnskapsart_mapping_beholder_aar_fortegn_og_manglende_verdi(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:4601", "4601", "Bergen", "municipality", None, None, 1, None, None, "Bergen"),
    )
    metadata = {
        "id": ["KOKkommuneregion0000", "Funksjon", "Art", "ContentsCode", "Tid"],
        "dimension": {
            "KOKkommuneregion0000": {"label": "Region"},
            "Funksjon": {"label": "Funksjon"},
            "Art": {"label": "Art"},
            "ContentsCode": {"label": "Statistikkvariabel"},
            "Tid": {"label": "År"},
        },
    }
    cube = {
        "id": metadata["id"], "size": [1, 1, 1, 1, 3],
        "dimension": {
            "KOKkommuneregion0000": {"category": {"index": {"4601": 0}}},
            "Funksjon": {"category": {"index": {"222": 0}}},
            "Art": {"category": {"index": {"AGD51": 0}}},
            "ContentsCode": {"category": {"index": {"Belop": 0}}},
            "Tid": {"category": {"index": {"2023": 0, "2024": 1, "2025": 2}}},
        },
        "value": [12, None, -3],
    }

    _import_details(db, "municipality", "12367", metadata, cube)

    assert [tuple(row) for row in db.execute(
        "SELECT year,amount FROM fact ORDER BY year"
    )] == [(2023, 12.0), (2025, -3.0)]


def test_klass_skiller_kodebytte_fra_sammenslaaing():
    changes = [
        {"oldCode": "0104", "newCode": "3002", "changeOccurred": "2020-01-01"},
        {"oldCode": "0136", "newCode": "3002", "changeOccurred": "2020-01-01"},
        {"oldCode": "3002", "newCode": "3103", "changeOccurred": "2024-01-01"},
    ]

    relations = classify_code_changes(changes, "municipality")

    assert relations == [
        ("municipality:0104", "municipality:3002", 2020, "boundary_change"),
        ("municipality:0136", "municipality:3002", 2020, "boundary_change"),
        ("municipality:3002", "municipality:3103", 2024, "exact_successor"),
    ]


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
            "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
            ("kostra_actuals", entity_id, 2025, "AGD13", "", "", value, value * 10, "12137"),
        )
    db.execute(
        "INSERT INTO classification VALUES (?,?,?,?)",
        ("function", "FGK8b", "Grunnskole", "service_area"),
    )
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
        ("kostra_actuals", "municipality:0301", 2025, "AGD10", "FGK8b", "", 400, 4000, "12362"),
    )
    db.execute(
        "INSERT INTO dataset VALUES (?,?,?,?)",
        ("municipal_budget", "Kommunebudsjett", "budget", "future-import"),
    )
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
        ("municipal_budget", "municipality:0301", 2025, "AGD13", "", "", 9999, 99999, "budget-test"),
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


def test_frontenddata_beholder_regnskapsarter_per_funksjon_og_aar(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:4601", "4601", "Bergen", "municipality", None, None, 1, None, None, "Bergen"),
    )
    db.executemany("INSERT INTO classification VALUES (?,?,?,?)", [
        ("function", "222", "Skolelokaler", "function"),
        ("accounting_art", "AG16", "Lønnsutgifter fratrukket sykelønnsrefusjon", "accounting_art"),
        ("accounting_art", "AGD10", "Brutto driftsutgifter på funksjon/tjenesteområde", "accounting_art"),
    ])
    db.executemany("INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)", [
        ("kostra_actuals", "municipality:4601", 2024, "accounting_art", "222", "AG16", 100, None, "12367"),
        ("kostra_actuals", "municipality:4601", 2025, "accounting_art", "222", "AG16", 110, None, "12367"),
        ("kostra_actuals", "municipality:4601", 2024, "accounting_art", "222", "AGD10", 100, None, "12367"),
        ("kostra_actuals", "municipality:4601", 2025, "accounting_art", "222", "AGD10", 110, None, "12367"),
    ])
    db.commit()

    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})
    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-4601.json")
        .read_text(encoding="utf-8")
    )

    assert detail["accountingArts"]["222"] == [
        {
            "code": "AG16",
            "name": "Lønnsutgifter fratrukket sykelønnsrefusjon",
            "values": {"2024": {"amount": 100.0}, "2025": {"amount": 110.0}},
        },
        {
            "code": "AGD10",
            "name": "Brutto driftsutgifter på funksjon/tjenesteområde",
            "values": {"2024": {"amount": 100.0}, "2025": {"amount": 110.0}},
        },
    ]


def test_ssb_12137_avstemmes_mot_publiserte_driftsinntekter_for_oslo_2024(tmp_path):
    metadata = {
        "id": ["KOKkommuneregion0000", "KOKregnskapsbegrep0000", "ContentsCode", "Tid"],
        "dimension": {
            "KOKkommuneregion0000": {"label": "Region", "category": {"label": {"0301": "Oslo"}}},
            "KOKregnskapsbegrep0000": {
                "label": "Regnskapsbegrep",
                "category": {"label": {"AGD13": "Brutto driftsinntekter i alt"}},
            },
            "ContentsCode": {
                "label": "Statistikkvariabel",
                "category": {"label": {
                    "Belop": "Brutto driftsinntekter i alt (1000 kr)",
                    "PerInnbygger": "Brutto driftsinntekter per innbygger (kr)",
                }},
            },
            "Tid": {"label": "År", "category": {"index": {"2024": 0}, "label": {"2024": "2024"}}},
        },
    }
    cube = {
        "id": metadata["id"],
        "size": [1, 1, 2, 1],
        "dimension": {
            **metadata["dimension"],
            "KOKkommuneregion0000": {"category": {"index": {"0301": 0}}},
            "KOKregnskapsbegrep0000": {"category": {"index": {"AGD13": 0}}},
            "ContentsCode": {"category": {"index": {"Belop": 0, "PerInnbygger": 1}}},
        },
        "value": [OSLO_2024_REVENUES["amount"], OSLO_2024_REVENUES["per_capita"]],
    }
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:0301", "0301", "Oslo", "municipality", None, None, 1, None, None, "Oslo"),
    )

    _import_overview(db, "municipality", "12137", metadata, cube)

    actual = db.execute(
        "SELECT amount, per_capita FROM fact WHERE entity_id=? AND year=? AND metric_code=?",
        ("municipality:0301", 2024, "AGD13"),
    ).fetchone()
    assert dict(actual) == OSLO_2024_REVENUES


def test_stat_kommune_strommer_skiller_kommuneorganisasjonen_fra_geografien(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:4601", "4601", "Bergen", "municipality", None, None, 1, None, None, "Bergen"),
    )
    # KOSTRA lagrer beløp i 1000 kroner. Forholdet mellom beløp og per
    # innbygger gir 100 innbyggere i dette deterministiske uttrekket.
    db.executemany("INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)", [
        ("kostra_actuals", "municipality:4601", 2025, "AGD13", "", "", 1_000, 10_000, "12137"),
        ("kostra_actuals", "municipality:4601", 2025, "A800", "", "", 200, 2_000, "12137"),
    ])
    _sync_block_grant_flows(db)

    metadata = {
        "id": ["Region", "Skatteart", "ContentsCode", "Tid"],
        "dimension": {
            "Region": {"category": {"label": {"4601": "Bergen"}}},
            "Skatteart": {"category": {"label": {
                "08": "Medlemsavgift til folketrygda",
                "09": "Arbeidsgjevaravgift til folketrygda",
                "10": "Fellesskatt",
                "11": "Ordinær skatt på formue og inntekt, stat",
            }}},
            "ContentsCode": {"category": {
                "label": {"Skatt": "Skatt"},
                "unit": {"Skatt": {"base": "mill. kr", "decimals": 1}},
            }},
            "Tid": {"category": {"label": {"2025M12": "2025M12"}}},
        },
    }
    cube = {
        "id": metadata["id"],
        "size": [1, 4, 1, 1],
        "dimension": {
            "Region": {"category": {"index": {"4601": 0}}},
            "Skatteart": {"category": {"index": {"08": 0, "09": 1, "10": 2, "11": 3}}},
            "ContentsCode": {"category": {"index": {"Skatt": 0}}},
            "Tid": {"category": {"index": {"2025M12": 0}}},
        },
        # SSB 07022 publiserer millioner kroner; lokalmodellen bruker 1000 kr.
        "value": [1.0, 2.0, 3.0, 4.0],
    }
    _import_tax_flows(db, metadata, cube)

    rows = db.execute(
        """SELECT c.direction, c.actor_scope, f.category_code, f.amount, f.per_capita,
                  f.basis, f.source_period
             FROM public_flow_fact f
             JOIN public_flow_category c ON c.code=f.category_code
            WHERE f.entity_id='municipality:4601'
            ORDER BY f.category_code"""
    ).fetchall()

    assert [dict(row) for row in rows] == [
        {"direction": "to_state", "actor_scope": "mixed", "category_code": "common_tax", "amount": 3000.0, "per_capita": 30000.0, "basis": "actual", "source_period": "2025M12"},
        {"direction": "to_state", "actor_scope": "employers", "category_code": "employer_national_insurance", "amount": 2000.0, "per_capita": 20000.0, "basis": "actual", "source_period": "2025M12"},
        {"direction": "to_state", "actor_scope": "residents", "category_code": "national_insurance_member", "amount": 1000.0, "per_capita": 10000.0, "basis": "actual", "source_period": "2025M12"},
        {"direction": "from_state", "actor_scope": "municipal_government", "category_code": "state_block_grant", "amount": 200.0, "per_capita": 2000.0, "basis": "actual", "source_period": "2025"},
        {"direction": "to_state", "actor_scope": "residents", "category_code": "state_income_wealth_tax", "amount": 4000.0, "per_capita": 40000.0, "basis": "actual", "source_period": "2025M12"},
    ]

    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})
    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-4601.json")
        .read_text(encoding="utf-8")
    )
    assert detail["stateFlows"]["incoming"][0]["values"]["2025"]["amount"] == 200
    assert [item["code"] for item in detail["stateFlows"]["outgoing"]] == [
        "national_insurance_member", "employer_national_insurance",
        "common_tax", "state_income_wealth_tax",
    ]


def test_skatteimport_bruker_bare_desember_fordi_tabellen_er_akkumulert(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:4601", "4601", "Bergen", "municipality", None, None, 1, None, None, "Bergen"),
    )
    metadata = {
        "id": ["Region", "Skatteart", "ContentsCode", "Tid"],
        "dimension": {"ContentsCode": {"category": {
            "unit": {"Skatt": {"base": "mill. kr", "decimals": 1}},
        }}},
    }
    cube = {
        "id": metadata["id"], "size": [1, 1, 1, 2],
        "dimension": {
            "Region": {"category": {"index": {"4601": 0}}},
            "Skatteart": {"category": {"index": {"08": 0}}},
            "ContentsCode": {"category": {"index": {"Skatt": 0}}},
            "Tid": {"category": {"index": {"2025M11": 0, "2025M12": 1}}},
        },
        "value": [9.0, 10.0],
    }

    _import_tax_flows(db, metadata, cube)

    assert db.execute("SELECT amount FROM public_flow_fact").fetchone()[0] == 10_000


def test_ssb_07022_avstemmes_mot_publiserte_bergenverdier_for_2024(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:4601", "4601", "Bergen", "municipality", None, None, 1, None, None, "Bergen"),
    )
    metadata = {
        "id": ["Region", "Skatteart", "ContentsCode", "Tid"],
        "dimension": {"ContentsCode": {"category": {
            "unit": {"Skatt": {"base": "mill. kr", "decimals": 1}},
        }}},
    }
    cube = {
        "id": metadata["id"], "size": [1, 4, 1, 1],
        "dimension": {
            "Region": {"category": {"index": {"4601": 0}}},
            "Skatteart": {"category": {"index": {
                code: i for i, code in enumerate(BERGEN_2024_STATE_TAX_MILL)
            }}},
            "ContentsCode": {"category": {"index": {"Skatt": 0}}},
            "Tid": {"category": {"index": {"2024M12": 0}}},
        },
        "value": list(BERGEN_2024_STATE_TAX_MILL.values()),
    }

    _import_tax_flows(db, metadata, cube)

    actual = {
        row["category_code"]: row["amount"]
        for row in db.execute("SELECT category_code,amount FROM public_flow_fact")
    }
    assert actual == {
        TAX_FLOW_CATEGORIES[code]: value * 1000
        for code, value in BERGEN_2024_STATE_TAX_MILL.items()
    }


def test_skatteimport_avviser_manglende_enhet_for_aa_unngaa_tusen_gangers_feil(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    with pytest.raises(ValueError, match="Uventet enhet"):
        _import_tax_flows(db, {"dimension": {}}, {"id": [], "dimension": {}, "value": []})


def test_eksport_kobler_rene_kodebytter_men_ikke_endrer_historiske_ider(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.executemany("INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)", [
        ("municipality:3002", "3002", "Moss", "municipality", None, None, 0, 2020, 2023, "Moss (2020-2023)"),
        ("municipality:3103", "3103", "Moss", "municipality", None, None, 1, 2024, None, "Moss"),
    ])
    db.execute(
        "INSERT INTO entity_relation VALUES (?,?,?,?,?)",
        ("municipality:3002", "municipality:3103", 2024, "exact_successor", "SSB Klass"),
    )
    db.executemany("INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)", [
        ("kostra_actuals", "municipality:3002", 2023, "AGD13", "", "", 10, 100, "12137"),
        ("kostra_actuals", "municipality:3103", 2024, "AGD13", "", "", 11, 110, "12137"),
    ])
    db.commit()

    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})

    root = tmp_path / "data" / "kostra"
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    detail = json.loads((root / "entities" / "municipality-3103.json").read_text(encoding="utf-8"))
    assert index["values"]["revenues"]["2023"]["municipality:3103"]["amount"] == 10
    assert index["values"]["revenues"]["2023"]["municipality:3002"]["amount"] == 10
    assert index["historicalEntities"][0]["id"] == "municipality:3002"
    assert detail["overview"]["revenues"] == {
        "2023": {"amount": 10.0, "perCapita": 100.0},
        "2024": {"amount": 11.0, "perCapita": 110.0},
    }
