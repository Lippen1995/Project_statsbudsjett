"""Archive verifiable political documentation, never infer ownership from deltas."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import requests
from budget_proposals import encode, read_index, save

PARTIES = {"Ap": ["Arbeiderpartiet", "Arbeidarpartiet", "Ap"], "H": ["Høyre", "Høgre"], "FrP": ["Fremskrittspartiet", "Framstegspartiet", "FrP"], "Sp": ["Senterpartiet", "Sp"], "SV": ["Sosialistisk Venstreparti", "SV"], "KrF": ["Kristelig Folkeparti", "Kristeleg Folkeparti", "KrF"], "V": ["Venstre"], "MDG": ["Miljøpartiet De Grønne", "MDG"], "R": ["Rødt", "Raudt"]}
KINDS = {"agreement", "committee-recommendation", "vote", "adopted-amendment"}


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip, self.parts = 0, []

    def handle_starttag(self, tag, attrs):
        if tag in ["script", "style"]:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ["script", "style"]:
            self.skip -= 1

    def handle_data(self, text):
        if not self.skip:
            self.parts.append(text)


def normalize(text):
    return " ".join(text.split())


def verify_evidence(item, document, year, record_keys):
    url = urlparse(item["url"])
    if url.scheme != "https" or url.hostname not in ["www.regjeringen.no", "www.stortinget.no"] or url.username:
        raise ValueError("Political documentation requires an official HTTPS source")
    quote = normalize(item.get("quote", ""))
    if len(quote) < 30 or len(quote) > 2000 or quote not in document or str(year) not in document:
        raise ValueError("Political quotation or fiscal year cannot be verified against the source")
    parties = item.get("parties", [])
    if not parties or any(p not in PARTIES or not any(re.search(rf"\b{re.escape(alias)}\b", quote, re.I) for alias in PARTIES[p]) for p in parties):
        raise ValueError("Named party is not documented in the quotation")
    if item.get("kind") not in KINDS or not item.get("recordKeys") or any(k not in record_keys for k in item["recordKeys"]):
        raise ValueError("Political evidence must identify its document type and budget posts")
    markers = {"agreement": r"budsjettavtal|budsjettenighet|avtale om.*budsjett", "committee-recommendation": r"innstilling|innst\.|komit", "vote": r"votering|stemte|stemde|vedtatt med", "adopted-amendment": r"vedtak|vedtatt|vedteke|votering"}
    if not re.search(markers[item["kind"]], document, re.I):
        raise ValueError("Political document type is not supported by the source")
    # A voting record only documents support. The writer cannot upgrade it to
    # proof that a party negotiated or originated the amendment.
    return {"kind": item["kind"], "parties": parties, "recordKeys": item["recordKeys"], "quote": quote, "url": item["url"], "sourceHash": hashlib.sha256(document.encode()).hexdigest()}


def archive_evidence(data_dir, year, phase, items):
    index = read_index(data_dir)
    targets = [p for p in index["proposals"] if p["year"] == year and p["phase"] == phase]
    if not targets:
        raise ValueError("No archived proposal for this evidence")
    target = targets[-1]
    proposal = json.loads((data_dir / target["path"]).read_text())
    keys = {r["key"] for r in proposal["records"]}
    if target.get("outcome"):
        outcome = json.loads((data_dir / target["outcome"]["path"]).read_text())
        keys |= {r["key"] for r in outcome["records"]}
    result = []
    for item in items:
        parsed = urlparse(item.get("url", ""))
        if parsed.scheme != "https" or parsed.hostname not in ["www.regjeringen.no", "www.stortinget.no"] or parsed.username:
            raise ValueError("Untrusted political source")
        response = requests.get(item["url"], timeout=30)
        response.raise_for_status()
        if urlparse(response.url).scheme != "https" or urlparse(response.url).hostname not in ["www.regjeringen.no", "www.stortinget.no"] or len(response.content) > 8 * 1024 * 1024:
            raise ValueError("Political source redirected outside trusted sources or is too large")
        text = Text()
        text.feed(response.text)
        document = normalize(" ".join(text.parts))
        verified = verify_evidence(item, document, year, keys)
        path = f"budsjettarkiv/documents/{verified['sourceHash']}.json"
        save(data_dir / path, {"url": item["url"], "text": document}, immutable=True)
        result.append({**verified, "documentPath": path})
    digest = hashlib.sha256(encode(result)).hexdigest()
    path = f"budsjettarkiv/{year}/{phase}/political-{digest}.json"
    save(data_dir / path, result, immutable=True)
    target["politicalEvidence"] = {"hash": digest, "path": path}
    save(data_dir / "budsjettarkiv/index.json", index)


def archive_rnb_decision(data_dir, year, item):
    parsed = urlparse(item.get("url", ""))
    if parsed.scheme != "https" or parsed.hostname != "www.stortinget.no":
        raise ValueError("RNB adoption must be documented by Stortinget")
    if not isinstance(item.get("dfoDecision"), str) or len(item["dfoDecision"]) < 10:
        raise ValueError("RNB adoption requires the exact DFØ allocation decision label")
    response = requests.get(item["url"], timeout=30)
    response.raise_for_status()
    if urlparse(response.url).scheme != "https" or urlparse(response.url).hostname != "www.stortinget.no" or len(response.content) > 8 * 1024 * 1024:
        raise ValueError("Untrusted or oversized RNB source")
    parser = Text(); parser.feed(response.text)
    text = normalize(" ".join(parser.parts)); quote = normalize(item.get("quote", ""))
    if len(quote) < 30 or quote not in text or str(year) not in quote or "revidert" not in quote.lower() or not re.search(r"vedtatt|vedteke|vedtok", quote, re.I):
        raise ValueError("RNB adoption is not verified by the supplied quotation")
    digest = hashlib.sha256(text.encode()).hexdigest()
    path = f"budsjettarkiv/documents/{digest}.json"
    save(data_dir / path, {"url": item["url"], "text": text}, immutable=True)
    meta = json.loads((data_dir / "meta.json").read_text())
    meta.setdefault("bekreftede_rnb_vedtak", {})[str(year)] = {"year": year, "status": "adopted", "documentPath": path, "sourceHash": digest, "quote": quote, "dfoDecision": item["dfoDecision"]}
    save(data_dir / "meta.json", meta)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-rnb", action="store_true")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--phase", choices=["initial", "revised"], default="initial")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("web/public/data"))
    args = parser.parse_args()
    items = json.loads(args.input.read_text())
    if args.confirm_rnb:
        archive_rnb_decision(args.data_dir, args.year, items)
    else:
        archive_evidence(args.data_dir, args.year, args.phase, items)
