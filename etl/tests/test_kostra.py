"""
Enhetstester for KOSTRA-ETL (etl/kostra.py).

Tester de rene funksjonene mot SYNTETISKE json-stat2-svar — ingen nettverk.
Skjemaet her etterligner SSBs KOSTRA-tabeller (Region/Funksjon/Art/ContentsCode/
Tid). Faktiske tall lastes alltid ned av etl.py mot SSB. Parseren er
metadata-drevet, så testene bruker representative (ikke hardkodede) dimensjons-
koder for å bekrefte at klassifiseringen skjer på tekst/kode.
"""
import sys
import json
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import kostra
from kostra import (
    KildeFeil, klassifiser_dimensjoner, _velg_contents, _jsonstat_iter,
    _klassifiser_enhet, stabil_kommune_id, parse_kostra_hovedtabell,
    bygg_kostra, sanity_kostra, _enhet_node,
)


# --- Syntetisk metadata (v0-form) ---

def _metadata():
    return {
        "title": "Detaljerte regnskapstall, driftsregnskapet (K)",
        "variables": [
            {"code": "Region", "text": "region", "elimination": False,
             "values": ["EAK", "0301", "1662", "5001"],
             "valueTexts": ["Hele landet", "Oslo", "Klæbu", "Trondheim"]},
            {"code": "KOKfunksjon0000", "text": "funksjon", "elimination": False,
             "values": ["120", "202"], "valueTexts": ["Administrasjon", "Grunnskole"]},
            {"code": "KOKart0000", "text": "art", "elimination": True,
             "values": ["AGD10", "AGD20"], "valueTexts": ["Lønn", "Kjøp av varer"]},
            {"code": "ContentsCode", "text": "statistikkvariabel", "elimination": False,
             "values": ["korr", "pers"],
             "valueTexts": ["Regnskapsførte beløp (1000 kr)", "Kroner per innbygger"]},
            {"code": "Tid", "text": "år", "elimination": False,
             "values": ["2019", "2020"], "valueTexts": ["2019", "2020"]},
        ],
    }


def test_klassifiser_dimensjoner():
    roller = klassifiser_dimensjoner(_metadata())
    assert roller["region"]["code"] == "Region"
    assert roller["funksjon"]["code"] == "KOKfunksjon0000"
    assert roller["art"]["code"] == "KOKart0000"
    assert roller["tid"]["code"] == "Tid"
    assert roller["contents"]["code"] == "ContentsCode"


def test_klassifiser_dimensjoner_mangler_funksjon():
    md = {"variables": [
        {"code": "Region", "text": "region", "values": ["0301"], "valueTexts": ["Oslo"]},
        {"code": "Tid", "text": "år", "values": ["2020"], "valueTexts": ["2020"]},
    ]}
    with pytest.raises(KildeFeil):
        klassifiser_dimensjoner(md)


def test_velg_contents_foretrekker_kroner_ikke_per_innbygger():
    roller = klassifiser_dimensjoner(_metadata())
    val, faktor = _velg_contents(roller["contents"])
    assert val == "korr"                 # ikke 'Kroner per innbygger'
    assert faktor == pytest.approx(1e-3)  # 1000 kr → mill. kr


def test_klassifiser_enhet():
    assert _klassifiser_enhet("EAK", "Hele landet") == "land"
    assert _klassifiser_enhet("0301", "Oslo") == "kommune"
    assert _klassifiser_enhet("30", "Viken fylke") == "fylke"
    assert _klassifiser_enhet("EKG13", "KOSTRA-gruppe 13") == "gruppe"


def test_stabil_kommune_id():
    mapping = {"1662": {"ny": "5001", "navn": "Trondheim"}}
    assert stabil_kommune_id("1662", mapping) == "5001"
    assert stabil_kommune_id("0301", mapping) == "0301"   # ukjent beholdes


# --- Syntetisk json-stat2-kube ---

def _cube():
    dim_ids = ["Region", "KOKfunksjon0000", "ContentsCode", "Tid"]
    reg = ["EAK", "0301", "1662", "5001"]
    funk = ["120", "202"]
    cont = ["korr"]
    tid = ["2019", "2020"]
    sizes = [len(reg), len(funk), len(cont), len(tid)]

    # beløp i 1000-kr-enheter per (region, funksjon, tid)
    tall = {
        ("EAK", "120"): (1_000_000, 1_100_000), ("EAK", "202"): (3_000_000, 3_300_000),
        ("0301", "120"): (200_000, 220_000),    ("0301", "202"): (600_000, 660_000),
        ("1662", "120"): (1_000, 1_100),         ("1662", "202"): (3_000, 3_300),
        ("5001", "120"): (50_000, 55_000),       ("5001", "202"): (150_000, 165_000),
    }
    values = []
    for r in reg:
        for f in funk:
            for _c in cont:
                for ti, t in enumerate(tid):
                    values.append(float(tall[(r, f)][ti]))

    def _cat(codes, labels=None):
        return {"category": {"index": {c: i for i, c in enumerate(codes)},
                             "label": {c: (labels[i] if labels else c)
                                       for i, c in enumerate(codes)}}}
    return {
        "id": dim_ids, "size": sizes, "value": values,
        "dimension": {
            "Region": _cat(reg, ["Hele landet", "Oslo", "Klæbu", "Trondheim"]),
            "KOKfunksjon0000": _cat(funk, ["Administrasjon", "Grunnskole"]),
            "ContentsCode": _cat(cont, ["Regnskapsførte beløp (1000 kr)"]),
            "Tid": _cat(tid),
        },
    }


