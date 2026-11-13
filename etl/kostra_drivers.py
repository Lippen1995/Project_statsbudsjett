#!/usr/bin/env python3
"""Oppdater Fellestalls årsvise uttrekk av SSB-indikatorer for kommunene."""
import argparse
import hashlib
from pathlib import Path
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

from kostra import (
    DEFAULT_OUTPUT, ROOT, SSB_API, SsbClient, iter_jsonstat,
    _green_book_municipality_rows, _labels, _normalized_label, _number,
    _ods_rows, _write_json,
)

REGION = "KOKkommuneregion0000"
CATALOG = ROOT / "web/src/sider/driver-indicators.json"
NEED_INDEX_URLS = {
    str(year): "https://www.regjeringen.no/contentassets/744de1ad6f0f4df09311c33edd01ae99/"
    f"{year}/kommuner/tabell-e-k-{year}-indeks-for-berekna-utgiftsbehov.ods"
    for year in (2024, 2025)
}


def read_table(client, table, indicators, municipalities, years):
    metadata = client.metadata(table)
    selections = {
        REGION: ["????"],
        "Tid": sorted(years & _labels(metadata, "Tid").keys()),
        "ContentsCode": sorted({indicator["stat"] for indicator in indicators.values()}),
    }
    for indicator in indicators.values():
        for dimension, code in indicator.get("selection", {}).items():
            selections.setdefault(dimension, []).append(code)
    if not selections["Tid"]:
        return []
    for dimension in metadata["id"]:
        values = selections[dimension]
        if dimension != REGION and not set(values) <= _labels(metadata, dimension).keys():
            raise ValueError(f"Ukjente koder for SSB-tabell {table}, {dimension}")
    query = urlencode({
        "lang": "no",
        "outputFormat": "json-stat2",
        **{f"valueCodes[{dimension}]": ",".join(sorted(set(codes))) for dimension, codes in selections.items()},
    })
    cache_key = hashlib.sha256(query.encode()).hexdigest()[:12]
    cube = client.json(
        f"{SSB_API}/tables/{table}/data?{query}",
        f"{table}-{metadata['updated'][:10]}-{cache_key}-drivers.json",
    )
    output = []
    for row in iter_jsonstat(cube):
        value = row["value"]
        if row[REGION] not in municipalities or not isinstance(value, (int, float)):
            continue
        for key, indicator in indicators.items():
            if row["ContentsCode"] == indicator["stat"] and all(
                row[dimension] == code for dimension, code in indicator.get("selection", {}).items()
            ):
                output.append((row["Tid"], row[REGION], key, value))
    return output


def read_need_indices(client, indicators, municipalities, years):
    for year, url in NEED_INDEX_URLS.items():
        if year not in years:
            continue
        rows = _ods_rows(client.content(url, f"need-index-{year}.ods"))
        headers = [_normalized_label(value) for value in rows[0]]
        columns = {
            key: next((i for i, name in enumerate(headers) if item["column"] in name), None)
            for key, item in indicators.items()
        }
        for region, row in _green_book_municipality_rows(headers, rows[1:]).items():
            if region not in municipalities:
                continue
            for key, position in columns.items():
                value = _number(row[position]) if position is not None else None
                if value is not None:
                    yield year, region, key, round(value, 5)


def export_drivers(output, force=False):
    index = json.loads((output / "kostra/index.json").read_text())
    municipalities = {entity["code"] for entity in index["entities"] if entity["kind"] == "municipality"}
    years = {str(year) for year in index["years"]}
    indicators = json.loads(CATALOG.read_text())
    tables = defaultdict(dict)
    need_indicators = {}
    for key, indicator in indicators.items():
        if indicator.get("source") == "KDD":
            need_indicators[key] = indicator
        else:
            tables[indicator["table"]][key] = indicator

    client = SsbClient(force=force)
    by_year = defaultdict(lambda: defaultdict(dict))
    with ThreadPoolExecutor(max_workers=4) as pool:
        requests = [
            pool.submit(read_table, client, table, items, municipalities, years)
            for table, items in tables.items()
        ]
        for request in requests:
            for year, region, key, value in request.result():
                by_year[year][region][key] = value
    for year, region, key, value in read_need_indices(client, need_indicators, municipalities, years):
        by_year[year][region][key] = value

    # Use one array per region and a single shared column list to keep the download small.
    columns = list(indicators)
    for year, regions in sorted(by_year.items()):
        rows = {region: [values.get(key) for key in columns] for region, values in sorted(regions.items())}
        _write_json(output / f"kostra/drivers/{year}.json", {"columns": columns, "rows": rows})
    print(f"KOSTRA: {len(columns)} indikatorer, {len(by_year)} år")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    export_drivers(args.output, args.force)
