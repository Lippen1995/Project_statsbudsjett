"""
Enhetstester for ETL-aggregering og parsing.
Kjør med: pytest etl/tests/
"""
import sys
import json
import io
from pathlib import Path
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from parse_regnskap import _to_amount, _normalize_columns, parse_regnskap
from parse_bevilgning import _classify_bev_type
from parse_befolkning import parse_befolkning
from build_hierarchy import _node_id, _build_tree


# --- Test: beløpskonvertering ---

def test_to_amount_decimal_komma():
    s = pd.Series(["1.234,56", "2.000,00", "500,1"])
    result = _to_amount(s)
    assert abs(result[0] - 1234.56) < 0.01
    assert abs(result[1] - 2000.00) < 0.01
    assert abs(result[2] - 500.1) < 0.01


def test_to_amount_heltall():
    s = pd.Series(["12345", "0", "999"])
    result = _to_amount(s)
    assert result[0] == 12345
    assert result[1] == 0


def test_to_amount_mellomrom_som_tusenskille():
    s = pd.Series(["1 234 567"])
    result = _to_amount(s)
    assert abs(result[0] - 1234567) < 0.01


# --- Test: bevilgningstype-klassifisering ---

def test_klassifiser_saldert():
    assert _classify_bev_type("Saldert budsjett") == "saldert"
    assert _classify_bev_type("SALDERT BUDSJETT") == "saldert"


def test_klassifiser_revidert():
    assert _classify_bev_type("Revidert nasjonalbudsjett") == "revidert"
    assert _classify_bev_type("Nysaldering") == "revidert"
    assert _classify_bev_type("Tilleggsbevilgning") == "revidert"


def test_klassifiser_ukjent():
    assert _classify_bev_type("Ukjent type") == "annet"


# --- Test: node-id-generering ---

def test_node_id_dept():
    assert _node_id("u", "07") == "u-07"


def test_node_id_kap():
    assert _node_id("u", "07", "732") == "u-07-732"


def test_node_id_post():
    assert _node_id("u", "07", "732", "72") == "u-07-732-72"


# --- Test: befolkningsparser ---

def test_parse_befolkning_ssb_format(tmp_path):
    ssb_data = {
        "version": "2.0",
        "class": "dataset",
        "dimension": {
            "Tid": {
                "category": {
                    "index": {"2020": 0, "2021": 1, "2022": 2},
                    "label": {"2020": "2020", "2021": "2021", "2022": "2022"}
                }
            }
        },
        "value": [5367580, 5403021, 5425270]
    }
    p = tmp_path / "ssb.json"
    p.write_text(json.dumps(ssb_data), encoding="utf-8")

    result = parse_befolkning(p)
    assert result[2020] == 5367580
    assert result[2021] == 5403021
    assert result[2022] == 5425270


def test_parse_befolkning_rimelighet_check(tmp_path):
    ssb_data = {
        "version": "2.0",
        "class": "dataset",
        "dimension": {
            "Tid": {
                "category": {
                    "index": {"2020": 0},
                    "label": {"2020": "2020"}
                }
            }
        },
        "value": [999]  # Urimelig lavt
    }
    p = tmp_path / "ssb_bad.json"
    p.write_text(json.dumps(ssb_data), encoding="utf-8")

    bef = parse_befolkning(p)
    # Rimelighetsssjekk er i etl.py, ikke parseren – her bare sjekk parsing OK
    assert bef[2020] == 999


# --- Test: regnskap-parsing med syntetisk CSV ---
# NB: Disse CSV-radene brukes BARE for å teste parseren, ikke som faktiske data.
# Faktiske tall lastes ned fra DFØ av etl.py.

MOCK_CSV_CONTENT = (
    "Periode;Departement;Departementnavn;Kapittel;Kapittelnavn;Post;Postnavn;"
    "Artskonto;Artskontonavn;Belopstegn;Belop\n"
    "2023;07;HOD;0732;Regionale helseforetak;70;Kjøp av helserelaterte tjenester;"
    "1019;Andre driftsutgifter;D;10000000\n"
    "2023;07;HOD;0732;Regionale helseforetak;70;Kjøp av helserelaterte tjenester;"
    "1019;Andre driftsutgifter;K;500000\n"
    "2023;07;HOD;0732;Regionale helseforetak;90;Utlån;"
    "9010;Utlån;D;200000\n"
)


