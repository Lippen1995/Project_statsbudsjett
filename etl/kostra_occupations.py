"""Hent avtalte årsverk og publiserte befolkningsrater fra SSB."""
import argparse
from pathlib import Path
from urllib.parse import urlencode

from kostra import DEFAULT_OUTPUT, SSB_API, SsbClient, _labels, _write_json, iter_jsonstat

REGION = "KOKkommuneregion0000"
SOURCES = [
    ("14533", "KOKyrker0000", ["KOSARBAARSVERKST0000", "KOSaarsvprtitus0000"], {}),
    ("11996", "KOKfunksjon0000", ["KOSlegeaarsverk0000", "KOSlegeprtitus0000"], {"KOKavtaleform0000": "sum", "KOKfunksjon0000": "FGK10"}),
]


def export_occupations(output):
    client = SsbClient()
    occupations = []
    rows = {}
    for table, group, measures, filters in SOURCES:
        meta = client.metadata(table)
        labels = _labels(meta, group)
        codes = [filters[group]] if group in filters else [code for code in labels if code != "TOT"]
        query = urlencode({
            "lang": "no", "outputFormat": "json-stat2",
            **{f"valueCodes[{key}]": val for key, val in {
                **filters, REGION: "????", group: ",".join(codes),
                "ContentsCode": ",".join(measures), "Tid": "*",
            }.items()},
        })
        cube = client.json(f"{SSB_API}/tables/{table}/data?{query}", f"{table}-occupations-{meta['updated'][:10]}.json")
        columns = {code: len(occupations) + i for i, code in enumerate(codes)}
        occupations.extend([([code, labels[code]] if table == "14533" else ["doctor", "Leger"]) for code in codes])
        for row in iter_jsonstat(cube):
            value = row["value"]
            if value is None or not row[REGION].isdigit():
                continue
            year = rows.setdefault(row["Tid"], {})
            municipality = year.setdefault(row[REGION], {})
            position = columns[row[group]] * 2 + measures.index(row["ContentsCode"])
            municipality[position] = value
    for year, municipalities in rows.items():
        _write_json(output / f"kostra/occupations/{year}.json", {
            "occupations": occupations,
            "rows": {code: [values.get(i) for i in range(len(occupations) * 2)] for code, values in sorted(municipalities.items())},
        })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    export_occupations(parser.parse_args().output)
