"""Verify native-AI JSON requests against SSB, using code from trusted main."""
import base64
import json
import os
import re
from pathlib import Path
import requests
from ssb_research import archive

INPUT_PATH = 'editorial/handoff/ssb-research.json'


def validate_packet(packet):
    if not isinstance(packet, dict) or packet.get('version') != 1 or not isinstance(packet.get('extracts'), list) or not 1 <= len(packet['extracts']) <= 5:
        raise ValueError('SSB packet requires one to five extract requests')
    keys = set()
    for item in packet['extracts']:
        if not isinstance(item, dict):raise ValueError('Invalid SSB extract request')
        key = (item.get('scope'), item.get('id'))
        if key in keys:raise ValueError('Duplicate SSB extract identity')
        keys.add(key)
    return packet


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    sha = os.environ['GITHUB_SHA'];repo = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'[a-f0-9]{40}', sha) or event.get('after') != sha or not event.get('ref', '').startswith('refs/heads/analysis/ssb-research-'):
        raise ValueError('Invalid SSB delivery commit')
    session = requests.Session();session.headers.update({'Authorization':f"Bearer {os.environ['GH_TOKEN']}",'Accept':'application/vnd.github+json'})
    def api(path):
        r=session.get(f'https://api.github.com/repos/{repo}{path}',timeout=30);r.raise_for_status();return r.json()
    if api(f"/collaborators/{os.environ['GITHUB_ACTOR']}/permission")['permission'] not in ['admin','maintain','write']:
        raise ValueError('SSB delivery requires write access')
    files=api(f'/compare/main...{sha}').get('files',[])
    if len(files)!=1 or files[0].get('filename')!=INPUT_PATH or files[0].get('status') not in ['added','modified']:
        raise ValueError('Delivery branch may change only the SSB request JSON')
    content=api(f'/contents/{INPUT_PATH}?ref={sha}')
    if content.get('size',0)>65536 or content.get('encoding')!='base64':raise ValueError('Invalid SSB packet size')
    packet=validate_packet(json.loads(base64.b64decode(content['content'])))
    for item in packet['extracts']:archive(Path('web/public/data'),item)
    print('SSB metadata, requests and responses independently fetched and archived; no article published')


if __name__=='__main__':main()
