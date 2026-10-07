"""Finansdepartementets underskuddsanslag, med kilde og budsjettversjon.

Overføring (kap. 5800) hentes fortsatt fra DFØ. Et oppdatert underskuddsanslag
skal aldri overskrive en uendret, vedtatt overføring.
"""
import argparse
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

logger = logging.getLogger(__name__)
BASE = 'https://www.regjeringen.no'
DATA_DIR = Path(__file__).resolve().parent.parent / 'web/public/data'
RAW_DIR = Path(__file__).resolve().parent / 'raw/oljepengebruk'


class SourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.tables = [], []
        self.anchor = self.rows = self.row = self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.anchor = [attrs.get('href', ''), []]
        if tag == 'table':
            self.rows = []
        elif tag == 'tr' and self.rows is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []

    def handle_data(self, text):
        if self.anchor is not None:
            self.anchor[1].append(text)
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor is not None:
            self.links.append((self.anchor[0], ' '.join(''.join(self.anchor[1]).split())))
            self.anchor = None
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        elif tag == 'table' and self.rows is not None:
            self.tables.append(self.rows)
            self.rows = None


def parse(html):
    parser = SourceParser()
    parser.feed(html)
    return parser


def amount(text):
    cleaned = re.sub(r'\s+', '', text).replace('−', '-').replace(',', '.')
    if not re.fullmatch(r'-?\d+(?:\.\d+)?', cleaned):
        raise ValueError(f'Ugyldig beløp i Finansdepartementets tabell: {text!r}')
    return float(cleaned)


def parse_history(html, budget_year):
    tables = [t for t in parse(html).tables if t and 'oljekorrigertoverskudd(a)' in re.sub(r'[\s-]', '', ' '.join(t[0])).lower()
              and 'Strukturelt oljekorrigert overskudd' in ' '.join(t[0])]
    if len(tables) != 1:
        raise ValueError('Manglende eller tvetydig strukturell budsjettbalanse i mill. kroner')
    result = {}
    for row in tables[0]:
        if not row or not re.fullmatch(r'\d{4}', row[0]):
            continue
        if len(row) != 8 or row[0] in result:
            raise ValueError('Endret skjema eller duplisert år i strukturell budsjettbalanse')
        a, b, c, d, e = [amount(v) for v in row[1:6]]
        if abs((a - b - c - d) - e) > 2:
            raise ValueError('Korreksjonene stemmer ikke med det strukturelle underskuddet')
        result[row[0]] = {'oljekorrigert': -a, 'strukturelt': -e,
                         'korreksjoner': {'renter': b, 'regnskap': c, 'konjunkturer': d}}
    if len(result) < 10 or str(budget_year) not in result or max(map(int, result)) != budget_year:
        raise ValueError('Historisk tabell har feil budsjettår eller er ufullstendig')
    return result


def parse_fund_percent(html, year):
    values = []
    for table in parse(html).tables:
        if not table:
            continue
        if any(row and row[0].lower().startswith('strukturelt oljekorrigert underskudd, mrd.') for row in table) and str(year) in table[0]:
            column = table[0].index(str(year))
            values.extend(amount(row[column]) for row in table if row and row[0].lower() == 'prosent av fondskapitalen' and len(row) > column)
        # Fondsbanetabellen i Nasjonalbudsjettets historiske vedlegg.
        if len(table) > 1 and 'Prosent av fondskapitalen' in table[1]:
            column = table[1].index('Prosent av fondskapitalen')
            values.extend(amount(row[column]) for row in table[2:] if row and row[0] == str(year) and len(row) > column)
    if values and max(values) != min(values):
        raise ValueError('Motstridende offisielle uttaksprosenter')
    return values[0] if values else None


def parse_saldert(html):
    # Nøkkeltallsiden har en sammenligning med NB. Velg kolonnen merket saldert.
    matches = []
    for table in parse(html).tables:
        if not table:
            continue
        columns = [i for i, label in enumerate(table[0]) if 'saldert budsjett' in label.lower()]
        if len(columns) != 1:
            continue
        column = columns[0]
        values = {}
        for row in table[1:]:
            label = row[0].lower() if row else ''
            if len(row) <= column:
                continue
            if label.startswith('oljekorrigert underskudd') and 'mrd.' in label:
                values['oljekorrigert'] = amount(row[column]) * 1000
            if label.startswith('strukturelt oljekorrigert underskudd') and 'mrd.' in label:
                values['strukturelt'] = amount(row[column]) * 1000
            if 'som andel av statens pensjonsfond' in label:
                values['prosent_fond'] = amount(row[column])
        if values:
            if not {'oljekorrigert', 'strukturelt'}.issubset(values):
                raise ValueError('Saldert nøkkeltall mangler et underskuddsmål')
            matches.append(values)
    if len(matches) != 1:
        raise ValueError('Manglende eller tvetydige nøkkeltall for saldert budsjett')
    return matches[0]


def fetch(url):
    if urlparse(url).hostname != 'www.regjeringen.no' or urlparse(url).scheme != 'https':
        raise ValueError('Underskuddstall skal komme fra regjeringen.no')
    response = requests.get(url, timeout=35, headers={'User-Agent': 'Fellestall/1.0 (budget statistics)'})
    response.raise_for_status()
    if urlparse(response.url).hostname != 'www.regjeringen.no':
        raise ValueError('Uventet omdirigering for underskuddskilde')
    return response


def optional(url, get):
    try:
        return get(url)
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code == 404:
            return None
        raise


