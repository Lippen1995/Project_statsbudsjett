"""NBIMs publiserte årsserie i milliarder NOK, bare avsluttede år."""
import re
from datetime import datetime, timezone

import requests

URL = "https://www.nbim.no/en/investments/the-funds-value/"


def parse_fondsverdi(html, current_year):
    # Total-serien står foran komponentene og USD-serien. Avvis endret skjema.
    blocks = re.findall(r"name:\s*['\"]Total['\"][\s\S]*?data:\s*\[(.*?)\]\s*\}", html)
    if len(blocks) != 1:
        raise ValueError("NBIM: manglende eller tvetydig Total-serie")
    points = re.findall(r"\[Date\.UTC\((\d{4}),\s*11,\s*31\),\s*(\d+(?:\.\d+)?)\]", blocks[0])
    values = {year: round(float(value) * 1000) for year, value in points if int(year) < current_year and float(value) > 0}
    if len(values) < 10 or len(values) != len({y for y, _ in points if int(y) < current_year}):
        raise ValueError("NBIM: ufullstendig årsserie")
    return values


def hent_fondsverdi():
    response = requests.get(URL, timeout=30)
    response.raise_for_status()
    return parse_fondsverdi(response.text, datetime.now(timezone.utc).year)
