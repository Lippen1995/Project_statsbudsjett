"""Importer SSBs kommunetall fra KS' åpne Excel-tabeller for legemeldt sykefravær."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re

from openpyxl import load_workbook

from kostra import DEFAULT_OUTPUT, SsbClient, _write_json

GROUPS = [
    ("00-99", "Kommuneforvaltningen samlet"),
    ("84", "Offentlig administrasjon og trygdeordninger"),
    ("85.2", "Grunnskoleundervisning"),
    ("86", "Helsetjenester"),
    ("87.1", "Pleie og omsorg i institusjon"),
    ("87.2-9", "Andre omsorgsinstitusjoner og bofellesskap"),
    ("88", "Sosiale omsorgstjenester uten botilbud (utenom barnehager)"),
    ("88.911", "Barnehager"),
    ("88.991", "Barnevernstjenester"),
    ("88.998", "Kommunale sosialkontortjenester"),
]
MAIN_ASSETS = "https://www.ks.no/contentassets/8d7b643b88df4933a0ee961476eb20be"
QUARTER_ASSETS = "https://www.ks.no/contentassets/513bf6ab4ab94c17901b9e157183e1b3"
SOURCES = {str(y): f"{MAIN_ASSETS}/syk_komm_fylk_snitt_{y}.xlsx" for y in range(2018, 2026)}
SOURCES.update({
    f"{y}K{q}": f"{MAIN_ASSETS}/syk_komm_fylk_{y}k{q}.xlsx"
    for y in range(2022, 2026) for q in range(1, 5)
})
SOURCES.update({
    "2024K2": f"{MAIN_ASSETS}/legemeldt-sykefravar-per-kommune-og-fylkeskommune-2.-kvartal-2024.xlsx",
    **{f"2025K{q}": f"{QUARTER_ASSETS}/syk_komm_fylk_2025k{q}.xlsx" for q in range(1, 4)},
    "2026K1": f"{MAIN_ASSETS}/syk_komm_fylk_2026k1.xlsx",
    "2026K2": f"{QUARTER_ASSETS}/syk_komm_fylk_2026k2.xlsx",
})


def rate(value):
    if value is None or str(value).strip() in {"", "-", "–", ".", "..", ":", "*"}:
        return None
    result = float(str(value).replace(",", "."))
    if not 0 <= result <= 100:
        raise ValueError(f"Ugyldig sykefraværsprosent: {value}")
    return round(result, 5)


def read_municipalities(workbook):
    # Tabell 1 gjelder kun kommunene. Oslo publiseres separat med fylkesoppgaver.
    sheet = workbook.worksheets[0]
    rows = sheet.iter_rows(values_only=True)
    title = str(next(rows)[0]).lower()
    if "arbeidsstedskommune" not in title or "kun kommuner" not in title:
        raise ValueError(f"Tabell 1 har ukjent populasjon: {title}")
    next(rows)
    sexes = next(rows)
    headers = next(rows)
    start = sexes.index("Begge kjønn")
    end = next(i for i in range(start + 1, len(sexes)) if sexes[i])
    column = {str(headers[i]).split()[0]: i for i in range(start, end) if headers[i]}
    indices = [column[code] for code, _ in GROUPS]
    municipalities = {}
    for record in rows:
        match = re.match(r"^(\d{4})\s", str(record[0]).strip())
        if not match:
            continue
        code = match[1]
        if code in municipalities:
            raise ValueError(f"Duplikat for kommune {code}")
        municipalities[code] = [rate(record[i]) for i in indices]
    if len(municipalities) < 300 or "1103" not in municipalities or "0301" in municipalities:
        raise ValueError("Uventet kommunedekning i KS-tabell")
    return dict(sorted(municipalities.items()))


def export_sickness(client, output):
    def read(item):
        from io import BytesIO

        period, url = item
        workbook = load_workbook(BytesIO(client.content(url, f"ks-{period}.xlsx", max_age=86400)),
                                 read_only=True, data_only=True)
        try:
            return period, read_municipalities(workbook)
        finally:
            workbook.close()

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = dict(pool.map(read, SOURCES.items()))
    directory = output / "kostra/occupations/ks"
    for period, rows in results.items():
        _write_json(directory / f"{period}.json", rows)
    _write_json(directory / "index.json", {"groups": GROUPS, "sources": dict(sorted(SOURCES.items()))})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    export_sickness(SsbClient(), parser.parse_args().output)