def landing(year, revised, get):
    suffix = '/rnb/' if revised else '/'
    page = optional(f'{BASE}/no/statsbudsjett/{year}{suffix}', get)
    if page is not None:
        return page
    # CMS-ID-ene endrer seg. Finn publisert årsside via oversikten.
    overview = get(f'{BASE}/no/statsbudsjett/')
    pattern = rf'/no/statsbudsjett/{year}' + ('/rnb' if revised else '') + r'/id\d+/?'
    urls = {urljoin(overview.url, href) for href, _ in parse(overview.text).links
            if re.fullmatch(pattern, urlparse(urljoin(overview.url, href)).path)}
    if len(urls) > 1:
        raise ValueError('Tvetydig budsjettårsside')
    return get(urls.pop()) if urls else None


def discover_document(page, year, revised, get):
    number = 2 if revised else 1
    pattern = rf'/no/dokumenter/meld\.-st\.-{number}-{year - 1}{year}/id\d+/?'
    def candidates(p):
        return {urljoin(p.url, href) for href, _ in parse(p.text).links
                if re.fullmatch(pattern, urlparse(urljoin(p.url, href)).path)}
    urls = candidates(page)
    if not urls:
        docs = {urljoin(page.url, h) for h, _ in parse(page.text).links
                if f'/no/statsbudsjett/{year}/' in h and '/dokumenter-og-pressemeldinger/' in h
                and ('/rnb/' in h) == revised}
        for url in sorted(docs):
            urls.update(candidates(get(url)))
    if len(urls) > 1:
        raise ValueError('Tvetydig nasjonalbudsjett')
    return urls.pop() if urls else None


def source(response, year, phase):
    digest = hashlib.sha256(response.content).hexdigest()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / f'{digest}.html').write_bytes(response.content)
    return {'url': response.url, 'sha256': digest, 'budsjett_aar': year, 'fase': phase,
            'navn': 'Finansdepartementet – ' + ('Revidert nasjonalbudsjett' if phase == 'revidert' else 'Nasjonalbudsjettet' if phase == 'forslag' else 'Saldert budsjett')}


def document_values(url, year, phase, get):
    root = get(url)
    reading = {urljoin(root.url, href) for href, label in parse(root.text).links if label == 'Les dokumentet'}
    if len(reading) == 1:
        root = get(reading.pop())
    links = parse(root.text).links
    chapters = {urljoin(root.url, href).split('#')[0] for href, label in links
                if 'beregning av strukturell' in label.lower()}
    if not chapters:
        chapters = {urljoin(root.url, href).split('#')[0] for href, label in links
                    if 'historiske tabeller' in label.lower()}
    if len(chapters) != 1:
        raise ValueError('Manglende eller tvetydig historisk vedlegg')
    response = get(chapters.pop())
    values = parse_history(response.text, year)
    origin = source(response, year, phase)
    # Bruk offisiell prosent framfor å finne på en fondsverdi for framtidige år.
    percent = parse_fund_percent(response.text, year)
    percent_origin = origin
    if percent is None:
        historical = {urljoin(root.url, href).split('#')[0] for href, label in links if 'historiske tabeller' in label.lower()}
        if len(historical) == 1:
            percent_response = get(historical.pop())
            percent = parse_fund_percent(percent_response.text, year)
            percent_origin = source(percent_response, year, phase)
    if percent is not None:
        values[str(year)]['prosent_fond'] = percent
        values[str(year)]['prosent_kilde'] = percent_origin
    return values, origin


def update(data_dir=DATA_DIR, current_year=None, get=None):
    current_year = current_year or datetime.now(timezone.utc).year
    get = get or fetch
    path = data_dir / 'oljepengebruk.json'
    data = json.loads(path.read_text()) if path.exists() else {'versjon': 1, 'enhet': 'mill_kr', 'serier': {}}
    errors = []
    acquired = 0
    for year in [current_year, current_year + 1]:
        for revised in [False, True]:
            try:
                page = landing(year, revised, get)
                if page is None:
                    continue
                if not revised:
                    urls = {urljoin(page.url, h) for h, label in parse(page.text).links
                            if 'saldert budsjett' in label.lower() and str(year) in label}
                    if len(urls) > 1:
                        raise ValueError('Tvetydig nøkkeltallside for saldert budsjett')
                    if urls:
                        response = get(urls.pop())
                        values = parse_saldert(response.text)
                        data['serier'].setdefault(str(year), {})['saldert'] = {**values, 'kilde': source(response, year, 'saldert')}
                        acquired += 1
                url = discover_document(page, year, revised, get)
                if url is None:
                    continue  # Årssiden kan finnes før budsjettet legges frem.
                phase = 'revidert' if revised else 'forslag'
                values, origin = document_values(url, year, phase, get)
                for y, value in values.items():
                    series = data['serier'].setdefault(y, {})
                    if int(y) < year:
                        # NB for neste år oppdaterer også anslaget for inneværende
                        # år. Det er fortsatt budsjett, ikke regnskap.
                        target = 'regnskap' if int(y) < current_year else 'revidert'
                        old = series.get(target, {}).get('kilde', {})
                        rank = (year, revised)
                        old_rank = (old.get('budsjett_aar', 0), old.get('fase') == 'revidert')
                        if rank >= old_rank:
                            series[target] = {**value, 'kilde': origin}
                    else:
                        series[phase] = {**value, 'kilde': origin}
                acquired += 1
            except (requests.RequestException, ValueError) as error:
                errors.append(str(error))
                logger.warning('Kunne ikke oppdatere oljepengebruk %s (%s): %s', year, 'RNB' if revised else 'NB', error)
    if not acquired:
        raise ValueError('Ingen ferske underskuddskilder kunne hentes; forrige publiserte fil beholdes. ' + '; '.join(errors))
    if data.get('serier') and data != (json.loads(path.read_text()) if path.exists() else None):
        data_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    return {'kilder_hentet': acquired, 'advarsler': errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=DATA_DIR)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(update(args.data_dir), ensure_ascii=False))
