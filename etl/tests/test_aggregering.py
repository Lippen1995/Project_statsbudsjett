"""
Enhetstester for ETL-parsing og aggregering.
Kjør med: pytest etl/tests/

Test-CSV-ene her gjenskaper det VERIFISERTE skjemaet fra DFØ
(se docs/data-schema.md) — de brukes kun til å teste parserne.
Faktiske tall lastes alltid ned av etl.py.
"""
import sys
import json
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from parse_regnskap import _to_amount, parse_regnskap
from parse_bevilgning import _klassifiser, parse_bevilgning
from parse_befolkning import parse_befolkning
from build_hierarchy import _node_id, _build_tree


# --- Beløpskonvertering (norsk format) ---

def test_to_amount_desimalkomma():
    s = pd.Series(["1.234,56", "2.000,00", "500,1", "-847732,870"])
    r = _to_amount(s)
    assert abs(r[0] - 1234.56) < 0.01
    assert abs(r[1] - 2000.00) < 0.01
    assert abs(r[2] - 500.1) < 0.01
    assert abs(r[3] - (-847732.87)) < 0.01


def test_to_amount_bare_desimal():
    # Bevilgningsfilen bruker ",000" for null
    s = pd.Series([",000", "2500000,000"])
    r = _to_amount(s)
    assert r[0] == 0.0
    assert abs(r[1] - 2_500_000) < 0.01


# --- Bevilgningsklassifisering ---

def test_klassifiser_saldert():
    assert _klassifiser("Saldert budsjett 2020") == "saldert"
    assert _klassifiser("SALDERT BUDSJETT") == "saldert"


def test_klassifiser_overfort():
    assert _klassifiser("Overført fra 2013") == "overfort"


def test_klassifiser_endring():
    assert _klassifiser("Prop. 118 S (2019-2020)") == "endring"
    assert _klassifiser("Nysaldering 2021") == "endring"  # inneholder ikke 'saldert budsjett'...


def test_klassifiser_nysaldering_er_endring():
    # 'Nysaldert'/'nysaldering' inneholder substringen 'saldert'?
    # 'nysaldering' inneholder ikke 'saldert' ('nysaldering' har 'salderi').
    # 'Nysaldert budsjett' ville truffet 'saldert' — dokumentert begrensning,
    # verifiseres mot faktiske tekster i CI-loggen.
    assert _klassifiser("Tilleggsbevilgning vår 2022") == "endring"


# --- Node-id ---

def test_node_id():
    assert _node_id("u", "07") == "u-07"
    assert _node_id("u", "07", "0732") == "u-07-0732"
    assert _node_id("i", "07", "3732", "86") == "i-07-3732-86"


# --- Befolkningsparser (SSB json-stat2) ---

def test_parse_befolkning(tmp_path):
    ssb = {
        "version": "2.0", "class": "dataset",
        "dimension": {
            "Tid": {"category": {
                "index": {"2020": 0, "2021": 1},
                "label": {"2020": "2020", "2021": "2021"},
            }}
        },
        "value": [5367580, 5403021],
    }
    p = tmp_path / "ssb.json"
    p.write_text(json.dumps(ssb), encoding="utf-8")
    r = parse_befolkning(p)
    assert r == {2020: 5367580, 2021: 5403021}


# --- Regnskapsparser (verifisert DFØ-skjema) ---

REGNSKAP_HEADER = (
    '"År";"Periode";"Konto_no";"Konto";"Programområde_id";"Programområde";'
    '"Programkategori_id";"Programkategori";"Fagdepartement_id";"Fagdepartement";'
    '"Kapittel_id";"Kapittel";"Post_id";"Post";"Post_type";'
    '"Kontoklasse_id";"Kontoklasse";"Kontogruppe_id";"Kontogruppe";'
    '"Artskonto_id";"Artskonto";"Fagdepartement_Virksomhet_id";"Fagdepartement_Virksomhet";'
    '"Virksomhet_id";"Virksomhet";"Regnskapsfører_id";"Regnskapsfører";"Beløp"'
)


