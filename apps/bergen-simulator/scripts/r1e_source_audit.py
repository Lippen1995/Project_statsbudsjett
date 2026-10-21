#!/usr/bin/env python3
"""Replay bounded, read-only public metadata probes from the R1E evidence log.

Explicit --acquire only. Never submits exports/orders, accepts contracts or
uses credentials. Originals in the evidence are immutable; new observations go
under ignored local artifacts. Public metadata availability is not a data licence.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

APP = Path(__file__).resolve().parent.parent
EVIDENCE = APP.parent.parent / 'docs/bergen-simulator/r1e-evidence'
HOSTS = {'hoydedata.no','test.hoydedata.no','kart.bergen.kommune.no',
         'www.arcgis.com','services1.arcgis.com','services2.arcgis.com',
         'kartkatalog.geonorge.no','wfs.geonorge.no','www.geonorge.no',
         'nedlasting.geonorge.no','services.norgeibilder.no',
         'backend-api.klienter-prod-k8s2.norgeibilder.no',
         'www.kartverket.no','www.nibio.no','kart.ra.no','www.bergen.kommune.no',
         'nvdbapiles.atlas.vegvesen.no','nvdbapiles-v3.atlas.vegvesen.no',
         'marcus.uib.no','past.no'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acquire', action='store_true')
    parser.add_argument('--name', required=True, help='Exact recorded metadata filename')
    args = parser.parse_args()
    attempts = json.loads((EVIDENCE / 'access-attempts.json').read_text())['attempts']
    entries = [e for e in attempts if e.get('name') == args.name]
    if len(entries) != 1:
        raise ValueError('Choose an exact, unambiguous recorded metadata probe')
    entry = entries[0]
    url = urllib.parse.urlparse(entry['url'])
    if url.scheme != 'https' or url.hostname not in HOSTS or any(s in url.path.lower() for s in ['startexport','downloadprojectfile','export/start','/token','/exportimage']):
        raise ValueError('Not an allowlisted read-only metadata route')
    if not args.acquire:
        print(json.dumps(entry, indent=2)); return
    body = None
    headers = {'User-Agent':'BergenReimagined-R1E/1.0'}
    if entry.get('method','GET').startswith('POST'):
        if url.hostname != 'backend-api.klienter-prod-k8s2.norgeibilder.no' or url.path != '/projects':
            raise ValueError('Only the documented read-only orthophoto metadata POST is permitted')
        body = json.dumps(entry['request']).encode()
        headers['Content-Type'] = 'application/json'
    if entry.get('headers',{}).get('X-Client'):
        headers['X-Client'] = 'BergenReimagined-R1E'
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out = APP / 'artifacts/r1e/source-audit' / now
    out.mkdir(parents=True, exist_ok=False)
    result = {'name':args.name,'url':entry['url'],'accessedAt':now}
    try:
        req = urllib.request.Request(entry['url'],data=body,headers=headers)
        with urllib.request.urlopen(req,timeout=40) as response:
            raw = response.read(2_000_001)
            if urllib.parse.urlparse(response.url).hostname not in HOSTS:
                raise ValueError('Unapproved redirect')
        if len(raw)>2_000_000:
            raise ValueError('Metadata response exceeds limit')
        (out / Path(args.name).name).write_bytes(raw)
        result.update(status=200,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
    except urllib.error.HTTPError as error:
        result.update(status=error.code,error=str(error))
        # No authentication retries or alternate identities.
    except Exception as error:
        result['error'] = str(error)[:200]
    (out / 'result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
