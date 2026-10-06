"""Native source acquisition; independent CI discovery, parsing and publication.

The packet contains original official responses, never precomputed budget amounts.
GitHub cannot reach the government source directly; no live fallback is used.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from budget_proposals import archive_proposal, discover, parse_gulbok, reconcile
from readiness_sources import Capture, load_capture

ROOT = Path("editorial/research/budsjett-2027/import-evidence")


def capture(year, root=ROOT):
    started = datetime.now(timezone.utc).isoformat()
    sources = Capture()
    source = discover(year, fetch=sources.fetch)
    if source:
        # Reject invalid workbooks before replacing the previous source packet.
        parse_gulbok(sources.fetch(source["url"]).content)
    packet = {"version": 1, "year": year, "sourceCheckedAt": started,
              "sourceAcquisitionEnvironment": "native-workspace", "responses": sources.responses}
    root.mkdir(parents=True, exist_ok=True)
    for digest, raw in sources.bodies.items():
        path = root / "originals" / (digest + ".bin")
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() != raw:
            raise ValueError("An original budget source cannot be overwritten")
        path.write_bytes(raw)
    (root / "index.json").write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n")
    return {"year": year, "status": "available" if source else "not-released",
            "sourceCheckedAt": started}


def replay(year, data_dir=Path("web/public/data"), root=ROOT, now=None):
    packet, fetch = load_capture(root, now)
    if packet.get("year") != year:
        raise ValueError("Captured source packet does not match the requested budget year")
    source = discover(year, fetch=fetch)
    if source is None:
        return {"year": year, "status": "not-released", "dataChanged": False}
    content = fetch(source["url"]).content
    digest = archive_proposal(data_dir, year, "initial", content, source)
    reconcile(data_dir)
    return {"year": year, "status": "imported", "hash": digest,
            "originalSha256": hashlib.sha256(content).hexdigest(),
            "sourceCheckedAt": packet["sourceCheckedAt"], "liveGithubSourceAccess": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--capture", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--data-dir", type=Path, default=Path("web/public/data"))
    args = parser.parse_args()
    if not 2000 <= args.year <= 2100:
        parser.error("Invalid budget year")
    result = capture(args.year, args.root) if args.capture else replay(args.year, args.data_dir, args.root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
