"""Immutable Gul bok proposals, official outcomes and a separate visible series.

Proposal amounts are kroner in the verified Data sheet, normalized to mill. kr.
A proposal is never written into saldert/revidert. RNB adoption must be confirmed
explicitly; the mere existence of a cumulative revidert series is not sufficient.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import openpyxl
import requests

SOURCE_HOST = "www.regjeringen.no"
HEADERS = {"User-Agent": "Fellestall/1.0 (official budget data import)"}
REQUIRED = {"fdep_nr", "fdep_navn", "kap_nr", "post_nr", "kap_navn", "post_navn", "beløp"}
# Official release page read during the budget-day preparation; not an invented workbook URL.
RELEASE_PAGES = {2027: "https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/"}


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def save(path, value, immutable=False):
    data = encode(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    if immutable and path.exists() and path.read_bytes() != data:
        raise ValueError("An archived budget version cannot be overwritten")
    path.write_bytes(data)


def source_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != SOURCE_HOST or parsed.username:
        raise ValueError("Gul bok must come from the official HTTPS source")
    return url


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.href, self.text = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href, self.text = dict(attrs).get("href"), []

    def handle_data(self, text):
        if self.href:
            self.text.append(text)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append((self.href, " ".join(" ".join(self.text).split())))
            self.href = None


def get(url):
    source_url(url)
    response = requests.get(url, headers=HEADERS, timeout=45)
    response.raise_for_status()
    source_url(response.url)
    if len(response.content) > 32 * 1024 * 1024:
        raise ValueError("Budget source exceeds the import limit")
    return response


def discover(year, fetch=None):
    fetch = fetch or get
    landing = RELEASE_PAGES.get(year, f"https://{SOURCE_HOST}/no/statsbudsjett/{year}/")
    try:
        page = fetch(landing)
    except requests.HTTPError as error:
        if error.response is None or error.response.status_code != 404:
            raise
        # The short year route is not necessarily a published CMS page.
        overview = fetch(f"https://{SOURCE_HOST}/no/statsbudsjett/")
        parser = Links()
        parser.feed(overview.text)
        candidates = sorted({urljoin(overview.url, h) for h, _ in parser.links
                             if re.fullmatch(rf"/no/statsbudsjett/{year}/id\d+/?", urlparse(urljoin(overview.url, h)).path)})
        if not candidates:
            return None
        if len(candidates) != 1:
            raise ValueError("Ambiguous official budget release page")
        page = fetch(source_url(candidates[0]))
    parser = Links()
    parser.feed(page.text)
    links = [urljoin(page.url, h) for h, text in parser.links if "tallgrunnlag" in text.lower() and "gul bok" in text.lower()]
    if not links:
        return None  # Not yet released; scheduled retries must not invent a URL.
    if len(set(links)) != 1:
        raise ValueError("Ambiguous Gul bok source")
    workbook_page = fetch(links[0])
    parser = Links()
    parser.feed(workbook_page.text)
    files = [urljoin(workbook_page.url, h) for h, _ in parser.links if re.search(rf"{year}.*gul[-_ ]?bok.*\.xlsx$", urlparse(h).path, re.I)]
    if len(set(files)) != 1:
        raise ValueError("Missing or ambiguous official Gul bok workbook")
    return {"landing": page.url, "page": workbook_page.url, "url": source_url(files[0])}


def parse_gulbok(content):
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    if "Data" not in workbook:
        raise ValueError("Gul bok is missing the verified Data sheet")
    rows = workbook["Data"].iter_rows(values_only=True)
    headings = next(rows)
    if len(set(headings)) != len(headings) or not REQUIRED.issubset(headings):
        raise ValueError("Changed Gul bok column schema; explicit parser review required")
    records, seen = [], set()
    for row in rows:
        if all(value is None for value in row):
            continue
        r = dict(zip(headings, row))
        for key, lower, upper in [("kap_nr", 1, 5999), ("post_nr", 1, 99), ("fdep_nr", 1, 99)]:
            value = r[key]
            if not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value or not lower <= value <= upper:
                raise ValueError(f"Invalid Gul bok identifier: {key}")
        kap, post = f"{int(r['kap_nr']):04d}", f"{int(r['post_nr']):02d}"
        key = f"{kap}-{post}"
        if key in seen:
            raise ValueError("Duplicate chapter/post in Gul bok; no implicit summing")
        seen.add(key)
        amount = r["beløp"]
        if not isinstance(amount, (int, float)) or not math.isfinite(amount):
            raise ValueError("Missing, formula-only or invalid proposal amount")
        for label in ["fdep_navn", "kap_navn", "post_navn"]:
            if not isinstance(r[label], str) or not r[label].strip():
                raise ValueError("Missing budget post name")
        records.append({"key": key, "department": f"{int(r['fdep_nr']):02d}", "departmentName": r["fdep_navn"].strip(), "chapter": kap, "chapterName": r["kap_navn"].strip(), "post": post, "postName": r["post_navn"].strip(), "amount": amount / 1e6})
    if not records or not any(r["chapter"] < "3000" for r in records) or not any(r["chapter"] >= "3000" for r in records):
        raise ValueError("Incomplete Gul bok workbook")
    return sorted(records, key=lambda r: r["key"])


def read_index(data_dir):
    path = data_dir / "budsjettarkiv/index.json"
    return json.loads(path.read_text()) if path.exists() else {"version": 1, "proposals": []}


def archive_proposal(data_dir, year, phase, content, source, published_at=None):
    if phase not in ["initial", "revised"] or not 2000 <= year <= 2100:
        raise ValueError("Invalid proposal year or phase")
    source_url(source["url"])
    source_url(source["page"])
    if source.get("landing"):
        source_url(source["landing"])
    if not re.search(rf"{year}.*gul[-_ ]?bok.*\.xlsx$", urlparse(source["url"]).path, re.I):
        raise ValueError("The official source filename does not match the budget year")
    records = parse_gulbok(content)
    if (data_dir / "meta.json").exists():
        current = {name: json.loads((data_dir / f"{name}.json").read_text()) for name in ["utgifter", "inntekter"]}
        baseline = official_records(current, year - 1, "saldert")
        before = sum(r["amount"] for r in baseline if r["chapter"] < "3000")
        after = sum(r["amount"] for r in records if r["chapter"] < "3000")
        if before > 0 and not 0.1 < after / before < 10:
            raise ValueError("Gul bok magnitude does not match kroner; check unit or completeness")
    source_hash = hashlib.sha256(content).hexdigest()
    snapshot = {"version": 1, "year": year, "phase": phase, "status": "proposal", "unit": "mill_kr", "source": {**source, "sha256": source_hash, "originalUnit": "kr"}, "records": records}
    digest = hashlib.sha256(encode(snapshot)).hexdigest()
    path = f"budsjettarkiv/{year}/{phase}/proposal-{digest}.json"
    save(data_dir / path, snapshot, immutable=True)
    raw = data_dir / f"budsjettarkiv/raw/{source_hash}.xlsx"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if raw.exists() and raw.read_bytes() != content:
        raise ValueError("Raw source hash collision")
    raw.write_bytes(content)
    index = read_index(data_dir)
    if not any(p["hash"] == digest for p in index["proposals"]):
        item = {"year": year, "phase": phase, "hash": digest, "path": path, "importedAt": published_at or datetime.now(timezone.utc).isoformat()}
        if phase == "revised":
            trees = {name: json.loads((data_dir / f"{name}.json").read_text()) for name in ["utgifter", "inntekter"]}
            baseline = {"year": year, "records": official_records(trees, year, "revidert"), "label": "Vedtatt budsjett før RNB-forslaget"}
            if not baseline["records"]:
                raise ValueError("RNB proposal needs a frozen same-year adopted baseline")
            baseline_hash = hashlib.sha256(encode(baseline)).hexdigest()
            baseline_path = f"budsjettarkiv/{year}/{phase}/baseline-{baseline_hash}.json"
            save(data_dir / baseline_path, baseline, immutable=True)
            item["baseline"] = {"path": baseline_path, "hash": baseline_hash}
        index["proposals"].append(item)
        save(data_dir / "budsjettarkiv/index.json", index)
    return digest


def official_records(trees, year, series, bevilgning_df=None):
    # DFØ's parsed frame retains more precision than the site's rounded trees.
    if bevilgning_df is not None:
        rows = []
        for r in bevilgning_df[bevilgning_df["aar"] == year].itertuples(index=False):
            amount = getattr(r, series)
            if math.isfinite(amount):
                rows.append({"key": f"{str(r.kap).zfill(4)}-{str(r.post).zfill(2)}", "department": str(r.dept_kode).zfill(2), "departmentName": str(r.dept_navn), "chapter": str(r.kap).zfill(4), "chapterName": str(r.kap_navn), "post": str(r.post).zfill(2), "postName": str(r.post_navn), "amount": float(amount)})
        grouped = {}
        for row in rows:
            key = row["key"]
            if key in grouped:
                row["amount"] += grouped[key]["amount"]
            grouped[key] = row
        return sorted(grouped.values(), key=lambda r: r["key"])
    records = []
    for tree in trees.values():
        for department in tree:
            for chapter in department.get("children", []):
                for post in chapter.get("children", []):
                    amount = post.get("serier", {}).get(str(year), {}).get(series)
                    if amount is not None:
                        records.append({"key": f"{chapter['id'].split('-')[-1]}-{post['id'].split('-')[-1]}", "department": department['id'].split('-')[-1], "departmentName": department['navn'], "chapter": chapter['id'].split('-')[-1], "chapterName": chapter['navn'], "post": post['id'].split('-')[-1], "postName": post['navn'], "amount": amount})
    return sorted(records, key=lambda r: r["key"])


def add_visible(trees, snapshot, field="forslag"):
    year = str(snapshot["year"])
    for record in snapshot["records"]:
        side = "utgifter" if record["chapter"] < "3000" else "inntekter"
        prefix = "u" if side == "utgifter" else "i"
        d_id = f"{prefix}-{record['department']}"
        k_id, p_id = f"{d_id}-{record['chapter']}", f"{d_id}-{record['chapter']}-{record['post']}"
        nodes = trees[side]
        department = next((n for n in nodes if n["id"] == d_id), None)
        if department is None:
            department = {"id": d_id, "navn": record["departmentName"], "niva": "departement", "serier": {}, "children": []}
            nodes.append(department)
        chapter = next((n for n in department.setdefault("children", []) if n["id"] == k_id), None)
        if chapter is None:
            chapter = {"id": k_id, "navn": record["chapterName"], "niva": "kapittel", "tag": f"Kap. {int(record['chapter'])}", "serier": {}, "children": []}
            department["children"].append(chapter)
        post = next((n for n in chapter.setdefault("children", []) if n["id"] == p_id), None)
        if post is None:
            post = {"id": p_id, "navn": record["postName"], "niva": "post", "tag": f"Post {record['post']}", "serier": {}}
            if int(record["post"]) >= 90:
                post["fin"] = True
            if record["chapter"] in ["2800", "5800"]:
                post["transfer"] = True
            chapter["children"].append(post)
        post.setdefault("serier", {}).setdefault(year, {})[field] = record["amount"]
        for node in [department, chapter]:
            series = node.setdefault("serier", {}).setdefault(year, {})
            series[field] = series.get(field, 0) + record["amount"]


def confirmed_rnb(data_dir, meta, year, bevilgning_df=None):
    decision = meta.get("bekreftede_rnb_vedtak", {}).get(str(year))
    if not isinstance(decision, dict) or decision.get("year") != year or decision.get("status") != "adopted":
        return False
    path = decision.get("documentPath", "")
    if not re.fullmatch(r"budsjettarkiv/documents/[a-f0-9]{64}\.json", path):
        return False
    document_path = data_dir / path
    if not document_path.exists():
        return False
    if bevilgning_df is None or decision.get("dfoDecision") not in bevilgning_df.attrs.get("bevilgning_vedtak", {}).get(str(year), []):
        return False
    document = json.loads(document_path.read_text())
    url = urlparse(document.get("url", ""))
    quote = decision.get("quote", "")
    return (url.scheme == "https" and url.hostname == "www.stortinget.no"
            and hashlib.sha256(document["text"].encode()).hexdigest() == decision.get("sourceHash")
            and len(quote) >= 30 and quote in document["text"]
            and str(year) in quote and "revidert" in quote.lower()
            and re.search(r"vedtatt|vedteke|vedtok", quote, re.I) is not None)


def reconcile(data_dir, bevilgning_df=None):
    index = read_index(data_dir)
    if not index["proposals"]:
        return
    trees = {name: json.loads((data_dir / f"{name}.json").read_text()) for name in ["utgifter", "inntekter"]}
    meta = json.loads((data_dir / "meta.json").read_text())
    def clear(nodes):
        for node in nodes:
            for series in node.get("serier", {}).values():
                series.pop("forslag", None)
            clear(node.get("children", []))
    for nodes in trees.values():
        clear(nodes)
    latest = {}
    for item in index["proposals"]:
        latest[(item["year"], item["phase"])] = item
    active = []
    for (year, phase), item in latest.items():
        snapshot = json.loads((data_dir / item["path"]).read_text())
        if hashlib.sha256(encode(snapshot)).hexdigest() != item["hash"]:
            raise ValueError("Archived proposal checksum mismatch")
        sources = meta.setdefault("kilder", [])
        if not any(source.get("url") == snapshot["source"]["page"] for source in sources):
            sources.append({"navn": "Regjeringens tallgrunnlag (Gul bok)", "url": snapshot["source"]["page"]})
        if phase == "revised" and item.get("outcome"):
            # Freeze RNB at the confirmed decision; subsequent supplementary
            # budgets must not rewrite the parliamentary comparison.
            item["visible"] = False
            continue
        # Do NOT equate any cumulative revised series with a final RNB decision.
        series = "saldert" if phase == "initial" else "revidert"
        confirmed = (phase == "initial" and (bevilgning_df is None or year in bevilgning_df.attrs.get("saldert_aar", []))) or (phase == "revised" and confirmed_rnb(data_dir, meta, year, bevilgning_df))
        records = official_records(trees, year, series, bevilgning_df) if confirmed else []
        complete = records and sum(r["amount"] for r in records if r["chapter"] < "3000") > 0 and sum(r["amount"] for r in records if r["chapter"] >= "3000") > 0
        if complete:
            outcome = {"version": 1, "year": year, "phase": phase, "status": "adopted", "series": series, "unit": "mill_kr", "source": {"url": "https://statsregnskapet.dfo.no", "dataUpdated": meta["oppdatert"], "precision": "DFØ parser" if bevilgning_df is not None else "website rounded to 0.1 mill. kr"}, "records": records}
            digest = hashlib.sha256(encode(outcome)).hexdigest()
            path = f"budsjettarkiv/{year}/{phase}/adopted-{digest}.json"
            save(data_dir / path, outcome, immutable=True)
            item["outcome"] = {"hash": digest, "path": path}
            item["visible"] = False
        else:
            if item.get("outcome"):
                raise ValueError("Adopted budget disappeared from the source; refuse to restore an old proposal")
            item["visible"] = True
            active.append({"year": year, "phase": phase, "hash": item["hash"], "path": item["path"], "label": "Regjeringens budsjettforslag" if phase == "initial" else "Forslag til revidert nasjonalbudsjett"})
            add_visible(trees, snapshot)
    meta["budsjettforslag"] = active
    meta["budsjettarkiv"] = "/data/budsjettarkiv/index.json"
    meta["budsjett_aar"] = sorted(set(meta["budsjett_aar"]) | {p["year"] for p in active})
    meta["siste_budsjett_aar"] = max(meta["budsjett_aar"])
    for name, nodes in trees.items():
        save(data_dir / f"{name}.json", nodes)
    save(data_dir / "meta.json", meta)
    save(data_dir / "budsjettarkiv/index.json", index)


def sync_dfobudgets(data_dir):
    index = read_index(data_dir)
    latest = {(p["year"], p["phase"]): p for p in index["proposals"]}
    pending = [p for p in latest.values() if p.get("visible", not p.get("outcome"))]
    if not pending:
        print("No pending proposals; no DFØ download needed")
        return
    from download import download_bevilgning
    from parse_bevilgning import parse_bevilgning
    frame = parse_bevilgning(download_bevilgning(force=True))
    trees = {name: json.loads((data_dir / f"{name}.json").read_text()) for name in ["utgifter", "inntekter"]}
    meta = json.loads((data_dir / "meta.json").read_text())
    records = {year: {series: official_records(trees, year, series, frame) for series in ["saldert", "revidert"]} for year in {p["year"] for p in pending}}
    digest = hashlib.sha256(encode({"records": records, "saldertYears": frame.attrs.get("saldert_aar", []), "decisions": frame.attrs.get("bevilgning_vedtak", {}), "rnbConfirmation": meta.get("bekreftede_rnb_vedtak", {})})).hexdigest()
    if meta.get("dfo_budsjettkontroll_hash") == digest:
        print("DFØ budgets unchanged")
        return
    def clear(nodes, year):
        for node in nodes:
            series = node.get("serier", {}).get(str(year), {})
            series.pop("saldert", None)
            series.pop("revidert", None)
            clear(node.get("children", []), year)
    for year, per_series in records.items():
        if not per_series["revidert"]:
            continue
        for tree in trees.values():
            clear(tree, year)
        for series, rows in per_series.items():
            add_visible(trees, {"year": year, "records": rows}, field=series)
        meta["budsjett_aar"] = sorted(set(meta["budsjett_aar"]) | {year})
    meta["dfo_budsjettkontroll_hash"] = digest
    meta["oppdatert"] = datetime.now(timezone.utc).isoformat()
    meta["siste_budsjett_aar"] = max(meta["budsjett_aar"])
    for name, nodes in trees.items():
        save(data_dir / f"{name}.json", nodes)
    save(data_dir / "meta.json", meta)
    reconcile(data_dir, bevilgning_df=frame)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int)
    parser.add_argument("--sync-dfo", action="store_true")
    parser.add_argument("--data-dir", type=Path, default=Path("web/public/data"))
    args = parser.parse_args()
    if args.sync_dfo:
        sync_dfobudgets(args.data_dir)
        return
    if args.year is None:
        parser.error("--year is required when importing a proposal")
    source = discover(args.year)
    if source is None:
        print("Official Gul bok not yet released; no data changed")
        return
    content = get(source["url"]).content
    digest = archive_proposal(args.data_dir, args.year, "initial", content, source)
    reconcile(args.data_dir)
    print(f"Validated and archived proposal {args.year}: {digest}")


if __name__ == "__main__":
    main()
