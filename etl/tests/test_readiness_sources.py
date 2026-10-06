"""CI replays real captured government sources and rejects untrustworthy evidence."""
import hashlib
import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import readiness_sources as sources


@pytest.fixture
def evidence(tmp_path, monkeypatch):
    monkeypatch.delenv("GH_TOKEN", raising=False)
    root = tmp_path / "sources"
    shutil.copytree(sources.ROOT, root)
    packet = json.loads((root / "index.json").read_text())
    now = datetime.fromisoformat(packet["sourceCheckedAt"])
    return root, packet, now


def save_packet(root, packet):
    (root / "index.json").write_text(json.dumps(packet))


def test_ci_replays_real_original_and_import_without_live_source_access(evidence, monkeypatch):
    root, _, now = evidence
    def forbidden(*args, **kwargs):
        raise AssertionError("CI must not silently use another live-source route")
    monkeypatch.setattr(sources.requests, "get", forbidden)
    before = (Path("web/public/data/meta.json").read_bytes(), Path("web/public/data/utgifter.json").read_bytes())
    result = sources.replay(root, now)
    assert result["passed"]
    assert result["steps"]["verified2026File"]["records"] == 1600
    assert result["steps"]["actual2026Import"]["productionDataChanged"] is False
    assert result["sourceAcquisitionEnvironment"] == "native-workspace"
    assert result["liveGithubSourceAccess"] is False
    assert before == (Path("web/public/data/meta.json").read_bytes(), Path("web/public/data/utgifter.json").read_bytes())


@pytest.mark.parametrize("offset", [timedelta(hours=7), -timedelta(minutes=6)])
def test_stale_or_future_source_evidence_cannot_pass(evidence, offset):
    root, _, now = evidence
    with pytest.raises(ValueError, match="stale or future"):
        sources.replay(root, now + offset)


def test_original_source_bytes_must_match_capture_hash(evidence):
    root, packet, now = evidence
    item = next(iter(packet["responses"].values()))
    (root / "originals" / (item["sha256"] + ".bin")).write_bytes(b"changed source")
    with pytest.raises(ValueError, match="SHA-256"):
        sources.replay(root, now)


def test_workbook_is_checked_against_independent_known_official_hash(evidence):
    root, packet, now = evidence
    item = next(iter(packet["responses"].values()))
    raw = (root / "originals" / (item["sha256"] + ".bin")).read_bytes() + b"changed workbook"
    item["sha256"] = hashlib.sha256(raw).hexdigest()
    (root / "originals" / (item["sha256"] + ".bin")).write_bytes(raw)
    save_packet(root, packet)
    result = sources.replay(root, now)
    assert not result["passed"]
    assert result["steps"]["verified2026File"]["status"] == "failed"


def test_missing_release_page_cannot_be_treated_as_not_released(evidence):
    root, packet, now = evidence
    del packet["responses"][sources.RELEASE_PAGES[2027]]
    save_packet(root, packet)
    with pytest.raises(ValueError, match="Required source"):
        sources.replay(root, now)


def test_foreign_sources_and_http_denial_cannot_pass(evidence):
    root, packet, now = evidence
    item = next(iter(packet["responses"].values()))
    item["url"] = "https://example.com/fake-source"
    save_packet(root, packet)
    with pytest.raises(ValueError, match="official HTTPS"):
        sources.replay(root, now)
    item["url"] = next(iter(packet["responses"]))
    item["status"] = 403
    save_packet(root, packet)
    with pytest.raises(ValueError, match="Invalid captured official"):
        sources.replay(root, now)


def test_failed_live_check_preserves_previous_source_evidence(evidence, monkeypatch):
    root, _, _ = evidence
    before = (root / "index.json").read_bytes()
    monkeypatch.setattr(sources.budget_readiness, "check", lambda **kwargs: {"passed": False, "reason": "HTTP 403"})
    assert sources.capture(root)["passed"] is False
    assert (root / "index.json").read_bytes() == before
