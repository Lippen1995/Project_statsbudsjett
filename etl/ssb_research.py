"""Native AI research: explicit PxWeb selections and immutable SSB evidence."""
import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
import requests

BASE = 'https://data.ssb.no/api/pxwebapi/v2-beta/tables'
MAX_CELLS = 200


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def get(path='', params=None):
    response = requests.get(BASE + path, params=params, timeout=45, allow_redirects=False)
    response.raise_for_status()
    if response.is_redirect or len(response.content) > 8 * 1024 * 1024:
        raise ValueError('Unexpected redirect or oversized SSB response')
    return response.json()


def table_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{5}', value):
        raise ValueError('SSB table ID must have five digits')
    return value


def metadata(table):
    return get('/' + table_id(table) + '/metadata', {'lang': 'no', 'outputFormat': 'json-stat2'})


def codes(dimension):
    index = dimension['category']['index']
    return list(index) if isinstance(index, list) else [k for k, v in sorted(index.items(), key=lambda x: x[1])]


def selection_params(md, selections):
    ids = md['id']
    if not isinstance(selections, dict) or set(ids) != set(selections):
        raise ValueError('Select every dimension explicitly; no automatic totals or first category')
    time_ids = md.get('role', {}).get('time', ['Tid'])
    if len(time_ids) != 1 or time_ids[0] not in ids:
        raise ValueError('Exactly one time dimension is required')
    time_id = time_ids[0]
    cells = 1
    params = {'lang': 'no', 'outputFormat': 'json-stat2'}
    for code in ids:
        values = selections[code]
        if not isinstance(values, list) or not values or len(values) != len(set(values)):
            raise ValueError('Nonempty explicit unique category codes are required')
        if any(not isinstance(v, str) or v not in codes(md['dimension'][code]) for v in values):
            raise ValueError('Unknown SSB category')
        if code != time_id and len(values) != 1:
            raise ValueError('One measure and one category per non-time dimension; fetch separate series')
        if code == time_id and any(not re.fullmatch(r'\d{4}', v) for v in values):
            raise ValueError('Only annual observations are supported; do not mix months or quarters')
        cells *= len(values)
        params[f'valueCodes[{code}]'] = ','.join(values)
    if cells > MAX_CELLS:
        raise ValueError('SSB research extract is too large')
    return params, time_id


def normalize(md, data, selections):
    _, time_id = selection_params(md, selections)
    if data.get('class') != 'dataset' or set(data.get('id', [])) != set(md['id']):
        raise ValueError('Unexpected SSB data dimensions')
    if len(data.get('size', [])) != len(data['id']):
        raise ValueError('Invalid dimension sizes')
    for code, size in zip(data['id'], data['size']):
        observed = codes(data['dimension'][code])
        if set(observed) != set(selections[code]) or size != len(observed):
            raise ValueError('SSB response differs from requested selection')
    metric_ids = md.get('role', {}).get('metric', ['ContentsCode'])
    if len(metric_ids) != 1 or metric_ids[0] not in md['id']:
        raise ValueError('Exactly one measure dimension is required')
    metric = metric_ids[0]; measure = selections[metric][0]
    unit = data['dimension'][metric]['category'].get('unit', {}).get(measure) or md['dimension'][metric]['category'].get('unit', {}).get(measure)
    if not isinstance(unit, dict) or not isinstance(unit.get('base'), str) or not unit['base']:
        raise ValueError('Missing official SSB unit; do not guess it')
    years = codes(data['dimension'][time_id]);values = data.get('value')
    if not isinstance(values, (list, dict)) or isinstance(values, list) and len(values) != len(years):
        raise ValueError('Invalid SSB values')
    rows = []
    for index, year in enumerate(years):
        value = values[index] if isinstance(values, list) else values.get(str(index))
        if type(value) not in [int, float] or not math.isfinite(value):
            raise ValueError('Missing or confidential values cannot be treated as zero')
        rows.append({'year': int(year), 'value': value})
    rows.sort(key=lambda row: row['year'])
    if len(rows) < 2 or [r['year'] for r in rows] != list(range(rows[0]['year'], rows[-1]['year'] + 1)):
        raise ValueError('At least two consecutive annual observations are required')
    categories = {code: {'code': selections[code][0], 'label': md['dimension'][code]['category'].get('label', {}).get(selections[code][0], selections[code][0])} for code in md['id'] if code != time_id}
    return {'unit': unit['base'], 'rows': rows, 'categories': categories, 'updated': data.get('updated') or md.get('updated')}


def fetch_snapshot(table, selections):
    md = metadata(table);params, _ = selection_params(md, selections)
    data = get('/' + table + '/data', params)
    return {'version': 1, 'table': table, 'url': f'https://www.ssb.no/statbank/table/{table}/', 'api': BASE + '/' + table, 'title': md.get('label', table), 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'selections': selections, 'metadata': md, 'data': data, 'series': normalize(md, data, selections)}


def archive(data_dir, request):
    if (not isinstance(request, dict) or not re.fullmatch(r'[A-Za-z]{1,24}', request.get('id', ''))
            or not re.fullmatch(r'(?:state|u-\d{2}|budget:20\d{2})', request.get('scope', ''))
            or not isinstance(request.get('purpose'), str) or not 10 <= len(request['purpose']) <= 500):
        raise ValueError('Explicit research ID, scope and purpose are required')
    snapshot = fetch_snapshot(table_id(request.get('table')), request.get('selections'))
    raw = encode(snapshot);digest = hashlib.sha256(raw).hexdigest()
    path = data_dir / 'ssb-research' / (digest + '.json');path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != raw:raise ValueError('Immutable SSB archive conflict')
    path.write_bytes(raw)
    index_path = path.parent / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'version': 1, 'extracts': []}
    entry = {k: request[k] for k in ['id', 'scope', 'purpose']};entry.update({'hash': digest, 'path': 'ssb-research/' + digest + '.json'})
    index['extracts'] = [e for e in index['extracts'] if (e['id'], e['scope']) != (entry['id'], entry['scope'])] + [entry]
    if sum(e['scope'] == entry['scope'] for e in index['extracts']) > 5:
        raise ValueError('At most five SSB series per analysis scope')
    index_path.write_bytes(encode(index))
    return entry


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['search', 'metadata', 'fetch']);p.add_argument('argument')
    p.add_argument('--output');args=p.parse_args()
    if args.command == 'search':
        # Return the official response, including pagination; never claim a complete search.
        result=get('', {'lang':'no', 'query':args.argument, 'pageSize':20})
    elif args.command == 'metadata':result=metadata(args.argument)
    else:
        request=json.loads(Path(args.argument).read_text());result=fetch_snapshot(table_id(request['table']),request['selections'])
    raw=json.dumps(result,ensure_ascii=False,indent=2)
    if args.output:Path(args.output).write_text(raw+'\n')
    else:print(raw)


if __name__ == '__main__':main()