def test_parse_regnskap_basic(tmp_path):
    p = tmp_path / "regnskap_2023.csv"
    p.write_bytes(MOCK_CSV_CONTENT.encode("latin-1"))

    df = parse_regnskap(p, 2023)

    assert len(df) == 3
    assert "belop_mill" in df.columns
    assert "er_utgift" in df.columns
    assert "fin" in df.columns

    # Fin-flagg på post 90
    fin_rows = df[df["post"] == "90"]
    assert fin_rows["fin"].all()

    # Utgiftsrader (D)
    u = df[df["er_utgift"] == True]
    assert len(u) == 2

    # Inntektsrader (K)
    i = df[df["er_utgift"] == False]
    assert len(i) == 1


def test_parse_regnskap_belopstegn_korrekt(tmp_path):
    p = tmp_path / "regnskap_2023.csv"
    p.write_bytes(MOCK_CSV_CONTENT.encode("latin-1"))

    df = parse_regnskap(p, 2023)
    # Alle beløp skal være positive (brutto)
    assert (df["belop_mill"] >= 0).all()


def test_parse_regnskap_mill_konversjon(tmp_path):
    p = tmp_path / "regnskap_2023.csv"
    p.write_bytes(MOCK_CSV_CONTENT.encode("latin-1"))

    df = parse_regnskap(p, 2023)
    # 10000000 tusen kr = 10000 mill. kr
    utgift_700 = df[(df["er_utgift"] == True) & (df["post"] == "70")]["belop_mill"]
    assert abs(utgift_700.sum() - 10000.0) < 0.01


# --- Test: hierarki-aggregering ---

def test_bygg_tre_enkel():
    regnskap = pd.DataFrame({
        "aar": [2023, 2023],
        "dept_kode": ["07", "07"],
        "dept_navn": ["HOD", "HOD"],
        "kap": ["0732", "0732"],
        "kap_navn": ["RHF", "RHF"],
        "post": ["70", "71"],
        "post_navn": ["Kjøp", "Tilskudd"],
        "artskonto": ["1019", "6010"],
        "artskonto_navn": ["Andre", "Tilskudd"],
        "belop_mill": [100.0, 50.0],
        "er_utgift": [True, True],
        "fin": [False, False],
        "transfer": [False, False],
        "netto": [False, False],
    })

    bevilgning = pd.DataFrame(columns=["aar", "dept_kode", "dept_navn", "kap", "kap_navn",
                                        "post", "post_navn", "saldert", "revidert"])

    nodes = _build_tree(regnskap, bevilgning, [2023], prefix="u")

    assert len(nodes) == 1  # Én departement
    dept = nodes[0]
    assert dept["niva"] == "departement"
    assert dept["serier"]["2023"]["regnskap"] == 150.0

    kap_list = dept["children"]
    assert len(kap_list) == 1
    kap = kap_list[0]
    assert kap["serier"]["2023"]["regnskap"] == 150.0

    posts = kap["children"]
    assert len(posts) == 2
    assert sum(p["serier"]["2023"]["regnskap"] for p in posts) == 150.0


def test_bygg_tre_fin_flagg():
    regnskap = pd.DataFrame({
        "aar": [2023],
        "dept_kode": ["07"],
        "dept_navn": ["HOD"],
        "kap": ["0732"],
        "kap_navn": ["RHF"],
        "post": ["90"],
        "post_navn": ["Utlån"],
        "artskonto": ["9010"],
        "artskonto_navn": ["Utlån"],
        "belop_mill": [500.0],
        "er_utgift": [True],
        "fin": [True],
        "transfer": [False],
        "netto": [False],
    })

    bevilgning = pd.DataFrame(columns=["aar", "dept_kode", "dept_navn", "kap", "kap_navn",
                                        "post", "post_navn", "saldert", "revidert"])

    nodes = _build_tree(regnskap, bevilgning, [2023], prefix="u")
    post = nodes[0]["children"][0]["children"][0]
    assert post.get("fin") == True
