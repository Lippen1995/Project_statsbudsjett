"""CI must import original source bytes without reaching the blocked live host."""
import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import budget_sources as sources
from budget_proposals import RELEASE_PAGES, read_index
from test_budget_proposals import seed, workbook


def response(url, raw, status=200):
    result = requests.Response()
    result.url, result.status_code = url, status
    result._content, result.encoding = raw, "utf-8"
    return result


@pytest.fixture
def packet(tmp_path, monkeypatch):
    landing = RELEASE_PAGES[2027]
    page = "https://www.regjeringen.no/no/statsbudsjett/2027/tallgrunnlag/"
    url = "https://www.regjeringen.no/content/2027_gulbok_datagrunnlag.xlsx"
    replies = {landing: response(landing, f'<a href="{page}">Tallgrunnlag Gul bok</a>'.encode()),
               page: response(page, f'<a href="{url}">Excel</a>'.encode()),
               url: response(url, workbook())}
    monkeypatch.setattr("readiness_sources.get", lambda address: replies[address])
    root = tmp_path / "sources"
    result = sources.capture(2027, root)
    assert result["status"] == "available"
    monkeypatch.setattr("readiness_sources.get", lambda address: pytest.fail("CI cannot fetch live sources"))
    return root, datetime.fromisoformat(result["sourceCheckedAt"]), replies


def test_native_packet_is_reparsed_archived_and_visible_without_network(packet, tmp_path):
    root, now, replies = packet
    data = tmp_path / "data"
    seed(data)
    result = sources.replay(2027, data, root, now)
    assert result["status"] == "imported"
    assert not result["liveGithubSourceAccess"]
    item = read_index(data)["proposals"][0]
    assert item["hash"] == result["hash"]
    raw = replies[next(url for url in replies if url.endswith("xlsx"))].content
    assert (data / f'budsjettarkiv/raw/{hashlib.sha256(raw).hexdigest()}.xlsx').read_bytes() == raw
    meta = json.loads((data / "meta.json").read_text())
    assert meta["budsjettforslag"][0]["year"] == 2027
    assert sources.replay(2027, data, root, now)["hash"] == result["hash"]
    assert len(read_index(data)["proposals"]) == 1


def test_not_released_is_distinct_from_access_failure(packet, tmp_path, monkeypatch):
    root, _, _ = packet
    monkeypatch.setattr("readiness_sources.get", lambda url: response(url, b"Not yet released"))
    assert sources.capture(2027, root)["status"] == "not-released"
    data = tmp_path / "data"
    seed(data)
    before = (data / "meta.json").read_bytes()
    assert sources.replay(2027, data, root)["status"] == "not-released"
    assert (data / "meta.json").read_bytes() == before
    assert not (data / "budsjettarkiv").exists()


@pytest.mark.parametrize("failure", ["denied", "invalid-workbook"])
def test_failed_capture_preserves_prior_packet(packet, monkeypatch, failure):
    root, _, replies = packet
    before = (root / "index.json").read_bytes()
    if failure == "denied":
        monkeypatch.setattr("readiness_sources.get", lambda url: response(url, b"Forbidden", 403))
    else:
        replies[next(url for url in replies if url.endswith("xlsx"))]._content = b"invalid workbook"
        monkeypatch.setattr("readiness_sources.get", lambda url: replies[url])
    with pytest.raises(Exception):
        sources.capture(2027, root)
    assert (root / "index.json").read_bytes() == before


@pytest.mark.parametrize("failure", ["stale", "wrong-year", "missing-source", "tampered"])
def test_bad_packet_cannot_mutate_production(packet, tmp_path, failure):
    root, now, _ = packet
    packet_data = json.loads((root / "index.json").read_text())
    if failure == "stale":
        now += timedelta(hours=7)
    elif failure == "wrong-year":
        packet_data["year"] = 2026
    elif failure == "missing-source":
        del packet_data["responses"][next(url for url in packet_data["responses"] if url.endswith("xlsx"))]
    else:
        digest = next(iter(packet_data["responses"].values()))["sha256"]
        (root / "originals" / (digest + ".bin")).write_bytes(b"changed")
    (root / "index.json").write_text(json.dumps(packet_data))
    data = tmp_path / "data"
    seed(data)
    before = {path.name: path.read_bytes() for path in data.iterdir()}
    with pytest.raises(ValueError):
        sources.replay(2027, data, root, now)
    assert {path.name: path.read_bytes() for path in data.iterdir()} == before
