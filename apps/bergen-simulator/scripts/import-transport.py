"""Derive the bounded scenario from the unchanged, hash-pinned OSM XML cache.
No snapping, proximity joins, invented geometry, speed or capacity attributes.
Run after the original geographic import; a changed cache fails closed.
"""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WAY_IDS = set('9649862 488690111 984438272 1177313138 3506297 10573529 4072239 4269919 391336840 719637467 719637468 3648508 5004934 1549858387 202149838 3631453 124832499 391336855 4325328 391337094 133894383 391336841 59411015 225959813 5004935 4071427 984438869'.split())
manifest = json.loads((ROOT / 'public/data/source-manifest.json').read_text())
expected = {s['sha256'] for s in manifest['osm']}
nodes, ways, relations, sources = {}, {}, {}, []
for file in sorted((ROOT / 'data-cache').glob('osm-*.xml')):
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    if digest not in expected:
        raise ValueError(f'Unpinned source: {file.name}')
    sources.append({'file': file.name, 'sha256': digest})
    for element in ET.parse(file).getroot():
        identity = element.get('id')
        if element.tag == 'node':
            nodes[identity] = [float(element.get('lon')), float(element.get('lat'))]
        elif element.tag == 'way' and identity in WAY_IDS:
            ways[identity] = {'id': f'way/{identity}', 'nodeIds': [n.get('ref') for n in element.findall('nd')], 'tags': {t.get('k'): t.get('v') for t in element.findall('tag')}}
        elif element.tag == 'relation':
            tags = {t.get('k'): t.get('v') for t in element.findall('tag')}
            if tags.get('type') == 'restriction':
                relations[identity] = [m.attrib for m in element.findall('member')]
if {s['sha256'] for s in sources} != expected or set(ways) != WAY_IDS:
    raise ValueError('Incomplete pinned cache or missing scenario ways')
# No restrictions involving selected ways exist in this snapshot. Do not silently
# ignore future restrictions (including via-way restrictions).
if any(m['type'] == 'way' and m['ref'] in WAY_IDS for members in relations.values() for m in members):
    raise ValueError('Turn restriction requires an explicit network review')
used = {n for w in ways.values() for n in w['nodeIds']}
data = {'version': 1, 'origin': [5.3235, 60.395], 'nodes': {n: nodes[n] for n in sorted(used)}, 'ways': [ways[w] for w in sorted(ways, key=int)], 'provenance': {'licence': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors', 'snapshotRetrievedAt': manifest['retrievedAt'], 'sourceManifestSha256': hashlib.sha256((ROOT / 'public/data/source-manifest.json').read_bytes()).hexdigest(), 'sources': sources, 'turnRestrictionAudit': 'No restriction relations involving selected ways in the complete pinned 30-tile cache; not a guarantee of real-world legality.', 'topology': 'Shared OSM node IDs only; no coordinate snapping or crossing-line joins.'}}
(ROOT / 'public/data/bryggen-transport.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')
print(f'{len(ways)} source ways, {len(used)} original nodes; unchanged geographic snapshot')
