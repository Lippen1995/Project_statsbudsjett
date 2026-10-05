import io
import json
import sys
from pathlib import Path

import openpyxl
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from budget_proposals import archive_proposal, parse_gulbok, reconcile, read_index
from budget_evidence import verify_evidence

SOURCE = {"url": "https://www.regjeringen.no/content/2027_gulbok_datagrunnlag.xlsx", "page": "https://www.regjeringen.no/no/statsbudsjett/2027/tallgrunnlag/", "landing": "https://www.regjeringen.no/no/statsbudsjett/2027/"}


def workbook(duplicate=False, amount=2_000_000):
    w = openpyxl.Workbook()
    sheet = w.active
    sheet.title = "Data"
    sheet.append(["fdep_nr", "fdep_navn", "kap_nr", "post_nr", "kap_navn", "post_navn", "beløp"])
    sheet.append([1, "Utenriksdepartementet", 100, 1, "Utgift", "Drift", amount])
    sheet.append([16, "Finansdepartementet", 5501, 1, "Skatt", "Inntekt", 2_000_000])
    sheet.append([1, "Utenriksdepartementet", 100, 90, "Utgift", "Utlån", 1_000_000])
    if duplicate:
        sheet.append([1, "Utenriksdepartementet", 100, 1, "Utgift", "Drift", 9])
    out = io.BytesIO(); w.save(out); return out.getvalue()


def seed(path):
    path.mkdir(exist_ok=True)
    def tree(prefix, dep, cap, amount):
        return [{"id": f"{prefix}-{dep}", "navn": "Departement", "niva": "departement", "serier": {"2026": {"saldert": amount, "revidert": amount}}, "children": [{"id": f"{prefix}-{dep}-{cap}", "navn": "Kapittel", "niva": "kapittel", "serier": {"2026": {"saldert": amount, "revidert": amount}}, "children": [{"id": f"{prefix}-{dep}-{cap}-01", "navn": "Post", "niva": "post", "serier": {"2026": {"saldert": amount, "revidert": amount}}}]}]}]
    for name, data in [("utgifter", tree("u", "01", "0100", 1)), ("inntekter", tree("i", "16", "5501", 1)), ("meta", {"oppdatert": "2026-10-05T10:00:00Z", "budsjett_aar": [2026], "regnskap_aar": [2025], "siste_budsjett_aar": 2026})]:
        (path / f"{name}.json").write_text(json.dumps(data))


def test_gulbok_uses_kroner_and_rejects_ambiguous_or_missing_values():
    records = parse_gulbok(workbook())
    assert records[0]["amount"] == 2
    assert records[0]["key"] == "0100-01"
    with pytest.raises(ValueError, match="Duplicate"):
        parse_gulbok(workbook(duplicate=True))
    with pytest.raises(ValueError, match="invalid proposal amount"):
        parse_gulbok(workbook(amount=None))


def test_proposal_is_separate_visible_then_replaced_but_archived(tmp_path):
    seed(tmp_path)
    digest = archive_proposal(tmp_path, 2027, "initial", workbook(), SOURCE)
    item = read_index(tmp_path)["proposals"][0]
    original = (tmp_path / item["path"]).read_bytes()
    reconcile(tmp_path)
    trees = {n: json.loads((tmp_path / f"{n}.json").read_text()) for n in ["utgifter", "inntekter"]}
    post = trees["utgifter"][0]["children"][0]["children"][0]
    assert post["serier"]["2027"] == {"forslag": 2}
    assert post["serier"]["2026"]["saldert"] == 1
    assert json.loads((tmp_path / "meta.json").read_text())["budsjettforslag"][0]["year"] == 2027
    # Official adopted data arrive later, in an atomic complete DFØ import.
    for name, tree in trees.items():
        for dep in tree:
            for cap in dep["children"]:
                for p in cap["children"]:
                    p["serier"].setdefault("2027", {})["saldert"] = 3
        (tmp_path / f"{name}.json").write_text(json.dumps(tree))
    reconcile(tmp_path)
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["budsjettforslag"] == []
    item = read_index(tmp_path)["proposals"][0]
    assert item["hash"] == digest and item["visible"] is False
    assert (tmp_path / item["path"]).read_bytes() == original
    assert (tmp_path / item["outcome"]["path"]).exists()
    assert '"forslag"' not in (tmp_path / "utgifter.json").read_text()


