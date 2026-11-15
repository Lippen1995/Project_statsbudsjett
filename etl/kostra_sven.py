"""Eksporter referanselønn og energiutgifter fra SSB til Svens forslag."""
from collections import defaultdict
from urllib.parse import urlencode

from kostra import DEFAULT_OUTPUT, SSB_API, SsbClient, _write_json, iter_jsonstat


def fetch(client, table, selection):
    metadata = client.metadata(table)
    query = urlencode({"lang": "no", "outputFormat": "json-stat2", **{
        f"valueCodes[{key}]": value for key, value in selection.items()
    }})
    return iter_jsonstat(client.json(
        f"{SSB_API}/tables/{table}/data?{query}",
        f"{table}-sven-{metadata['updated'][:10]}.json",
    ))


def export():
    client = SsbClient()
    wages = defaultdict(dict)
    for row in fetch(client, "11418", {
        "MaaleMetode": "01", "Yrke": "1342,1343,1344", "Sektor": "6500",
        "Kjonn": "0", "AvtaltVanlig": "5", "ContentsCode": "Manedslonn", "Tid": "*",
    }):
        wages[row["Tid"]][row["Yrke"]] = row["value"]

    region = "KOKkommuneregion0000"
    energy = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for row in fetch(client, "12151", {
        region: "????", "KOKfunksjon0000": "130,222", "KOKart0000": "AG1",
        "ContentsCode": "KOSutgifter1000k0000,KOSkrm20000", "Tid": "*",
    }):
        if row["value"] is not None and row[region].isdigit():
            energy[row["Tid"]][row["KOKfunksjon0000"]][row[region]][row["ContentsCode"]] = row["value"]
    for year, groups in energy.items():
        _write_json(DEFAULT_OUTPUT / f"kostra/sven/{year}.json", {
            "wages": wages.get(year, {}),
            "energy": {fn: {code: [values.get("KOSutgifter1000k0000"), values.get("KOSkrm20000")]
                           for code, values in sorted(rows.items())} for fn, rows in groups.items()},
        })


if __name__ == "__main__":
    export()