def _regnskap_rad(aar, periode, dept_id, dept, kap_id, kap, post_id, post,
                  post_type, klasse_id, klasse, art_id, art, belop):
    return (
        f'"{aar}";"{periode}";"{post_id}";"{post}";"21";"Område";"2130";"Kategori";'
        f'"{dept_id}";"{dept}";"{kap_id}";"{kap}";"{post_id}";"{post}";"{post_type}";'
        f'"{klasse_id}";"{klasse}";"{klasse_id}0";"Gruppe";'
        f'"{art_id}";"{art}";"{dept_id}";"{dept}";'
        f'"999999999";"Testvirksomhet";"999999999";"Testvirksomhet";"{belop}"'
    )


def _skriv_regnskap(tmp_path, rader):
    p = tmp_path / "statsregnskapet_aar_2023.csv"
    innhold = REGNSKAP_HEADER + "\n" + "\n".join(rader) + "\n"
    p.write_bytes(innhold.encode("latin-1"))
    return p


def test_parse_regnskap_maaneder_summeres(tmp_path):
    # To måneder på samme post skal summeres til én årsrad
    rader = [
        _regnskap_rad(2023, 202301, "13", "Samferdselsdep.", "1320", "Statens vegvesen",
                      "132001", "Driftsutgifter", "Utgifter til drift",
                      "6", "Annen driftskostnad", "601", "Leie", "1000000,000"),
        _regnskap_rad(2023, 202302, "13", "Samferdselsdep.", "1320", "Statens vegvesen",
                      "132001", "Driftsutgifter", "Utgifter til drift",
                      "6", "Annen driftskostnad", "601", "Leie", "2000000,000"),
    ]
    df = parse_regnskap([_skriv_regnskap(tmp_path, rader)], 2023)
    assert len(df) == 1
    assert abs(df.iloc[0]["belop_mill"] - 3.0) < 0.001  # 3 mill. kroner
    assert df.iloc[0]["er_utgift"] == True
    assert df.iloc[0]["kap"] == "1320"
    assert df.iloc[0]["post"] == "01"


def test_parse_regnskap_inntektskapittel_flippes(tmp_path):
    # Kap 5501 (skatt) med kreditert (negativt) beløp → positivt i inntektstreet
    rader = [
        _regnskap_rad(2023, 202301, "14", "Finansdep.", "5501", "Skatter",
                      "550170", "Trinnskatt", "Andre overføringer",
                      "8", "Overføring", "840", "Skatt", "-5000000000,000"),
    ]
    df = parse_regnskap([_skriv_regnskap(tmp_path, rader)], 2023)
    assert len(df) == 1
    assert df.iloc[0]["er_utgift"] == False
    assert abs(df.iloc[0]["belop_mill"] - 5000.0) < 0.001  # 5 mrd., positiv


def test_parse_regnskap_fin_flagg_post90(tmp_path):
    rader = [
        _regnskap_rad(2023, 202301, "07", "HOD", "0732", "RHF",
                      "073290", "Utlån", "Utlån, kapitaltilskudd og aksjer",
                      "9", "Finans", "901", "Utlån", "100000000,000"),
    ]
    df = parse_regnskap([_skriv_regnskap(tmp_path, rader)], 2023)
    assert df.iloc[0]["fin"] == True


def test_parse_regnskap_spu_transfer_flagg(tmp_path):
    rader = [
        _regnskap_rad(2023, 202301, "14", "Finansdep.", "2800", "SPU",
                      "280050", "Overføring til fondet", "Overføringer til andre",
                      "8", "Overføring", "880", "Overføring", "500000000000,000"),
    ]
    df = parse_regnskap([_skriv_regnskap(tmp_path, rader)], 2023)
    assert df.iloc[0]["transfer"] == True


def test_parse_regnskap_netto_virksomhet_ekskluderes(tmp_path):
    # Rad uten gyldig kapittel/post (nettobudsjettert virksomhet) skal ut
    god = _regnskap_rad(2023, 202301, "13", "SD", "1320", "SVV",
                        "132001", "Drift", "Utgifter til drift",
                        "6", "Kostnad", "601", "Leie", "1000000,000")
    netto = _regnskap_rad(2023, 202301, "06", "KD", "", "",
                          "", "", "",
                          "5", "Lønn", "500", "Lønn", "9000000,000")
    df = parse_regnskap([_skriv_regnskap(tmp_path, [god, netto])], 2023)
    assert len(df) == 1
    assert df.iloc[0]["kap"] == "1320"


