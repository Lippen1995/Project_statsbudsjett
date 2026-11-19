#!/usr/bin/env python3
"""Local gh-api adapter serviced by the native task's authorized connector.

No token, network call, cached API response or fabricated permission is used.
The host must answer each request with an actual connector response.
"""
import json
import os
from pathlib import Path
import sys
import time
import uuid


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] != 'api':
        raise ValueError('Only gh api is supported')
    path = args[1].lstrip('/')
    if not path.startswith('repos/Lippen1995/Project_statsbudsjett/'):
        raise ValueError('Repository outside the authorized task')
    method = args[args.index('--method') + 1] if '--method' in args else 'GET'
    body = json.load(sys.stdin) if '--input' in args else None
    root = Path(os.environ['FELLESTALL_CONNECTOR_QUEUE']).resolve(strict=True)
    rid = uuid.uuid4().hex
    request, reply = root / (rid + '.request.json'), root / (rid + '.response.json')
    temporary = root / (rid + '.tmp')
    temporary.write_text(json.dumps(dict(path=path, method=method, body=body)))
    temporary.replace(request)
    deadline = time.monotonic() + 27
    try:
        while not reply.exists():
            if time.monotonic() > deadline:
                raise TimeoutError('Native connector host did not answer in time')
            time.sleep(0.05)
        response = json.loads(reply.read_text())
        if response.get('error'):
            raise RuntimeError(response['error'])
        print(json.dumps(response['value']))
    finally:
        request.unlink(missing_ok=True)
        reply.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
