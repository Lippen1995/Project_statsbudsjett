"""Atferdstester for KOSTRA-modulens offentlige ETL-grensesnitt."""
import json
import sqlite3
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kostra import (  # noqa: E402
    METRICS,
    SsbClient,
    TAX_FLOW_CATEGORIES,
    _import_income_equalization,
    _import_green_book_grants,
    _import_details,
    _import_financial_details,
    _import_statement_details,
    _import_overview,
    _import_tax_flows,
    _green_book_sources,
    _sync_block_grant_flows,
    _income_equalization_sources,
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


def _minimal_income_equalization_xlsx():
    rows = [
        {"A": "Beregninger av skatt og netto inntektsutjevning"},
        {"A": "Knr.", "B": "Kommune"},
        {}, {}, {}, {"E": "3", "K": "9"}, {},
        {"A": 1103, "B": "Stavanger", "D": 150123, "E": 53807.396241748436,
         "F": 1.2729580020083351, "K": -7531.5861946430095},
    ]
    xml_rows = []
    for index, row in enumerate(rows, 1):
        cells = []
        for column, value in row.items():
            if isinstance(value, str):
                cells.append(
                    f'<c r="{column}{index}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
                )
            else:
                cells.append(f'<c r="{column}{index}"><v>{value}</v></c>')
        xml_rows.append(f'<row r="{index}">{"".join(cells)}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData></worksheet>'
    )
    output = BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return output.getvalue()


def _minimal_green_book_ods(headers, rows):
    namespace = (
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    )

    def ods_row(values):
        cells = ''.join(
            f'<table:table-cell office:value-type="string"><text:p>{escape(str(value))}</text:p></table:table-cell>'
            for value in values
        )
        return f'<table:table-row>{cells}</table:table-row>'

    content = (
        f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {namespace}>'
        '<office:body><office:spreadsheet><table:table table:name="Ark_1">'
        f'{ods_row(headers)}{ods_row(["(1 000 kr)"] * len(headers))}'
        f'{"".join(ods_row(row) for row in rows)}'
        '</table:table></office:spreadsheet></office:body></office:document-content>'
    )
    output = BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr('content.xml', content)
    return output.getvalue()


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


def test_renteposter_fra_ssb_utledes_til_belop_og_per_innbygger(tmp_path):
    metadata = {
        "id": ["KOKkommuneregion0000", "KOKart0000", "ContentsCode", "Tid"],
        "dimension": {
            "KOKkommuneregion0000": {
                "label": "region", "category": {"label": {"1103": "Stavanger"}},
            },
            "KOKart0000": {
                "label": "art", "category": {"label": {
                    "AGD79": "Renteinntekter", "AGD82": "Renteutgifter",
                }},
            },
            "ContentsCode": {
                "label": "statistikkvariabel",
                "category": {"label": {"KOSbelop0000": "Beløp (1000 kr)"}},
            },
            "Tid": {"label": "år", "category": {"label": {"2025": "2025"}}},
        },
    }
    cube = {
        "id": metadata["id"], "size": [1, 2, 1, 1],
        "dimension": {
            "KOKkommuneregion0000": {"category": {"index": {"1103": 0}}},
            "KOKart0000": {"category": {"index": {"AGD79": 0, "AGD82": 1}}},
            "ContentsCode": {"category": {"index": {"KOSbelop0000": 0}}},
            "Tid": {"category": {"index": {"2025": 0}}},
        },
        "value": [20, 30],
    }
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:1103", "1103", "Stavanger", "municipality", None, None, 1, None, None, "Stavanger"),
    )
    # 1000 (1000 kr) / 10 000 kr per innbygger gir 100 innbyggere.
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
        ("kostra_actuals", "municipality:1103", 2025, "AGD13", "", "", 1000, 10000, "12137"),
    )

    _import_financial_details(db, "municipality", "13551", metadata, cube)
    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})

    index = json.loads(
        (tmp_path / "data" / "kostra" / "index.json").read_text(encoding="utf-8")
    )
    assert index["values"]["interest_income"]["2025"]["municipality:1103"] == {
        "amount": 20.0, "perCapita": 200.0,
    }
    assert index["values"]["interest_expenses"]["2025"]["municipality:1103"] == {
        "amount": 30.0, "perCapita": 300.0,
    }