def test_parse_regnskap_feiler_ved_manglende_kolonner(tmp_path):
    p = tmp_path / "statsregnskapet_aar_2023.csv"
    p.write_bytes('"Feil";"Skjema"\n"a";"b"\n'.encode("latin-1"))
    with pytest.raises(ValueError, match="mangler kolonner"):
        parse_regnskap([p], 2023)


# --- Bevilgningsparser (verifisert DFØ-skjema) ---

BEV_HEADER = (
    '"År";"Periode";"Tildelings_periode";"Programområde_id";"Programområde";'
    '"Programkategori_id";"Programkategori";"Fagdepartement_id";"Fagdepartement";'
    '"Kapittel_id";"Kapittel";"Post_id";"Post";"Post_type";'
    '"Bevilgning_beløp";"Bevilgning_overføres_beløp";"Bevilgning_overført_beløp";"Bevilgning"'
)


def _bev_rad(aar, dept_id, dept, kap_id, kap, post_id, post, belop, tekst):
    return (
        f'"{aar}";"{aar}01";"{aar}01";"10";"Område";"1020";"Kategori";'
        f'"{dept_id}";"{dept}";"{kap_id}";"{kap}";"{post_id}";"{post}";"Utgifter til drift";'
        f'"{belop}";",000";",000";"{tekst}"'
    )


def test_parse_bevilgning_saldert_og_revidert(tmp_path):
    rader = [
        _bev_rad(2020, "07", "HOD", "0732", "RHF", "073270", "Tilskudd",
                 "100000000,000", "Saldert budsjett 2020"),
        _bev_rad(2020, "07", "HOD", "0732", "RHF", "073270", "Tilskudd",
                 "20000000,000", "Prop. 118 S (2019-2020)"),
        _bev_rad(2020, "07", "HOD", "0732", "RHF", "073270", "Tilskudd",
                 "5000000,000", "Overført fra 2019"),
    ]
    p = tmp_path / "bevilgninger_full_historikk.csv"
    p.write_bytes((BEV_HEADER + "\n" + "\n".join(rader) + "\n").encode("latin-1"))

    df = parse_bevilgning([p])
    assert len(df) == 1
    rad = df.iloc[0]
    assert abs(rad["saldert"] - 100.0) < 0.001            # 100 mill.
    assert abs(rad["revidert"] - 120.0) < 0.001           # saldert + endring
    # Overføringen på 5 mill. skal IKKE inngå i noen av seriene


def test_parse_bevilgning_inntektskapittel_flippes(tmp_path):
    # Inntektskapitler (>= 3000) føres med kredit-fortegn i kildefilen
    rader = [
        _bev_rad(2026, "14", "FIN", "5501", "Skatter", "550170", "Trinnskatt",
                 "-5000000000,000", "Saldert budsjett 2026"),
    ]
    p = tmp_path / "bevilgninger_full_historikk.csv"
    p.write_bytes((BEV_HEADER + "\n" + "\n".join(rader) + "\n").encode("latin-1"))

    df = parse_bevilgning([p])
    rad = df.iloc[0]
    assert abs(rad["saldert"] - 5000.0) < 0.001   # 5 mrd., positiv


# --- Hierarkibygging ---

def _regnskap_df(rows):
    cols = ["aar", "dept_kode", "dept_navn", "kap", "kap_navn", "post", "post_navn",
            "klasse_id", "klasse_navn", "artskonto", "artskonto_navn",
            "belop_mill", "er_utgift", "fin", "transfer", "netto"]
    return pd.DataFrame(rows, columns=cols)


def _bev_df(rows):
    cols = ["aar", "dept_kode", "dept_navn", "kap", "kap_navn",
            "post", "post_navn", "saldert", "revidert"]
    return pd.DataFrame(rows, columns=cols)