def test_jsonstat_iter_row_major():
    cube = _cube()
    celler = dict(())
    hits = {}
    for koder, v in _jsonstat_iter(cube):
        key = (koder["Region"], koder["KOKfunksjon0000"], koder["Tid"])
        hits[key] = v
    # 4 regioner × 2 funksjoner × 2 år = 16 celler
    assert len(hits) == 16
    assert hits[("0301", "202", "2019")] == 600_000
    assert hits[("5001", "120", "2020")] == 55_000


def test_parse_hovedtabell_merge_og_faktor(tmp_path):
    cube = _cube()
    p = tmp_path / "kostra.json"
    p.write_text(json.dumps(cube), encoding="utf-8")
    mapping = {"1662": {"ny": "5001", "navn": "Trondheim"}}
    roller = {"region": "Region", "funksjon": "KOKfunksjon0000", "art": "KOKart0000"}
    enheter = parse_kostra_hovedtabell(p, faktor=1e-3, roller_koder=roller, mapping=mapping)

    # Klæbu (1662) er slått sammen inn i 5001 → 3 enheter, ikke 4
    assert set(enheter) == {"EAK", "0301", "5001"}
    assert enheter["5001"]["navn"] == "Trondheim"
    assert enheter["EAK"]["type"] == "land"
    assert enheter["0301"]["type"] == "kommune"

    # faktor 1e-3: 200 000 (1000 kr) → 200,0 mill. kr
    assert enheter["0301"]["funksjoner"]["120"]["serier"][2019] == pytest.approx(200.0)
    # sammenslåing: Trondheim(150 000) + Klæbu(3 000) = 153 000 → 153,0 mill.
    assert enheter["5001"]["funksjoner"]["202"]["serier"][2019] == pytest.approx(153.0)
    assert enheter["5001"]["funksjoner"]["120"]["serier"][2020] == pytest.approx(56.1)


def test_parse_kostra_mange_merger(tmp_path):
    # To «årsfiler» med samme kube → beløpene skal summeres per enhet/funksjon
    cube = _cube()
    p1 = tmp_path / "y1.json"; p1.write_text(json.dumps(cube), encoding="utf-8")
    p2 = tmp_path / "y2.json"; p2.write_text(json.dumps(cube), encoding="utf-8")
    roller = {"region": "Region", "funksjon": "KOKfunksjon0000", "art": "KOKart0000"}
    from kostra import parse_kostra_mange
    enheter = parse_kostra_mange([p1, p2], faktor=1e-3, roller_koder=roller, mapping={})
    # Oslo funksjon 120, 2019: 200,0 mill × 2 filer = 400,0
    assert enheter["0301"]["funksjoner"]["120"]["serier"][2019] == pytest.approx(400.0)


def test_enhet_node_shape():
    enhet = {"navn": "Oslo", "type": "kommune", "funksjoner": {
        "120": {"navn": "Administrasjon", "serier": {2019: 200.0, 2020: 220.0}},
        "202": {"navn": "Grunnskole", "serier": {2019: 600.0, 2020: 660.0}},
    }}
    node = _enhet_node("0301", enhet)
    assert node["id"] == "kostra-0301"
    assert node["niva"] == "enhet"
    # totalserie = sum av funksjoner
    assert node["serier"]["2019"]["regnskap"] == pytest.approx(800.0)
    # funksjoner sortert etter siste år, størst først (Grunnskole > Administrasjon)
    assert node["children"][0]["navn"] == "Grunnskole"
    assert node["children"][0]["id"] == "kostra-0301-f202"


def test_bygg_kostra_ende_til_ende(tmp_path, monkeypatch):
    cube = _cube()
    raw = tmp_path / "raw_kostra.json"
    raw.write_text(json.dumps(cube), encoding="utf-8")

    # Stub nedlastingen: returner vår syntetiske kube + roller
    def _fake_download(force=False):
        return {"tabell": "TEST", "faktor": 1e-3, "paths": [raw],
                "roller_koder": {"region": "Region",
                                 "funksjon": "KOKfunksjon0000", "art": "KOKart0000"}}
    monkeypatch.setattr(kostra, "download_kostra_hovedtabell", _fake_download)
    monkeypatch.setattr(kostra, "last_kommune_mapping",
                        lambda: {"1662": {"ny": "5001", "navn": "Trondheim"}})

    out = tmp_path / "data"
    resultat = bygg_kostra(out, force=True)

    assert (out / "kostra.json").exists()
    assert resultat["tabell"] == "TEST"
    assert resultat["aar"] == [2019, 2020]
    typer = [n["type"] for n in resultat["enheter"]]
    assert typer[0] == "land"                       # land sorteres først
    assert "kommune" in typer
    # skrevet JSON er gyldig og har enheter
    lest = json.loads((out / "kostra.json").read_text(encoding="utf-8"))
    assert len(lest["enheter"]) == 3


def test_sanity_kostra_fanger_inkonsistens():
    dårlig = {"aar": [2020], "enheter": [{
        "navn": "Feilby", "type": "kommune", "niva": "enhet",
        "serier": {"2020": {"regnskap": 999.0}},   # stemmer ikke med barna
        "children": [{"navn": "F", "serier": {"2020": {"regnskap": 10.0}}}],
    }]}
    with pytest.raises(KildeFeil):
        sanity_kostra(dårlig)
