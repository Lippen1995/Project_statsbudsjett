"""Freeze verified party priorities separately from parliamentary agreements."""
import hashlib
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from pypdf import PdfReader
from budget_evidence import Text, PARTIES, normalize
from budget_proposals import encode, save

HOSTS = {"Ap": "arbeiderpartiet.no", "H": "hoyre.no", "FrP": "frp.no", "Sp": "senterpartiet.no", "SV": "sv.no", "KrF": "krf.no", "V": "venstre.no", "MDG": "mdg.no", "R": "roedt.no"}
KINDS = {"programme", "budget-request", "alternative-budget", "stated-priority"}


def source_url(url, party):
    parsed = urlparse(url)
    if (party not in HOSTS or parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.port not in [None, 443] or parsed.hostname not in [HOSTS[party], "www." + HOSTS[party]]):
        raise ValueError("Party priority requires that party's official HTTPS source")
    return url


def validate_priority(item):
    allowed = {"id", "party", "kind", "url", "quote", "sourceDate", "referenceYear", "period", "recordKeys"}
    if (not isinstance(item, dict) or set(item) - allowed
            or not re.fullmatch(r"[a-z]{1,24}", item.get("id", ""))
            or item.get("kind") not in KINDS or item.get("party") not in PARTIES
            or not isinstance(item.get("quote"), str) or not 30 <= len(normalize(item["quote"])) <= 2000):
        raise ValueError("Invalid party priority")
    source_url(item.get("url", ""), item["party"])
    date = item.get("sourceDate")
    if date is not None:
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except (ValueError, TypeError):
            raise ValueError("Invalid source publication date") from None
    period = item.get("period")
    year = item.get("referenceYear")
    if item["kind"] == "programme":
        if (not isinstance(period, list) or len(period) != 2 or any(type(y) is not int for y in period)
                or not 2000 <= period[0] <= period[1] <= 2100 or period[1] - period[0] > 10 or year is not None):
            raise ValueError("Programme requires its actual programme period")
    elif period is not None or (year is not None and (type(year) is not int or not 2000 <= year <= 2100)):
        raise ValueError("Invalid priority reference year")
    if item["kind"] in ["budget-request", "alternative-budget"] and year is None:
        raise ValueError("Budget priority requires its original fiscal year")
    keys = item.get("recordKeys", [])
    if (not isinstance(keys, list) or len(keys) > 20 or len(set(keys)) != len(keys)
            or any(not isinstance(k, str) or not re.fullmatch(r"\d{4}-\d{2}", k) for k in keys)):
        raise ValueError("Invalid priority budget post links")
    return item


def verify_priority(item, document):
    validate_priority(item)
    quote = normalize(item["quote"])
    if quote not in document:
        raise ValueError("Party quotation cannot be verified against its source")
    years = item.get("period") or ([item["referenceYear"]] if item.get("referenceYear") else [])
    if any(not re.search(rf"\b{y}\b", document) for y in years):
        raise ValueError("Priority's original year or programme period is not documented")
    date = item.get("sourceDate")
    if date:
        parsed = datetime.strptime(date, "%Y-%m-%d")
        if date not in document and parsed.strftime("%d.%m.%Y") not in document:
            raise ValueError("Source publication date is not verified; omit unknown dates")
    return {**item, "quote": quote, "sourceDate": date, "referenceYear": item.get("referenceYear"),
            "recordKeys": item.get("recordKeys", []), "sourceHash": hashlib.sha256(document.encode()).hexdigest()}