def test_regnskapsoppstillinger_eksporterer_sporbare_resultat_investering_og_balansedata(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:1103", "1103", "Stavanger", "municipality", None, None, 1, None, None, "Stavanger"),
    )
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
        ("kostra_actuals", "municipality:1103", 2025, "AGD13", "", "", 1000, 10000, "12137"),
    )

    def metadata(dimension, label, values):
        return {
            "id": ["KOKkommuneregion0000", dimension, "ContentsCode", "Tid"],
            "dimension": {
                "KOKkommuneregion0000": {"label": "region", "category": {"label": {"1103": "Stavanger"}}},
                dimension: {"label": label, "category": {"label": values}},
                "ContentsCode": {"label": "statistikkvariabel", "category": {"label": {"KOSbelop0000": "Beløp (1000 kr)"}}},
                "Tid": {"label": "år", "category": {"label": {"2025": "2025"}}},
            },
        }

    def cube(dimension, values):
        return {
            "id": ["KOKkommuneregion0000", dimension, "ContentsCode", "Tid"],
            "size": [1, len(values), 1, 1],
            "dimension": {
                "KOKkommuneregion0000": {"category": {"index": {"1103": 0}}},
                dimension: {"category": {"index": {code: index for index, code in enumerate(values)}}},
                "ContentsCode": {"category": {"index": {"KOSbelop0000": 0}}},
                "Tid": {"category": {"index": {"2025": 0}}},
            },
            "value": list(values.values()),
        }

    sources = [
        ("result", "13551", "KOKart0000", "art", {"AGD45": 900, "AGD79": 20}),
        ("investment", "13552", "KOKart0000", "art", {"AGI39": 100}),
        ("balance", "13202", "KOKkapittel0000", "balansedata", {"KG52": 250}),
    ]
    for statement, table, dimension, label, values in sources:
        labels = {code: code for code in values}
        _import_statement_details(
            db, "municipality", table, metadata(dimension, label, labels),
            cube(dimension, values), label, statement,
        )

    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})
    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-1103.json")
        .read_text(encoding="utf-8")
    )
    assert detail["statementData"]["result"]["AGD45"]["values"]["2025"] == {
        "amount": 900.0, "perCapita": 9000.0,
    }
    assert detail["statementData"]["investment"]["AGI39"]["values"]["2025"]["amount"] == 100.0
    assert detail["statementData"]["balance"]["KG52"]["values"]["2025"]["perCapita"] == 2500.0


def test_skattefinansiering_eksporteres_som_eget_drillgrunnlag(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:1103", "1103", "Stavanger", "municipality", None, None, 1, None, None, "Stavanger"),
    )
    db.execute(
        "INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)",
        ("kostra_actuals", "municipality:1103", 2025, "AGD13", "", "", 1000, 10000, "12137"),
    )
    metadata = {
        "id": ["KOKkommuneregion0000", "KOKartkap0000", "ContentsCode", "Tid"],
        "dimension": {
            "KOKkommuneregion0000": {"label": "region", "category": {"label": {"1103": "Stavanger"}}},
            "KOKartkap0000": {"label": "regnskapsbegrep", "category": {"label": {
                "AG12": "Skatt på inntekt og formue inkludert naturressursskatt",
                "AG44": "- herav Naturressursskatt",
            }}},
            "ContentsCode": {"label": "statistikkvariabel", "category": {"label": {"KOSbelop0000": "Beløp (1000 kr)"}}},
            "Tid": {"label": "år", "category": {"label": {"2025": "2025"}}},
        },
    }
    cube = {
        "id": metadata["id"], "size": [1, 2, 1, 1],
        "dimension": {
            "KOKkommuneregion0000": {"category": {"index": {"1103": 0}}},
            "KOKartkap0000": {"category": {"index": {"AG12": 0, "AG44": 1}}},
            "ContentsCode": {"category": {"index": {"KOSbelop0000": 0}}},
            "Tid": {"category": {"index": {"2025": 0}}},
        },
        "value": [800, 50],
    }
    db.execute(
        "INSERT INTO classification VALUES (?,?,?,?)",
        ("statement_tax", "AG12", metadata["dimension"]["KOKartkap0000"]["category"]["label"]["AG12"], "tax_component"),
    )
    db.execute(
        "INSERT INTO classification VALUES (?,?,?,?)",
        ("statement_tax", "AG44", metadata["dimension"]["KOKartkap0000"]["category"]["label"]["AG44"], "tax_component"),
    )

    _import_statement_details(
        db, "municipality", "13553", metadata, cube, "regnskapsbegrep", "tax",
    )
    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})

    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-1103.json")
        .read_text(encoding="utf-8")
    )
    assert detail["statementData"]["tax"]["AG12"] == {
        "code": "AG12",
        "name": "Skatt på inntekt og formue inkludert naturressursskatt",
        "sourceTable": "13553",
        "values": {"2025": {"amount": 800.0, "perCapita": 8000.0}},
    }
    assert detail["statementData"]["tax"]["AG44"]["values"]["2025"] == {
        "amount": 50.0, "perCapita": 500.0,
    }


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


