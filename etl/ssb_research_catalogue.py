"""Capture the complete SSB table catalogue for reproducible native research.
No article, index or production observation is changed.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import urlopen, Request

BASE = 'https://data.ssb.no/api/pxwebapi/v2/tables'
TERMS = r'helse|syke|sjuke|omsorg|lege|pleie|årsverk|arbeidsmiljø|arbeidskraft|lønns|lønn|fravær|fråvær|deltid|heltid|heiltid|ledige still|ledig still|eldre|befolkningsframskriv|befolkningsfremskriv|folkemengde|folkemengd|kostra'

def collect(fetch):
    tables, pages, expected, total_pages = [], [], None, None
    for number in range(1, 201):
        result = fetch(number)
        page = result.get('page', {})
        if page.get('pageNumber') != number or not isinstance(result.get('tables'), list):
            raise ValueError('Unexpected catalogue page')
        total = page.get('totalElements')
        count = page.get('totalPages')
        if not isinstance(total, int) or not isinstance(count, int) or not 1 <= count <= 200:
            raise ValueError('Missing or excessive pagination')
        if expected is None:
            expected, total_pages = total, count
        if total != expected or count != total_pages:
            raise ValueError('Catalogue changed during capture; repeat from first page')
        pages.append(result)
        tables.extend(result['tables'])
        if number == total_pages:
            break
    ids = [t.get('id') for t in tables]
    if len(tables) != expected or len(set(ids)) != expected or any(not re.fullmatch(r'\d{5}', str(i)) for i in ids):
        raise ValueError('Incomplete catalogue or duplicate table identities')
    return tables, pages

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--metadata', nargs='*', default=['13953', '14533', '12441'])
    args = parser.parse_args()
    if any(not re.fullmatch(r'\d{5}', t) for t in args.metadata):
        raise ValueError('Invalid metadata table ID')
    out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'api': BASE, 'includeDiscontinued': True, 'files': {}}
    last = 0.
    def get(url):
        nonlocal last
        time.sleep(max(0, 2.2 - (time.monotonic() - last)))
        with urlopen(Request(url, headers={'User-Agent': 'Fellestall-source-research/1.0'}), timeout=45) as response:
            raw = response.read(16 * 1024 * 1024 + 1)
            if len(raw) > 16 * 1024 * 1024:
                raise ValueError('Response too large')
        last = time.monotonic()
        return json.loads(raw)
    def save(name, obj):
        raw = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
        (out / name).write_bytes(raw)
        manifest['files'][name] = hashlib.sha256(raw).hexdigest()
    def page(number):
        result = get(BASE + '?' + urlencode({'lang':'no', 'pageSize':1000, 'pageNumber':number, 'includeDiscontinued':'true'}))
        save(f'page-{number:03}.json', result)
        return result
    tables, pages = collect(page)
    save('catalogue.json', tables)
    candidates = [t for t in tables if re.search(TERMS, json.dumps({k:v for k,v in t.items() if k!='links'}, ensure_ascii=False), re.I)]
    save('candidates.json', candidates)
    manifest.update(totalTables=len(tables), totalPages=len(pages), candidateTables=len(candidates), catalogueComplete=True,
                    reviewScope='All catalogue entries captured; candidates are broad screening, not final editorial selection.')
    for table in args.metadata:
        if table not in {t['id'] for t in tables}:
            raise ValueError('Selected metadata table is absent from catalogue')
        save(f'metadata-{table}.json', get(BASE+'/'+table+'/metadata?lang=no&outputFormat=json-stat2'))
    (out/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(manifest, ensure_ascii=False))
    for t in candidates:
        print(t['id'], t.get('label'), t.get('firstPeriod'), t.get('lastPeriod'))

if __name__ == '__main__':
    main()
