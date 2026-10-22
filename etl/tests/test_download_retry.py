"""Network failures must retry without publishing stale or partial budgets."""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import download


@pytest.mark.parametrize("failure", [requests.ConnectTimeout, requests.ReadTimeout])
def test_timeout_then_success(monkeypatch, failure):
    calls, waits = [], []
    response = SimpleNamespace(status_code=200)

    def request(*args, **kwargs):
        calls.append(kwargs["timeout"])
        if len(calls) == 1:
            raise failure("source unavailable")
        return response

    monkeypatch.setattr(download.requests, "request", request)
    monkeypatch.setattr(download, "_sov", lambda seconds, reason: waits.append(seconds))
    assert download._get("https://statsregnskapet.dfo.no/test.zip") is response
    assert calls == [(15, 300), (15, 300)]
    assert waits == [2]


def test_service_unavailable_respects_retry_after_and_closes_response(monkeypatch):
    closed, waits = [], []
    unavailable = SimpleNamespace(status_code=503, headers={"Retry-After": "7"},
                                  close=lambda: closed.append(True))
    success = SimpleNamespace(status_code=200)
    responses = iter([unavailable, success])
    monkeypatch.setattr(download.requests, "request", lambda *a, **kw: next(responses))
    monkeypatch.setattr(download, "_sov", lambda seconds, reason: waits.append(seconds))
    assert download._get("https://statsregnskapet.dfo.no/test.zip") is success
    assert waits == [7]
    assert closed == [True]


def test_exhausted_timeouts_preserve_existing_download(monkeypatch, tmp_path):
    cached = tmp_path / "bevilgninger"
    cached.mkdir()
    original = cached / "data.csv"
    original.write_bytes(b"previous verified download")
    calls = []

    def request(*args, **kwargs):
        calls.append(True)
        raise requests.ReadTimeout("source unavailable")

    monkeypatch.setattr(download, "RAW_DIR", tmp_path)
    monkeypatch.setattr(download.requests, "request", request)
    monkeypatch.setattr(download, "_sov", lambda *args: None)
    with pytest.raises(download.KildeFeil, match="etter 5 forsøk"):
        download.download_bevilgning(force=True)
    assert len(calls) == 5
    assert original.read_bytes() == b"previous verified download"
