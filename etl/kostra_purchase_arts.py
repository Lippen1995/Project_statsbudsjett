"""Eksporter SSBs publiserte underarter til kjøp for egen tjenesteproduksjon."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode

from kostra import DEFAULT_OUTPUT, SSB_API, SsbClient, _chunks, _labels, _write_json, iter_jsonstat

TABLE = "12367"
REGION = "KOKkommuneregion0000"
FUNCTION = "KOKfunksjon0000"
ART = "KOKart0000"
COLUMNS = ["A260", "A270"]


def export_purchase_arts(output, force=False):
    data = output / "kostra"
    index = json.loads((data / "index.json").read_text())
    codes = {entity["code"] for entity in index["entities"] if entity["kind"] == "municipality"}
    predecessors = {}
    for code in codes:
        detail = json.loads((data / f"entities/municipality-{code}.json").read_text())
        predecessors[code] = {
            change["targetCode"]: change["sourceCode"]
            for change in detail.get("boundaryHistory", [])
            if change["relationType"] == "exact_successor"
        }
    source_codes = codes | {code for chain in predecessors.values() for code in chain.values()}
    client = SsbClient(force=force)
    metadata = client.metadata(TABLE)
    years = sorted(set(map(str, index["years"])) & _labels(metadata, "Tid").keys())
    functions = sorted(code for code in _labels(metadata, FUNCTION) if code.isdigit() and len(code) == 3)
    source_rows = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for regions in _chunks(sorted(source_codes & _labels(metadata, REGION).keys())):
        query = urlencode({
            "lang": "no", "outputFormat": "json-stat2",
            f"valueCodes[{REGION}]": ",".join(regions),
            f"valueCodes[{FUNCTION}]": ",".join(functions),
            f"valueCodes[{ART}]": ",".join(COLUMNS),
            "valueCodes[KOKregnskapsomfa0000]": "A",
            "valueCodes[ContentsCode]": "KOSbelop0000",
            "valueCodes[Tid]": ",".join(years),
        })
        key = hashlib.sha256(query.encode()).hexdigest()[:12]
        cube = client.json(
            f"{SSB_API}/tables/{TABLE}/data?{query}",
            f"{TABLE}-{metadata['updated'][:10]}-{key}-purchase-arts.json",
        )
        for row in iter_jsonstat(cube):
            if row["value"] is not None:
                source_rows[row[FUNCTION]][row[REGION]][row["Tid"]][row[ART]] = row["value"]

    for fn in functions:
        rows = {}
        for code in sorted(codes):
            previous = predecessors[code]
            series = {}
            source = code
            while source:
                for year, values in source_rows[fn].get(source, {}).items():
                    series.setdefault(year, values)
                source = previous.get(source)
            if series:
                rows[code] = {
                    year: [values.get(art) for art in COLUMNS]
                    for year, values in sorted(series.items())
                }
        _write_json(data / f"purchase-arts/{fn}.json", {"columns": COLUMNS, "rows": rows})
    print(f"KOSTRA: {len(functions)} funksjoner med uttrekk for art 260 og 270")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    export_purchase_arts(args.output, args.force)