def test_kdd_kilder_finner_kommuneversjonen_og_utelater_fylkeskommunen():
    html = """
      <a href="/2025/internettinntektsutj_2024kom-jan25.xlsx">Kommuner</a>
      <a href="/2025/internettinntutj_2024_fykom.xlsx">Fylkeskommuner</a>
      <a href="/eldre/inntektsutj_2014kom.xls">Gammelt format</a>
    """
    assert _income_equalization_sources(html) == {
        2024: "https://www.regjeringen.no/2025/internettinntektsutj_2024kom-jan25.xlsx",
    }


def test_gront_hefte_kilder_finner_begge_kommunetabellene_per_ar():
    html = """
      <a href="/content/2025/kommuner/tabell-1-k-2025.ods">1-k</a>
      <a href="/content/2025/kommuner/tabell-2-k-2025.ods">2-k</a>
      <a href="/content/2025/fylker/tabell-1-fk-2025.ods">1-fk</a>
    """
    assert _green_book_sources(html) == {
        2025: {
            "table1": "https://www.regjeringen.no/content/2025/kommuner/tabell-1-k-2025.ods",
            "table2": "https://www.regjeringen.no/content/2025/kommuner/tabell-2-k-2025.ods",
        }
    }


def test_inntektsutjevning_normaliserer_fortegn_enhet_og_eksport(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.executemany("INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)", [
        ("country:EAK", "EAK", "Norge", "country", None, None, 1, None, None, "Norge"),
        ("peer_group:EKG12", "EKG12", "KOSTRA-gruppe 12", "peer_group", None, None, 1, None, None, "KOSTRA-gruppe 12"),
        ("municipality:1103", "1103", "Stavanger", "municipality", None, "peer_group:EKG12", 1, None, None, "Stavanger"),
    ])
    db.executemany("INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)", [
        ("kostra_actuals", "municipality:1103", 2025, "AGD13", "", "", 10_000, 100_000, "12137"),
        ("kostra_actuals", "municipality:1103", 2025, "A800", "", "", 3_522_177, 23_223, "12137"),
        ("kostra_actuals", "peer_group:EKG12", 2025, "A800", "", "", 4_503_690, 30_000, "12137"),
        ("kostra_actuals", "country:EAK", 2025, "A800", "", "", 4_203_444, 28_000, "12137"),
    ])
    db.execute(
        """INSERT INTO block_grant_component_fact
             (dataset_id,entity_id,year,component_code,amount,per_capita,sort_order,
              basis,source_url,source_period)
           VALUES ('kdd_green_book','municipality:1103',2025,'expense_equalization',
                   -551306,-3672,20,'budget','https://www.regjeringen.no/gront-hefte/2025/','2025')"""
    )
    _sync_block_grant_flows(db)

    source = "https://www.regjeringen.no/inntektsutjevning-2025.xlsx"
    assert _import_income_equalization(
        db, 2025, source, _minimal_income_equalization_xlsx()
    ) == 1
    row = db.execute(
        "SELECT * FROM income_equalization_fact WHERE entity_id='municipality:1103'"
    ).fetchone()
    assert row["equalization_per_capita"] == pytest.approx(-7531.5861946430095)
    assert row["equalization_amount"] == pytest.approx(-1_130_664.3142983925)
    assert row["tax_before_amount"] == pytest.approx(8_077_727.746)
    assert row["tax_after_per_capita"] == pytest.approx(46_275.81004710543)
    assert row["tax_after_national_ratio"] == pytest.approx(1.0947781683064473)

    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})
    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-1103.json")
        .read_text(encoding="utf-8")
    )
    value = detail["incomeEqualization"]["values"]["2025"]
    assert value["equalization"]["amount"] == pytest.approx(-1_130_664.3142983925)
    assert value["sourceUrl"] == source
    comparisons = detail["incomeSystemComparisons"]["values"]["2025"]
    assert [row["id"] for row in comparisons] == [
        "municipality:1103", "peer_group:EKG12", "country:EAK",
    ]
    assert comparisons[0]["blockGrantBeforeEqualizationPerCapita"] == pytest.approx(
        3_522_177 * 1000 / 150_123 + 7_531.58619464301
    )
    assert comparisons[0]["expenseEqualizationPerCapita"] == -3672
    assert comparisons[1]["expenseEqualizationPerCapita"] == pytest.approx(
        -551_306 * 1000 / 150_123
    )
    assert comparisons[2]["expenseEqualizationPerCapita"] == pytest.approx(
        -551_306 * 1000 / 150_123
    )
    assert comparisons[1]["blockGrantPerCapita"] == 30_000
    assert comparisons[2]["blockGrantPerCapita"] == 28_000

    index = json.loads(
        (tmp_path / "data" / "kostra" / "index.json").read_text(encoding="utf-8")
    )
    metric = next(item for item in index["metrics"] if item["id"] == "income_equalization")
    assert metric["municipalityOnly"] is True
    assert metric["polarity"] == "diverging"
    assert index["values"]["income_equalization"]["2025"]["municipality:1103"] == {
        "amount": pytest.approx(-1_130_664.3142983925),
        "perCapita": pytest.approx(-7531.5861946430095),
    }
    map_point = index["incomeEqualization"]["2025"]["municipality:1103"]
    assert map_point["taxBefore"]["nationalRatio"] == pytest.approx(1.2729580020083351)
    assert map_point["taxAfter"]["perCapita"] == pytest.approx(46_275.81004710543)
    assert map_point["expenseEqualization"] == {
        "amount": -551_306,
        "perCapita": -3_672,
    }
    assert map_point["blockGrant"] == {
        "amount": 3_522_177,
        "perCapita": 23_223,
    }
    assert map_point["sourceUrl"] == source