def test_raw_source_and_repeated_import_are_immutable(tmp_path):
    seed(tmp_path)
    raw = workbook()
    archive_proposal(tmp_path, 2027, "initial", raw, SOURCE)
    archive_proposal(tmp_path, 2027, "initial", raw, SOURCE)
    assert len(read_index(tmp_path)["proposals"]) == 1
    assert next((tmp_path / "budsjettarkiv/raw").glob("*.xlsx")).read_bytes() == raw
    archive_proposal(tmp_path, 2027, "initial", workbook(amount=3_000_000), SOURCE)
    assert len(read_index(tmp_path)["proposals"]) == 2


def test_units_year_and_incomplete_adoption_fail_closed(tmp_path):
    seed(tmp_path)
    with pytest.raises(ValueError, match="magnitude"):
        archive_proposal(tmp_path, 2027, "initial", workbook(amount=2_000_000_000_000), SOURCE)
    with pytest.raises(ValueError, match="budget year"):
        archive_proposal(tmp_path, 2026, "initial", workbook(), SOURCE)
    archive_proposal(tmp_path, 2027, "initial", workbook(), SOURCE)
    # An income series alone must not make the proposal disappear.
    trees = json.loads((tmp_path / "inntekter.json").read_text())
    trees[0]["children"][0]["children"][0]["serier"]["2027"] = {"saldert": 3}
    (tmp_path / "inntekter.json").write_text(json.dumps(trees))
    reconcile(tmp_path)
    assert read_index(tmp_path)["proposals"][0]["visible"] is True


def test_political_claim_needs_actual_quote_party_year_and_post():
    quote = "Arbeiderpartiet og SV inngår en budsjettavtale for 2027 om økte midler til denne posten."
    item = {"url": "https://www.stortinget.no/no/saker/2027/", "quote": quote, "parties": ["Ap", "SV"], "recordKeys": ["0100-01"], "kind": "agreement"}
    assert verify_evidence(item, quote, 2027, {"0100-01"})["sourceHash"]
    with pytest.raises(ValueError, match="quotation"):
        verify_evidence(item, "En annen tekst om budsjett 2027", 2027, {"0100-01"})
    with pytest.raises(ValueError, match="Named party"):
        verify_evidence({**item, "parties": ["H"]}, quote, 2027, {"0100-01"})
    with pytest.raises(ValueError, match="budget posts"):
        verify_evidence(item, quote, 2027, set())


def test_rnb_requires_frozen_baseline_and_documented_parliamentary_completion(tmp_path):
    from budget_proposals import save, encode
    import hashlib
    seed(tmp_path)
    for name in ["utgifter", "inntekter"]:
        tree = json.loads((tmp_path / f"{name}.json").read_text())
        post = tree[0]["children"][0]["children"][0]
        post["serier"]["2027"] = {"saldert": 1, "revidert": 1.5}
        (tmp_path / f"{name}.json").write_text(json.dumps(tree))
    archive_proposal(tmp_path, 2027, "revised", workbook(), SOURCE)
    reconcile(tmp_path)
    item = read_index(tmp_path)["proposals"][0]
    assert item["visible"] is True and item["baseline"]
    # Mere existence of revised numbers, or a boolean flag, proves nothing.
    meta = json.loads((tmp_path / "meta.json").read_text())
    meta["bekreftede_rnb_vedtak"] = {"2027": True}
    save(tmp_path / "meta.json", meta)
    reconcile(tmp_path)
    assert read_index(tmp_path)["proposals"][0]["visible"] is True
    quote = "Stortinget vedtok revidert nasjonalbudsjett 2027 etter behandlingen."
    digest = hashlib.sha256(quote.encode()).hexdigest()
    path = f"budsjettarkiv/documents/{digest}.json"
    save(tmp_path / path, {"url": "https://www.stortinget.no/no/saker/2027/", "text": quote}, immutable=True)
    meta["bekreftede_rnb_vedtak"]["2027"] = {"year": 2027, "status": "adopted", "quote": quote, "sourceHash": digest, "documentPath": path, "dfoDecision": "2027.05.14 Prp: p117/26-27 i490/26-27"}
    save(tmp_path / "meta.json", meta)
    reconcile(tmp_path)
    assert read_index(tmp_path)["proposals"][0]["visible"] is True
    import pandas as pd
    frame = pd.DataFrame([{ "aar": 2027, "dept_kode": dep, "dept_navn": "Departement", "kap": cap, "kap_navn": "Kapittel", "post": "01", "post_navn": "Post", "saldert": 1, "revidert": 1.5 } for dep, cap in [("01", "0100"), ("16", "5501")]])
    frame.attrs["bevilgning_vedtak"] = {"2027": ["2027.05.14 Prp: p117/26-27 i490/26-27"]}
    reconcile(tmp_path, frame)
    frozen = read_index(tmp_path)["proposals"][0]["outcome"]
    frame["revidert"] = 99
    reconcile(tmp_path, frame)
    assert read_index(tmp_path)["proposals"][0]["outcome"] == frozen
    assert read_index(tmp_path)["proposals"][0]["visible"] is False
    assert (tmp_path / item["path"]).exists()


