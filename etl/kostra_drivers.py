#!/usr/bin/env python3
"""Oppdater Fellestalls årsvise uttrekk av SSB-indikatorer for kommunene."""
import argparse
import hashlib
from pathlib import Path
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

from kostra import DEFAULT_OUTPUT, ROOT, SSB_API, SsbClient, iter_jsonstat, _labels, _write_json

REGION = "KOKkommuneregion0000"
CATALOG = ROOT / "web/src/sider/driver-indicators.json"


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


def export_drivers(output, force=False):
    index = json.loads((output / "kostra/index.json").read_text())
    municipalities = {entity["code"] for entity in index["entities"] if entity["kind"] == "municipality"}
    years = {str(year) for year in index["years"]}
    indicators = json.loads(CATALOG.read_text())
    tables = defaultdict(dict)
    for key, indicator in indicators.items():
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

    # Use one array per region and a single shared column list to keep the download small.
    columns = list(indicators)
    for year, regions in sorted(by_year.items()):
        rows = {region: [values.get(key) for key in columns] for region, values in sorted(regions.items())}
        _write_json(output / f"kostra/drivers/{year}.json", {"columns": columns, "rows": rows})
    print(f"SSB: {len(columns)} indikatorer, {len(by_year)} år")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    export_drivers(args.output, args.force)
