"""Reproduce health-reform research inputs; does not publish an article.

Run from the repository root after the independent SSB handoff has passed:
python editorial/research/helsereform-2026/baseline.py
"""
import hashlib
import json
from pathlib import Path

DATA = Path('web/public/data')
OUTPUT = Path(__file__).with_name('baseline.json')
YEARS = range(2020, 2026)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text())


def growth(rows, field='value'):
    return (rows[-1][field] / rows[0][field] - 1) * 100


def main():
    hashes = {}

    def source(path):
        hashes[str(path)] = digest(path)
        return load(path)

    cpi = source(DATA / 'kpi.json')
    population = source(DATA / 'befolkning.json')
    expenditure = source(DATA / 'utgifter.json')

    def nodes(items):
        for node in items:
            yield node
            yield from nodes(node.get('children', []))

    lookup = {n['id']: n for n in nodes(expenditure)}
    state = []
    for code in ['u-07', 'u-07-0732', 'u-07-2755', 'u-07-0765', 'u-07-0701']:
        node = lookup[code]
        rows = []
        for year in YEARS:
            value = node['serier'][str(year)]['regnskap']
            if not isinstance(value, (float, int)):
                raise ValueError(f'Missing observation: {code}/{year}')
            rows.append(dict(year=year, value=value,
                             realPerCapita=value * 1e6 / population[str(year)] * cpi['2025'] / cpi[str(year)]))
        state.append(dict(id=code, name=node['navn'], unit='million NOK, current prices',
                          nominalGrowthPct=growth(rows), realPerCapitaGrowthPct=growth(rows, 'realPerCapita'), rows=rows))

    municipalities = []
    for code in ['0301', '4601', '5001']:
        doc = source(DATA / 'kostra/entities' / f'municipality-{code}.json')
        service = next(s for s in doc['services'] if s['code'] == 'FGK9')
        for metric in ['gross_expenses', 'net_expenses']:
            rows = []
            for year in YEARS:
                observation = service['metrics'][metric][str(year)]
                value, per_capita = observation['amount'], observation['perCapita']
                if not isinstance(value, (float, int)) or not isinstance(per_capita, (float, int)):
                    raise ValueError(f'Missing municipality observation: {code}/{year}')
                rows.append(dict(year=year, value=value,
                                 realPerCapita=per_capita * cpi['2025'] / cpi[str(year)]))
            municipalities.append(dict(id=doc['entity']['id'], name=doc['entity']['name'],
                                       service='FGK9', metric=metric, unit='thousand NOK, current prices',
                                       nominalGrowthPct=growth(rows), realPerCapitaGrowthPct=growth(rows, 'realPerCapita'), rows=rows))

    index = source(DATA / 'ssb-research/index.json')
    ssb = {}
    for code in ['Spesialist', 'SykehusStotte', 'Omsorg', 'EldreMenn', 'EldreKvinner']:
        entry = next(e for e in index['extracts'] if e['scope'] == 'u-07' and e['id'] == code)
        path = DATA / entry['path']
        if digest(path) != entry['hash']:
            raise ValueError(f'SSB archive hash mismatch: {code}')
        doc = source(path)
        if [r['year'] for r in doc['series']['rows']] != list(YEARS):
            raise ValueError(f'SSB series period mismatch: {code}')
        ssb[code] = dict(**doc['series'], sourceHash=entry['hash'], table=doc['table'])

    elderly = [dict(year=y, value=ssb['EldreMenn']['rows'][i]['value'] + ssb['EldreKvinner']['rows'][i]['value'])
               for i, y in enumerate(YEARS)]
    for series in ssb.values():
        series['growthPct'] = growth(series['rows'])
    result = dict(version=1, status='research-inputs-not-an-approved-article',
                  years=list(YEARS), sourceHashes=hashes, state=state, municipalExamples=municipalities,
                  ssb=ssb, elderly80Plus=dict(rows=elderly, growthPct=growth(elderly)),
                  limitations=[
                      'State chapters are recorded chapter totals, including loans where present; not health-account resource consumption or administrative costs.',
                      'Chapter totals and their child posts must not be summed together. State grants and recipients expenditure overlap.',
                      'The municipal sample is Oslo, Bergen and Trondheim, not a national estimate; no extrapolation or aggregation is made.',
                      'KOSTRA FGK9 is health and care in municipal consolidated accounts. Gross and net spending are alternative measures, not additive.',
                      'Municipal series use each source own per-capita denominator. Comparisons with state per-capita indicators need matching population definitions.',
                      'CPI is a consumer price comparison, not a health-sector wage or production deflator.',
                      'Specialist administration and service includes necessary support work; the series does not measure RHF head offices or removable bureaucracy.',
                      'Agreed FTE are not actual worked hours. Elderly population is a stock at the beginning of the year, not care recipients or forecast demand.',
                      'The 2020 pandemic baseline is atypical. Historical growth does not estimate reform effects.',
                  ])
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'state': [{k: s[k] for k in ['id', 'nominalGrowthPct', 'realPerCapitaGrowthPct']} for s in state],
                      'elderly80Plus': result['elderly80Plus'],
                      'ssb': {k: {'start': v['rows'][0]['value'], 'end': v['rows'][-1]['value'], 'growthPct': v['growthPct']} for k, v in ssb.items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