def test_gront_hefte_avstemmer_hele_budsjetterte_rammetilskuddet(tmp_path):
    db = create_database(tmp_path / "kostra.sqlite")
    db.execute(
        "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("municipality:1103", "1103", "Stavanger", "municipality", None, None, 1, None, None, "Stavanger"),
    )
    db.executemany("INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?)", [
        ("kostra_actuals", "municipality:1103", 2025, "AGD13", "", "", 10_000_000, 100_000, "12137"),
        ("kostra_actuals", "municipality:1103", 2025, "A800", "", "", 3_522_177, 23_223, "12137"),
    ])
    table_1 = _minimal_green_book_ods(
        ["Kommune", "Innbyggertilskudd", "Distriktstilskudd Sør-Norge",
         "Distriktstilskudd Nord-Norge", "Veksttilskudd", "Storbytilskudd",
         "Skjønnstilskudd", "Rammetilskudd 2025"],
        [["1103 Stavanger", "4 270 864", "0", "0", "0", "61 706", "3 000", "4 335 570"]],
    )
    table_2 = _minimal_green_book_ods(
        ["Kommune", "Innbyggertilskudd før omfordeling", "Utgiftsutjevning m.m.",
         "Saker med særskilt fordeling", "Innbyggertilskudd ekskl. inntektsgarantiordning",
         "Inntektsgarantiordning (inkl.fin.)", "Innbyggertilskudd inkl. inntektsgarantiordning"],
        [["1103 Stavanger", "4 703 088", "-551 306", "107 809", "4 259 591", "11 272", "4 270 864"]],
    )

    imported = _import_green_book_grants(
        db, 2025, "https://www.regjeringen.no/gront-hefte/2025/", table_1, table_2,
    )

    assert imported == 1
    rows = db.execute(
        "SELECT component_code,amount FROM block_grant_component_fact ORDER BY sort_order"
    ).fetchall()
    assert [(row["component_code"], row["amount"]) for row in rows] == [
        ("base_per_resident", 4_703_088),
        ("expense_equalization", -551_306),
        ("special_distribution", 107_809),
        ("income_guarantee", 11_272),
        ("district_south", 0),
        ("district_north", 0),
        ("growth_grant", 0),
        ("metropolitan_grant", 61_706),
        ("discretionary_grant", 3_000),
        ("budgeted_block_grant_before_income_equalization", 4_335_570),
    ]
    write_frontend_data(db, tmp_path / "data", {"county": {}, "municipality": {}})
    detail = json.loads(
        (tmp_path / "data" / "kostra" / "entities" / "municipality-1103.json")
        .read_text(encoding="utf-8")
    )
    calculation = detail["blockGrantCalculation"]["values"]["2025"]
    assert calculation["basis"] == "budget"
    assert calculation["sourceUrl"] == "https://www.regjeringen.no/gront-hefte/2025/"
    assert calculation["components"][0] == {
        "code": "base_per_resident", "amount": 4_703_088,
        "perCapita": pytest.approx(47_030.88),
    }


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
