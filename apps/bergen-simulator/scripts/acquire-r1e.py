#!/usr/bin/env python3
"""Explicit, bounded public acquisition. Not invoked by builds or the browser.

Pinned originals are already committed. An upstream revision fails closed;
review a new input manifest rather than overwriting historical inputs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

APP = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    lock = json.loads((APP / 'scripts/r1e-inputs.json').read_text())
    for entry in lock['files']:
        destination = APP / entry['path']
        if not destination.resolve().is_relative_to(APP / 'tests/fixtures/r1e'):
            raise ValueError('Acquisition path outside R1E fixture directory')
        url = urllib.parse.urlparse(entry['url'])
        if url.scheme != 'https' or url.hostname != 'hoydedata.no' or entry['bytes'] > 4 * 1024 * 1024:
            raise ValueError('Unapproved public source or transfer bound')
        if destination.exists():
            raw = destination.read_bytes()
        elif args.verify_only:
            raise FileNotFoundError(destination)
        else:
            request = urllib.request.Request(entry['url'], headers={'User-Agent': 'BergenReimagined-R1E/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                if urllib.parse.urlparse(response.url).hostname != url.hostname:
                    raise ValueError('Unapproved acquisition redirect')
                raw = response.read(entry['bytes'] + 1)
        if len(raw) != entry['bytes'] or hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Source revision or invalid response: ' + entry['path'])
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(raw)
        print('Verified', entry['path'], len(raw), entry['sha256'])


if __name__ == '__main__':
    main()