def test_bygg_tre_aggregering():
    regnskap = _regnskap_df([
        [2023, "07", "HOD", "0732", "RHF", "70", "Tilskudd",
         "6", "Tilskudd", "601", "Tilskudd", 100.0, True, False, False, False],
        [2023, "07", "HOD", "0732", "RHF", "71", "Annet",
         "6", "Tilskudd", "601", "Tilskudd", 50.0, True, False, False, False],
    ])
    nodes, _ = _build_tree(regnskap, _bev_df([]), [2023], prefix="u")

    assert len(nodes) == 1
    dept = nodes[0]
    assert dept["serier"]["2023"]["regnskap"] == 150.0
    kap = dept["children"][0]
    assert kap["serier"]["2023"]["regnskap"] == 150.0
    assert len(kap["children"]) == 2
    assert sum(p["serier"]["2023"]["regnskap"] for p in kap["children"]) == 150.0


def test_bygg_tre_budsjett_rulles_opp():
    regnskap = _regnskap_df([
        [2023, "07", "HOD", "0732", "RHF", "70", "Tilskudd",
         "6", "Tilskudd", "601", "Tilskudd", 95.0, True, False, False, False],
    ])
    bev = _bev_df([
        [2023, "07", "HOD", "0732", "RHF", "70", "Tilskudd", 100.0, 110.0],
    ])
    nodes, _ = _build_tree(regnskap, bev, [2023], prefix="u")
    dept = nodes[0]
    post = dept["children"][0]["children"][0]
    assert post["serier"]["2023"]["saldert"] == 100.0
    assert post["serier"]["2023"]["revidert"] == 110.0
    # Rullet opp
    assert dept["children"][0]["serier"]["2023"]["saldert"] == 100.0
    assert dept["serier"]["2023"]["saldert"] == 100.0


def test_bygg_tre_budsjettaar_uten_regnskap():
    # Prognoseår: bevilgning finnes, regnskap gjør ikke → node opprettes
    regnskap = _regnskap_df([
        [2024, "07", "HOD", "0732", "RHF", "70", "Tilskudd",
         "6", "Tilskudd", "601", "Tilskudd", 95.0, True, False, False, False],
    ])
    bev = _bev_df([
        [2025, "07", "HOD", "0732", "RHF", "70", "Tilskudd", 105.0, 105.0],
    ])
    nodes, _ = _build_tree(regnskap, bev, [2024], prefix="u")
    post = nodes[0]["children"][0]["children"][0]
    assert post["serier"]["2024"]["regnskap"] == 95.0
    assert post["serier"]["2025"]["saldert"] == 105.0
    assert post["serier"]["2025"]["regnskap"] is None


def test_bygg_tre_artskonto_i_detaljer():
    regnskap = _regnskap_df([
        [2023, "07", "HOD", "0732", "RHF", "70", "Tilskudd",
         "5", "Lønnskostnad", "500", "Lønn fast ansatte", 60.0, True, False, False, False],
        [2023, "07", "HOD", "0732", "RHF", "70", "Tilskudd",
         "6", "Annen driftskostnad", "601", "Leie lokaler", 40.0, True, False, False, False],
    ])
    nodes, detaljer = _build_tree(regnskap, _bev_df([]), [2023], prefix="u")
    post = nodes[0]["children"][0]["children"][0]
    # Hovedtreet er slanket: artskonto ligger i detaljer, ikke på noden
    assert "artskonto" not in post
    assert post["harDetaljer"] is True
    assert post["serier"]["2023"]["regnskap"] == 100.0

    ak = detaljer["07"][post["id"]]["artskonto"]["2023"]
    assert ak["500"]["belop"] == 60.0
    assert ak["500"]["klasseNavn"] == "Lønnskostnad"
    assert ak["601"]["belop"] == 40.0


def test_bygg_tre_kildefelt_posttype_og_formaal():
    # DFØs kildefelt (post_type, omrade, kategori) skal følge med til nodene:
    # posttype på post, formål (programområde/-kategori) på kapittel.
    regnskap = _regnskap_df([
        [2023, "13", "SD", "1320", "Statens vegvesen", "01", "Driftsutgifter",
         "6", "Kostnad", "601", "Leie", 100.0, True, False, False, False],
    ])
    regnskap["post_type"] = "Utgifter til drift"
    regnskap["omrade"] = "Innenlands transport"
    regnskap["kategori"] = "Veiformål"

    nodes, _ = _build_tree(regnskap, _bev_df([]), [2023], prefix="u")
    kap = nodes[0]["children"][0]
    post = kap["children"][0]
    assert kap["omrade"] == "Innenlands transport"
    assert kap["kategori"] == "Veiformål"
    assert post["postType"] == "Utgifter til drift"


