"""Read-only integration check before budget day; never publish trial data."""
import argparse
import io
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from budget_proposals import discover, get, parse_gulbok, archive_proposal, reconcile


def previous_failure(run_id=37310297347):
    token, repository = os.environ.get("GH_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or repository != "Lippen1995/Project_statsbudsjett":
        return "Previous run logs unavailable in this execution context"
    try:
        response = requests.get(f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/logs",
                                headers={"Authorization": f"Bearer {token}"}, timeout=45)
    except requests.RequestException:
        return "Previous run logs could not be retrieved; actual source checks still run"
    if response.status_code != 200:
        return f"Previous run logs: HTTP {response.status_code}"
    if not zipfile.is_zipfile(io.BytesIO(response.content)):
        return "Previous run log archive is unavailable"
    with zipfile.ZipFile(io.BytesIO(response.content)) as logs:
        for name in logs.namelist():
            text = logs.read(name).decode("utf-8", errors="replace")
            matches = re.findall(r"(?:requests\.exceptions\.[A-Za-z]+|ValueError|ModuleNotFoundError|ImportError):[^\r\n]{0,600}", text)
            if matches:
                return matches[-1]
    return "No diagnostic exception found in retained import logs"


def check(fetch=None, diagnostic=None):
    fetch = fetch or get
    result = {"checkedAt": datetime.now(timezone.utc).isoformat(), "oldRun": 37310297347,
              "oldFailure": previous_failure(), "partyRun": 37458117681,
              "partyRunFailure": previous_failure(37458117681), "steps": {}}
    # Check the already-read original 2026 file independently of CMS discovery.
    reference = json.loads(Path("editorial/research/budsjett-2027/baseline-2026.json").read_text())["nameReference"]
    try:
        raw = fetch(reference["url"]).content
        import hashlib
        if hashlib.sha256(raw).hexdigest() != reference["sha256"]:
            raise ValueError("Previously verified 2026 original has changed")
        result["steps"]["verified2026File"] = {"status": "passed", "records": len(parse_gulbok(raw)), "sha256": reference["sha256"]}
    except (requests.RequestException, ValueError) as error:
        result["steps"]["verified2026File"] = {"status": "failed", "reason": str(error)}
    # Ordinary browser-compatible HTTP headers can diagnose origin compatibility.
    # Do not retry this way when the response explicitly denies proxy policy.
    url = "https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/"
    try:
        if diagnostic is not None:
            result["httpDiagnostic"] = diagnostic
        else:
            result["httpDiagnostic"] = http_diagnostic(url)
    except requests.RequestException:
        result["httpDiagnostic"] = {"url": url, "status": "connection-failed"}
    try:
        source = discover(2026, fetch=fetch)
        if not source:
            raise ValueError("Official 2026 Gul bok not discovered")
        raw = fetch(source["url"]).content
        records = parse_gulbok(raw)
        if len(records) < 1000:
            raise ValueError("Unexpectedly incomplete real Gul bok fixture")
        with tempfile.TemporaryDirectory(prefix="budget-readiness-") as root:
            data = Path(root) / "data"
            data.mkdir()
            for name in ["meta", "utgifter", "inntekter"]:
                shutil.copyfile(Path("web/public/data") / (name + ".json"), data / (name + ".json"))
            archive_proposal(data, 2026, "initial", raw, source)
            reconcile(data)
            if not (data / "budsjettarkiv/index.json").exists():
                raise ValueError("Trial archive missing")
        result["steps"]["actual2026Import"] = {"status": "passed", "records": len(records), "url": source["url"], "productionDataChanged": False}
    except (requests.RequestException, ValueError, OSError) as error:
        result["steps"]["actual2026Import"] = {"status": "failed", "reason": str(error)}
    try:
        source = discover(2027, fetch=fetch)
        result["steps"]["release2027"] = {"status": "available" if source else "not-released", "source": source}
    except (requests.RequestException, ValueError) as error:
        result["steps"]["release2027"] = {"status": "failed", "reason": str(error)}
    result["passed"] = all(s["status"] != "failed" for s in result["steps"].values())
    return result


def http_diagnostic(url):
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Fellestall/1.0; +https://fellestall.no)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.5"}, timeout=45)
    return {"url": url, "status": response.status_code,
        "server": response.headers.get("Server"), "contentType": response.headers.get("Content-Type"),
        "policyDenied": "domain forbidden" in response.text[:500].lower()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    output = parser.parse_args().output
    result = check()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
