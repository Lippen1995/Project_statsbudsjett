"""Import JSON-only source citations from a controlled native-AI delivery branch.

Execute this file from trusted main, never from the delivery branch. Source
quotations are fetched and verified independently before data are committed.
"""
import base64
import json
import os
import re
from pathlib import Path

import requests
from budget_evidence import archive_evidence, archive_rnb_decision
from budget_proposals import sync_dfobudgets

INPUT_PATH = "editorial/handoff/budget-evidence.json"


def validate_packet(packet):
    if (not isinstance(packet, dict) or packet.get("version") != 1
            or type(packet.get("year")) is not int or not 2000 <= packet["year"] <= 2100
            or packet.get("phase") not in ["initial", "revised"]
            or not isinstance(packet.get("evidence"), list) or len(packet["evidence"]) > 30
            or any(not isinstance(item, dict) for item in packet["evidence"])
            or (not packet["evidence"] and not packet.get("rnbDecision"))):
        raise ValueError("Invalid budget documentation packet")
    if packet.get("rnbDecision") and (packet["phase"] != "revised" or not isinstance(packet["rnbDecision"], dict)):
        raise ValueError("RNB decision requires the revised phase")
    return packet


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    sha = os.environ["GITHUB_SHA"]
    repo = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[a-f0-9]{40}", sha) or event.get("after") != sha or not event.get("ref", "").startswith("refs/heads/analysis/budget-evidence-"):
        raise ValueError("Invalid budget documentation delivery commit")
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {os.environ['GH_TOKEN']}", "Accept": "application/vnd.github+json"})

    def api(path):
        response = session.get(f"https://api.github.com/repos/{repo}{path}", timeout=30)
        response.raise_for_status()
        return response.json()

    permission = api(f"/collaborators/{os.environ['GITHUB_ACTOR']}/permission")["permission"]
    if permission not in ["admin", "maintain", "write"]:
        raise ValueError("Budget delivery requires repository write access")
    comparison = api(f"/compare/main...{sha}")
    files = comparison.get("files", [])
    if len(files) != 1 or files[0].get("filename") != INPUT_PATH or files[0].get("status") not in ["added", "modified"]:
        raise ValueError("Delivery branch may change only the budget documentation JSON")
    content = api(f"/contents/{INPUT_PATH}?ref={sha}")
    if content.get("size", 0) > 1024 * 1024 or content.get("encoding") != "base64":
        raise ValueError("Unsupported budget packet size or encoding")
    packet = validate_packet(json.loads(base64.b64decode(content["content"], validate=False)))
    data_dir = Path("web/public/data")
    if packet["evidence"]:
        archive_evidence(data_dir, packet["year"], packet["phase"], packet["evidence"])
    if packet.get("rnbDecision"):
        archive_rnb_decision(data_dir, packet["year"], packet["rnbDecision"])
        sync_dfobudgets(data_dir)
    print("Official budget citations verified and archived; no article published")


if __name__ == "__main__":
    main()