def fetch_document(url, party):
    # Validate every redirect before fetching it, not just the final response.
    from urllib.parse import urljoin
    for _ in range(6):
        source_url(url, party)
        with requests.get(url, timeout=45, allow_redirects=False, stream=True,
                          headers={"User-Agent": "Fellestall/1.0 (party source verification)"}) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers["Location"])
                continue
            response.raise_for_status()
            parts, size = [], 0
            for part in response.iter_content(65536):
                size += len(part)
                if size > 16 * 1024 * 1024:
                    raise ValueError("Party document exceeds the source size limit")
                parts.append(part)
            raw = b"".join(parts)
            if raw.startswith(b"%PDF-"):
                reader = PdfReader(io.BytesIO(raw))
                if reader.is_encrypted or len(reader.pages) > 500:
                    raise ValueError("Unsupported party PDF")
                document = normalize(" ".join(page.extract_text() or "" for page in reader.pages))
                suffix = "pdf"
            else:
                if "html" not in response.headers.get("Content-Type", "").lower():
                    raise ValueError("Party source must be HTML or PDF")
                parser = Text()
                parser.feed(raw.decode(response.encoding or "utf-8"))
                document = normalize(" ".join(parser.parts))
                suffix = "html"
            if not document:
                raise ValueError("Party document has no readable source text")
            return document, raw, suffix, url
    raise ValueError("Too many party source redirects")


def archive_priorities(data_dir, year, phase, items):
    if type(year) is not int or not 2000 <= year <= 2100 or phase not in ["initial", "revised"]:
        raise ValueError("Invalid party research year or phase")
    if not isinstance(items, list) or not 1 <= len(items) <= 36:
        raise ValueError("Choose one to thirty-six documented priorities")
    ids = set()
    for item in items:
        validate_priority(item)
        if item["id"] in ids:
            raise ValueError("Duplicate party priority ID")
        ids.add(item["id"])
    checked, documents, cached = [], [], {}
    for item in items:
        key = (item["party"], item["url"])
        if key not in cached:
            cached[key] = fetch_document(item["url"], item["party"])
        document, raw, suffix, resolved_url = cached[key]
        verified = verify_priority(item, document)
        source_hash = verified["sourceHash"]
        raw_hash = hashlib.sha256(raw).hexdigest()
        document_path = f"party-research/documents/{source_hash}.json"
        raw_path = f"party-research/raw/{raw_hash}.{suffix}"
        retrieved_at = datetime.now(timezone.utc).isoformat()
        # All citations must verify before the archive's index changes.
        documents.append((document_path, {"url": item["url"], "resolvedUrl": resolved_url, "text": document}))
        documents.append((raw_path, raw))
        checked.append({**verified, "documentPath": document_path, "rawPath": raw_path,
                        "rawHash": raw_hash, "retrievedAt": retrieved_at})
    index_path = data_dir / "party-research/index.json"
    import json
    index = json.loads(index_path.read_text()) if index_path.exists() else {"version": 1, "snapshots": []}
    # Repeat verification of unchanged content reuses its first immutable capture.
    semantic = lambda rows: [{k: v for k, v in row.items() if k != "retrievedAt"} for row in rows]
    matching = [s for s in index["snapshots"] if s["year"] == year and s["phase"] == phase]
    if matching:
        previous = json.loads((data_dir / matching[-1]["path"]).read_text())
        if semantic(previous) == semantic(checked):
            return matching[-1]
    for path, document in documents:
        target = data_dir / path
        if isinstance(document, bytes):
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and target.read_bytes() != document:
                raise ValueError("Archived original party source cannot be overwritten")
            target.write_bytes(document)
        else:
            save(target, document, immutable=True)
    digest = hashlib.sha256(encode(checked)).hexdigest()
    path = f"party-research/{year}/{phase}/{digest}.json"
    save(data_dir / path, checked, immutable=True)
    snapshot = {"year": year, "phase": phase, "hash": digest, "path": path}
    index["snapshots"].append(snapshot)
    save(index_path, index)
    return snapshot


if __name__ == "__main__":
    import argparse
    import json
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--phase", choices=["initial", "revised"], default="initial")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("web/public/data"))
    args = parser.parse_args()
    packet = json.loads(args.input.read_text())
    if (not isinstance(packet, dict) or set(packet) - {"version", "year", "phase", "priorities"}
            or packet.get("version") != 1 or packet.get("year") != args.year or packet.get("phase") != args.phase):
        raise ValueError("Native source check requires a matching priority-only packet")
    result = archive_priorities(args.data_dir, args.year, args.phase, packet.get("priorities"))
    print(f"Party sources verified and archived: {result['hash']}. No article published.")