def test_bygg_tre_uten_kildefelt_er_ok():
    # Mangler kildefeltene (eldre data / budsjettposter) → ingen krasj, ingen felt
    regnskap = _regnskap_df([
        [2023, "13", "SD", "1320", "SVV", "01", "Drift",
         "6", "Kostnad", "601", "Leie", 100.0, True, False, False, False],
    ])
    nodes, _ = _build_tree(regnskap, _bev_df([]), [2023], prefix="u")
    post = nodes[0]["children"][0]["children"][0]
    assert "postType" not in post
    assert "omrade" not in nodes[0]["children"][0]


def test_bygg_tre_fin_flagg():
    regnskap = _regnskap_df([
        [2023, "07", "HOD", "0732", "RHF", "90", "Utlån",
         "9", "Finans", "901", "Utlån", 500.0, True, True, False, False],
    ])
    nodes, _ = _build_tree(regnskap, _bev_df([]), [2023], prefix="u")
    post = nodes[0]["children"][0]["children"][0]
    assert post.get("fin") == True


# --- SSB årsserie-parser (KPI/BNP) ---

def test_parse_ssb_aarsserie_aarlig(tmp_path):
    from parse_befolkning import parse_ssb_aarsserie
    ssb = {
        "dimension": {"Tid": {"category": {"index": {"2022": 0, "2023": 1}}}},
        "value": [118.0, 124.5],
    }
    p = tmp_path / "kpi.json"
    p.write_text(json.dumps(ssb), encoding="utf-8")
    r = parse_ssb_aarsserie(p, "KPI")
    assert r == {2022: 118.0, 2023: 124.5}


def test_parse_ssb_aarsserie_maanedlig_snittes(tmp_path):
    from parse_befolkning import parse_ssb_aarsserie
    ssb = {
        "dimension": {"Tid": {"category": {"index": {
            "2023M01": 0, "2023M02": 1, "2024M01": 2,
        }}}},
        "value": [100.0, 102.0, 110.0],
    }
    p = tmp_path / "kpi_mnd.json"
    p.write_text(json.dumps(ssb), encoding="utf-8")
    r = parse_ssb_aarsserie(p, "KPI")
    assert abs(r[2023] - 101.0) < 0.001   # snitt av 100 og 102
    assert abs(r[2024] - 110.0) < 0.001


# --- Virksomhetsdimensjon ---

def test_parse_regnskap_med_virksomheter(tmp_path):
    rader = [
        _regnskap_rad(2023, 202301, "13", "SD", "1320", "SVV",
                      "132001", "Drift", "Utgifter til drift",
                      "6", "Kostnad", "601", "Leie", "1000000,000"),
    ]
    df, virk = parse_regnskap([_skriv_regnskap(tmp_path, rader)], 2023,
                              med_virksomheter=True)
    assert len(virk) == 1
    assert virk.iloc[0]["virk_id"] == "999999999"
    assert virk.iloc[0]["virk_navn"] == "Testvirksomhet"
    assert abs(virk.iloc[0]["belop_mill"] - 1.0) < 0.001


def test_bygg_tre_virksomheter_i_detaljer():
    regnskap = _regnskap_df([
        [2023, "13", "SD", "1320", "SVV", "01", "Drift",
         "6", "Kostnad", "601", "Leie", 100.0, True, False, False, False],
    ])
    virk = pd.DataFrame([
        [2023, "1320", "01", "971032081", "Statens vegvesen", True, 100.0],
    ], columns=["aar", "kap", "post", "virk_id", "virk_navn", "er_utgift", "belop_mill"])

    nodes, detaljer = _build_tree(regnskap, _bev_df([]), [2023], prefix="u", virk=virk)
    post = nodes[0]["children"][0]["children"][0]
    d = detaljer["13"][post["id"]]
    assert d["virksomheter"]["2023"]["971032081"]["belop"] == 100.0
    assert d["virksomheter"]["2023"]["971032081"]["navn"] == "Statens vegvesen"