def test_daily_dfo_arrival_switches_proposal_and_ignores_superseded_versions(tmp_path, monkeypatch):
    import pandas as pd
    import download
    import parse_bevilgning
    from budget_proposals import sync_dfobudgets
    seed(tmp_path)
    archive_proposal(tmp_path, 2027, "initial", workbook(), SOURCE)
    reconcile(tmp_path)
    archive_proposal(tmp_path, 2027, "initial", workbook(amount=3_000_000), SOURCE)
    reconcile(tmp_path)
    frame = pd.DataFrame([{ "aar": 2027, "dept_kode": dep, "dept_navn": "Departement", "kap": cap, "kap_navn": "Kapittel", "post": "01", "post_navn": "Post", "saldert": 3.25, "revidert": 3.25 } for dep, cap in [("01", "0100"), ("16", "5501")]])
    frame.attrs["saldert_aar"] = [2027]
    calls = []
    monkeypatch.setattr(download, "download_bevilgning", lambda force: calls.append(force) or ["fixture.csv"])
    monkeypatch.setattr(parse_bevilgning, "parse_bevilgning", lambda paths: frame)
    sync_dfobudgets(tmp_path)
    item = read_index(tmp_path)["proposals"][-1]
    assert item["visible"] is False
    outcome = json.loads((tmp_path / item["outcome"]["path"]).read_text())
    assert outcome["records"][0]["amount"] == 3.25
    assert json.loads((tmp_path / "meta.json").read_text())["budsjettforslag"] == []
    sync_dfobudgets(tmp_path)
    assert calls == [True]


def test_evidence_archive_fetches_the_quote_and_rejects_invented_party(tmp_path, monkeypatch):
    import requests
    from budget_evidence import archive_evidence
    from budget_evidence_handoff import validate_packet
    seed(tmp_path)
    archive_proposal(tmp_path, 2027, 'initial', workbook(), SOURCE)
    quote = 'Arbeiderpartiet og SV inngår en budsjettavtale for 2027 om økte midler til denne posten.'
    item = {'url': 'https://www.stortinget.no/no/saker/2027/', 'quote': quote, 'parties': ['Ap', 'SV'], 'recordKeys': ['0100-01'], 'kind': 'agreement'}
    class Response:
        url = item['url']
        content = quote.encode()
        text = '<html><script>ignore</script><p>' + quote + '</p></html>'
        def raise_for_status(self):
            pass
    monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: Response())
    archive_evidence(tmp_path, 2027, 'initial', [item])
    stored = read_index(tmp_path)['proposals'][0]['politicalEvidence']
    evidence = json.loads((tmp_path / stored['path']).read_text())[0]
    assert evidence['quote'] == quote
    assert (tmp_path / evidence['documentPath']).exists()
    with pytest.raises(ValueError, match='Named party'):
        archive_evidence(tmp_path, 2027, 'initial', [{**item, 'parties': ['H']}])
    assert read_index(tmp_path)['proposals'][0]['politicalEvidence'] == stored
    assert validate_packet({'version': 1, 'year': 2027, 'phase': 'initial', 'evidence': [item]})
    with pytest.raises(ValueError, match='RNB decision'):
        validate_packet({'version': 1, 'year': 2027, 'phase': 'initial', 'evidence': [item], 'rnbDecision': item})
