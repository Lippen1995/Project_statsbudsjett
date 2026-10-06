"""Import public political facts; source-reported positions are NOT verified coalitions.

Only validated facts are published. Fetch dates never renew editorial verification.
Run from the repository root. No third-party Python dependencies.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'web/src/kostra/municipal-politics.json'
OVERRIDES = ROOT / 'etl/mappings/municipal-politics-overrides.json'
INDEX = ROOT / 'web/public/data/kostra/index.json'
ORIGIN = 'https://avdekk.no'
MAX_REVIEW_DAYS = 90

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden: self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def text(html):
    parser = Text(); parser.feed(html)
    return ' '.join(' '.join(parser.parts).split())

def links(html):
    paths = re.findall(r'<a\b[^>]*href="(/kommune/[^"/]+)"[^>]*class="kom-row"', html)
    if not paths or len(paths) != len(set(paths)):
        raise ValueError('Municipality list missing or duplicated')
    return paths

def canonical_party(name):
    return {'Miljøpartiet Dei Grøne': 'Miljøpartiet De Grønne'}.get(name, name)

def parse_record(html, url, today):
    codes = set(re.findall(r'data-nummer="(\d{4})"', html))
    if len(codes) != 1: raise ValueError('Missing or ambiguous municipality code')
    section = re.search(r'<h2>Politisk styring</h2>\s*<section\b[^>]*>(.*?)</section>', html, re.S)
    if not section: raise ValueError('Political facts section missing')
    facts = {text(k): text(v) for k, v in re.findall(r'<div>\s*<span>(.*?)</span>\s*<strong>(.*?)</strong>\s*</div>', section[1], re.S)}
    mayor = re.fullmatch(r'(.+?)\s*\(([^()]+)\)', facts.get('Ordfører', ''))
    if not mayor: raise ValueError('Mayor or party missing')
    position = facts.get('Posisjon') or facts.get('Flertall') or facts.get('Samarbeidspartier')
    # Do not infer position from the mayor's party or from opposition/election totals.
    parties = []
    if position:
        parties = [canonical_party(p.strip()) for p in re.sub(r'\s*\(\d+ av \d+ mandater\)\s*$', '', position).split(',') if p.strip()]
        if len(parties) != len(set(parties)): raise ValueError('Duplicate position party')
    record = {'sourceFetchedAt': today, 'mayor': {'name': mayor[1].strip(), 'party': canonical_party(mayor[2].strip()), 'source': url, 'provenance': 'reported'},
              'government': {'kind': 'source-reported', 'label': 'Registrert samarbeid', 'parties': parties,
                'reportedAs': position or 'Ikke oppgitt',
                'note': 'Kildens registrerte posisjon. Dagens samarbeidsavtale er ikke kontrollert mot kommunen.',
                'sources': [{'label': 'Avdekk · politisk styring', 'url': url}]}}
    if facts.get('Byrådsleder'):
        record['executive'] = {'name': facts['Byrådsleder'], 'source': url}
    return codes.pop(), record

def monitored_hash(html):
    # Ignore scripts/nonces and surrounding navigation where a main element exists.
    main = re.search(r'<main\b[^>]*>(.*?)</main>', html, re.S)
    return hashlib.sha256(text(main[1] if main else html).encode()).hexdigest()

def apply_override(record, override, previous, fetched_sources, today):
    result = deepcopy(record)
    for key in ('mayor', 'executive', 'government', 'election', 'verifiedAt'):
        if key in override: result[key] = deepcopy(override[key])
    if 'mayor' in override: result['mayor']['provenance'] = 'verified'
    verified = date.fromisoformat(override['verifiedAt'])
    if verified > date.fromisoformat(today): raise ValueError('Verification cannot be in the future')
    reasons = []
    if (date.fromisoformat(today) - verified).days > MAX_REVIEW_DAYS:
        reasons.append('Bekreftelsen er eldre enn 90 dager.')
    baseline = {} if previous.get('verifiedAt') != override['verifiedAt'] else previous.get('monitorBaseline', {})
    baseline = dict(baseline)
    for url in override.get('monitors', []):
        value = fetched_sources.get(url)
        if value is None:
            reasons.append('En kommunal kilde kunne ikke hentes.')
        elif url not in baseline:
            # An absent baseline on an existing verification must not silently approve changes.
            if previous.get('verifiedAt') == override['verifiedAt']:
                reasons.append('Kilden mangler sammenligningsgrunnlag.')
            else: baseline[url] = value
        elif baseline[url] != value:
            reasons.append('En kommunal kilde er endret siden bekreftelsen.')
    source_baseline = (previous.get('sourceBaseline') if previous.get('verifiedAt') == override['verifiedAt'] else None) or record.get('sourceSnapshot')
    if source_baseline and record.get('sourceSnapshot') != source_baseline:
        reasons.append('Det landsdekkende registeret er endret siden bekreftelsen.')
    result['sourceBaseline'] = source_baseline
    result['monitorBaseline'] = baseline
    result['reviewReasons'] = sorted(set(reasons))
    return result

def validate(data, municipalities):
    if set(data['municipalities']) != set(municipalities):
        raise ValueError('Coverage must match ALL active KOSTRA municipalities exactly')
    for code, record in data['municipalities'].items():
        if record['name'] != municipalities[code]['name']: raise ValueError('Municipality name mismatch')
        date.fromisoformat(record['sourceFetchedAt'])
        if not record['mayor']['name'] or not record['mayor']['party']: raise ValueError('Mayor missing')
        for url in [record['mayor']['source']] + [s['url'] for s in record['government']['sources']]:
            if not url.startswith('https://'): raise ValueError('HTTPS source required')
        if record.get('election'):
            rows = record['election']['results']
            if len({r['party'] for r in rows}) != len(rows) or any(not isinstance(r['seats'], int) or r['seats'] <= 0 for r in rows):
                raise ValueError('Invalid election results')
            if sum(r['seats'] for r in rows) != record['election']['totalSeats']: raise ValueError('Election seats do not sum')

def fetch(url, cache_dir=None, use_cache=False):
    cache = cache_dir / (hashlib.sha256(url.encode()).hexdigest() + '.html') if cache_dir else None
    if use_cache and cache and cache.exists(): return cache.read_text()
    for attempt in range(3):
        try:
            request = Request(quote(url, safe=':/?&=%'), headers={'User-Agent': 'MunicipalPolitics/1.0 (+https://github.com/Lippen1995/Project_statsbudsjett)'})
            with urlopen(request, timeout=35) as response:
                html = response.read(4_000_001)
                if len(html) > 4_000_000: raise ValueError('Source exceeds size limit')
                html = html.decode('utf-8')
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True); cache.write_text(html)
            return html
        except Exception:
            if attempt == 2: raise
            time.sleep(1 + attempt * 2)

def run(cache_dir=None, use_cache=False):
    today = datetime.now(timezone.utc).date().isoformat()
    municipalities = {e['code']: e for e in json.loads(INDEX.read_text())['entities'] if e['kind'] == 'municipality' and e.get('active', True)}
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'municipalities': {}}
    overrides = json.loads(OVERRIDES.read_text())['municipalities']
    paths = links(fetch(ORIGIN + '/kommuner', cache_dir, use_cache))
    if len(paths) != len(municipalities): raise ValueError('Source municipality count differs from KOSTRA')
    records = {}; failures = []; changes = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch, ORIGIN + path, cache_dir, use_cache): ORIGIN + path for path in paths}
        for i, future in enumerate(as_completed(futures), 1):
            url = futures[future]
            try:
                code, record = parse_record(future.result(), url, today)
                if code not in municipalities or code in records: raise ValueError('Unknown or duplicate code')
                record['name'] = municipalities[code]['name']; records[code] = record
                old = previous['municipalities'].get(code, {})
                # Compare source facts separately from editorial overrides.
                snapshot = {k: record[k] for k in ('mayor', 'government', 'executive') if k in record}
                if old.get('sourceSnapshot') and old['sourceSnapshot'] != snapshot: changes.append(code)
                record['sourceSnapshot'] = snapshot
            except Exception as error:
                failures.append({'url': url, 'error': str(error)[:200]})
            if i % 50 == 0: print(f'Fetched {i}/{len(paths)} municipalities', flush=True)
    if failures: print(json.dumps(failures, ensure_ascii=False), flush=True)
    for code in municipalities.keys() - records.keys():
        if code not in previous['municipalities']: raise ValueError(f'No valid record or saved fallback for {code}; publishing stopped')
        records[code] = deepcopy(previous['municipalities'][code])
        records[code]['fetchFailed'] = True
    sources = {url for override in overrides.values() for url in override.get('monitors', [])}
    primary = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch, url, cache_dir, use_cache): url for url in sources}
        for future in as_completed(futures):
            url = futures[future]
            try: primary[url] = monitored_hash(future.result())
            except Exception as error:
                primary[url] = None; failures.append({'url': url, 'error': str(error)[:200]})
    for code, override in overrides.items():
        records[code] = apply_override(records[code], override, previous['municipalities'].get(code, {}), primary, today)
    review = [{'code': code, 'name': record['name'], 'reasons': record['reviewReasons']} for code, record in sorted(records.items()) if record.get('reviewReasons')]
    data = {'schemaVersion': 2, 'generatedAt': today, 'municipalityCount': len(records), 'reviewAfterDays': MAX_REVIEW_DAYS,
            'status': {'fetchFailures': sorted(failures, key=lambda row: row['url']), 'sourceChanges': sorted(changes), 'reviewNeeded': review},
            'municipalities': dict(sorted(records.items()))}
    validate(data, municipalities)
    # Atomic replace only after validation. Failed reads preserve previous successful dates.
    temp = OUTPUT.with_suffix('.tmp'); temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n'); temp.replace(OUTPUT)
    print(f'Validated {len(records)} municipalities; {len(failures)} fetch failures; {len(review)} reviews needed', flush=True)
    return data

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--cache-dir', type=Path); parser.add_argument('--use-cache', action='store_true')
    args = parser.parse_args(); run(args.cache_dir, args.use_cache)
