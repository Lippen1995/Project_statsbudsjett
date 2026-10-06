"""Capture live official sources in the native environment and replay the check in CI.

CI independently checks freshness, original-file hashes, discovery and import.
It does not claim that GitHub's own network can reach the government website.
"""
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
import budget_readiness
from budget_proposals import get, source_url, RELEASE_PAGES

ROOT = Path("editorial/research/budsjett-2027/readiness-evidence")
MAX_AGE = timedelta(hours=6)


class Capture:
    def __init__(self):
        self.responses = {}
        self.bodies = {}

    def fetch(self, url):
        try:
            response = get(url)
        except requests.HTTPError as error:
            if error.response is None:
                raise
            response = error.response
        source_url(url)
        source_url(response.url)
        raw = response.content
        if len(raw) > 32 * 1024 * 1024:
            raise ValueError("Readiness source exceeds the import limit")
        digest = hashlib.sha256(raw).hexdigest()
        self.bodies[digest] = raw
        self.responses[url] = {"url": response.url, "status": response.status_code,
                               "sha256": digest, "encoding": response.encoding or "utf-8"}
        response.raise_for_status()
        return response


def capture(root=ROOT):
    sources = Capture()
    result = budget_readiness.check(fetch=sources.fetch)
    result["sourceAcquisitionEnvironment"] = "native-workspace"
    if not result["passed"]:
        # Preserve prior immutable evidence; a failed live check never replaces it.
        return result
    root.mkdir(parents=True, exist_ok=True)
    for digest, raw in sources.bodies.items():
        path = root / "originals" / (digest + ".bin")
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() != raw:
            raise ValueError("An original readiness source cannot be overwritten")
        path.write_bytes(raw)
    packet = {"version": 1, "sourceCheckedAt": result["checkedAt"],
              "sourceAcquisitionEnvironment": "native-workspace", "responses": sources.responses}
    (root / "index.json").write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n")
    return result


def replay(root=ROOT, now=None):
    packet = json.loads((root / "index.json").read_text())
    if packet.get("version") != 1 or packet.get("sourceAcquisitionEnvironment") != "native-workspace":
        raise ValueError("Unknown readiness source packet")
    captured_at = datetime.fromisoformat(packet["sourceCheckedAt"])
    now = now or datetime.now(timezone.utc)
    if captured_at.tzinfo is None or not -timedelta(minutes=5) <= now - captured_at <= MAX_AGE:
        raise ValueError("Readiness sources are stale or future-dated; repeat the live native check")
    records = packet["responses"]
    if not isinstance(records, dict) or not 1 <= len(records) <= 12:
        raise ValueError("Invalid captured source list")
    restored = {}
    for requested_url, item in records.items():
        source_url(requested_url)
        source_url(item["url"])
        digest = item["sha256"]
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or item["status"] not in (200, 404):
            raise ValueError("Invalid captured official source")
        path = root / "originals" / (digest + ".bin")
        if path.stat().st_size > 32 * 1024 * 1024:
            raise ValueError("Captured source exceeds the import limit")
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError("Captured source SHA-256 mismatch")
        response = requests.Response()
        response.status_code, response.url = item["status"], item["url"]
        response._content, response.encoding = raw, item["encoding"]
        restored[requested_url] = response

    def fetch(url):
        source_url(url)
        if url not in restored:
            raise ValueError("Required source was not captured by the live native check: " + url)
        response = restored[url]
        response.raise_for_status()
        return response

    release = fetch(RELEASE_PAGES[2027])
    result = budget_readiness.check(fetch=fetch, diagnostic={"url": release.url, "status": release.status_code,
                                                            "transport": "verified-native-source-capture"})
    result.update(sourceCheckedAt=packet["sourceCheckedAt"], sourceAcquisitionEnvironment="native-workspace",
                  verificationEnvironment="github-actions" if os.environ.get("GITHUB_ACTIONS") == "true" else "local-replay",
                  liveGithubSourceAccess=False)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = capture(args.root) if args.capture else replay(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
