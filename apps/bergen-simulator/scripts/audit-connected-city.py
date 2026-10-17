"""Read-only 5C review of the complete pinned OSM cache. Never writes runtime geography.
Shared node identities establish topology; source tags still require access review.
"""
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
WINDOW = [-200, -460, 200, 20]  # local metres; larger than the unchanged authoring window
MOTOR = {'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential'}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def audit():
    manifest_path = ROOT / 'public/data/source-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    expected = {r['sha256'] for r in manifest['osm']}
    nodes, ways, restrictions, hashes, conflicts = {}, {}, {}, [], []
    def retain(target, key, record):
        if key in target and target[key] != record:
            conflicts.append(key)
        target[key] = record
    for file in sorted((ROOT / 'data-cache').glob('osm-*.xml')):
        sha = digest(file)
        if sha not in expected:
            raise ValueError('Unpinned source cache: ' + file.name)
        hashes.append({'file': file.name, 'sha256': sha})
        for e in ET.parse(file).getroot():
            identity = e.get('id')
            tags = {t.get('k'): t.get('v') for t in e.findall('tag')}
            if e.tag == 'node':
                retain(nodes, identity, {'id': identity, 'location': [float(e.get('lon')), float(e.get('lat'))], 'tags': tags})
            elif e.tag == 'way':
                retain(ways, identity, {'id': 'way/' + identity, 'nodeIds': [n.get('ref') for n in e.findall('nd')], 'tags': tags})
            elif e.tag == 'relation' and (tags.get('type') == 'restriction' or any(k.startswith('restriction') for k in tags)):
                retain(restrictions, identity, {'id': 'relation/' + identity, 'tags': tags, 'members': [m.attrib for m in e.findall('member')]})
    if set(h['sha256'] for h in hashes) != expected or conflicts:
        raise ValueError('Incomplete cache or conflicting original records: ' + str(conflicts[:5]))
    source = json.loads((ROOT / 'public/data/bryggen-transport.json').read_text())
    current_ids = {w['id'] for w in source['ways']}
    def project(p):
        return [(p[0] - source['origin'][0]) * math.pi / 180 * 6371008.8 * math.cos(source['origin'][1] * math.pi / 180), -(p[1] - source['origin'][1]) * math.pi / 180 * 6371008.8]
    points = {n: project(v['location']) for n, v in nodes.items()}
    def in_window(p):
        return WINDOW[0] <= p[0] <= WINDOW[2] and WINDOW[1] <= p[1] <= WINDOW[3]
    selected = [w for w in ways.values() if 'highway' in w['tags'] and any(n in points and in_window(points[n]) for n in w['nodeIds'])]
    related = {r['id']: r for r in restrictions.values() if any(m['type'] == 'way' and any(w['id'] == 'way/' + m['ref'] for w in selected) for m in r['members'])}
    way_restrictions = defaultdict(list)
    for r in related.values():
        for m in r['members']:
            if m['type'] == 'way':
                way_restrictions['way/' + m['ref']].append(r['id'])
    candidates, rejected = [], []
    for w in sorted(selected, key=lambda w: int(w['id'].split('/')[1])):
        t = w['tags']; reasons = []
        if len(set(w['nodeIds'])) != len(w['nodeIds']): reasons.append('repeated source nodes require loop review')
        if any(k in t for k in ['oneway:motorcar', 'oneway:motor_vehicle', 'oneway:vehicle']): reasons.append('mode-specific direction requires review')
        if t['highway'] not in MOTOR: reasons.append('not an audited motor-road class')
        if any(n not in nodes for n in w['nodeIds']): reasons.append('missing original nodes')
        if not all(n in points and in_window(points[n]) for n in w['nodeIds']): reasons.append('whole source way crosses the bounded review window')
        if t.get('bridge') or t.get('tunnel') or t.get('layer', '0') != '0': reasons.append('grade separation needs review')
        if t.get('junction'): reasons.append('junction semantics need review')
        if t.get('oneway', 'no') not in ['yes', '1', '-1', 'no']: reasons.append('unreviewed direction')
        if any('conditional' in k for k in t): reasons.append('conditional access/direction needs review')
        access = next((t[k] for k in ['motorcar', 'motor_vehicle', 'vehicle', 'access'] if k in t), 'yes')
        if access not in ['yes', 'permissive', 'designated']: reasons.append('access rule needs review: ' + access)
        barriers = [n for n in w['nodeIds'] if n in nodes and (nodes[n]['tags'].get('barrier') or nodes[n]['tags'].get('access') in ['no', 'private'])]
        if barriers: reasons.append('node barrier/access needs review')
        if way_restrictions[w['id']]: reasons.append('turn restriction relation requires a turn-aware graph')
        row = {**w, 'inCurrentModel': w['id'] in current_ids, 'restrictionIds': way_restrictions[w['id']], 'barrierNodeIds': barriers}
        if reasons: rejected.append({**row, 'reasons': reasons})
        else: candidates.append(row)
    adjacency = defaultdict(set)
    for w in candidates:
        for a,b in zip(w['nodeIds'], w['nodeIds'][1:]):
            if w['tags'].get('oneway') != '-1': adjacency[a].add(b)
            if w['tags'].get('oneway') not in ['yes','1']: adjacency[b].add(a)
    def reachable(starts):
        found = set(starts); todo = list(starts)
        while todo:
            for nxt in adjacency[todo.pop()]:
                if nxt not in found: found.add(nxt);todo.append(nxt)
        return found
    current_nodes = {n for w in source['ways'] for n in w['nodeIds']}
    reached = reachable(current_nodes)
    for w in candidates: w['reachableFromCurrentNodes'] = any(n in reached for n in w['nodeIds'])
    membership = defaultdict(list)
    for w in ways.values():
        if 'building' in w['tags'] or 'highway' in w['tags']:
            for n in w['nodeIds']: membership[n].append(w['id'])
    entrances = [{**v, 'localPoint': points[n], 'memberWays': sorted(membership[n])} for n,v in nodes.items() if 'entrance' in v['tags'] and in_window(points[n])]
    union = {w['id']: ways[w['id'].split('/')[1]] for w in source['ways']}
    union.update({w['id']: {k:w[k] for k in ['id','nodeIds','tags']} for w in candidates})
    used = {n for w in union.values() for n in w['nodeIds']}
    union_restrictions = [r['id'] for r in restrictions.values() if any(m['type']=='way' and 'way/'+m['ref'] in union for m in r['members'])]
    candidate_source = {'version':1,'origin':source['origin'],'nodes':{n:nodes[n]['location'] for n in sorted(used)},'nodeTags':{n:nodes[n]['tags'] for n in sorted(used) if nodes[n]['tags']},'ways':sorted(union.values(),key=lambda w:int(w['id'].split('/')[1])),'provenance':{**source['provenance'],'topology':'Offline 5C candidate union: shared original node IDs only, no snapping or site connectors.','turnRestrictionAudit':'Reviewed all pinned restriction relations; union must have zero involved relations before graph construction.','candidateOnly':True}}
    if union_restrictions: raise ValueError('Candidate union has unsupported turn restrictions: '+str(union_restrictions))
    candidate_path=ROOT/'artifacts/milestone-5c/transport-candidate-source.json';candidate_path.parent.mkdir(parents=True,exist_ok=True);candidate_path.write_text(json.dumps(candidate_source,indent=2,ensure_ascii=False)+'\n')
    plan = json.loads((ROOT / 'public/plans/sustainable-quarter-example.json').read_text())
    sites=[]
    for b in plan['development']['proposals']:
        n=min(sorted(current_nodes),key=lambda n:(math.dist(b['center'],points[n]),n))
        e=min(entrances,key=lambda e:math.dist(b['center'],e['localPoint'])) if entrances else None
        sites.append({'proposalId':b['id'],'name':b['name'],'center':b['center'],'nearestSourceRoadNode':n,'distanceToSourceNodeM':round(math.dist(b['center'],points[n]),3),'nearestMappedEntranceId':e['id'] if e else None,'distanceToEntranceM':round(math.dist(b['center'],e['localPoint']),3) if e else None,'verifiedSiteEntrance':None,'verifiedCarConnector':None,'decision':'Blocked: neither proximity nor a mapped entrance to another observed building establishes access to this hypothetical site.'})
    return {'version':1,'scope':'Offline candidate audit only; not an enabled routing network or a source refresh. No generated trips or connector edges.','reviewWindowLocalMetres':WINDOW,'selectionRule':'Highway ways with at least one retained source node inside the window. Crossing-only ways may be omitted. Whole-way coverage required for new candidate roads; unchanged original model ways retained in the offline union. This is not a complete road inventory.','horizontalCrs':'Original OSM EPSG:4326; unchanged local tangent projection around [5.3235,60.395], Earth radius 6371008.8 m. No vertical inference.','verticalDatum':'OSM highway topology has no verified vertical datum; grade-separation tags are preserved and uncertain ways excluded. Existing DTM NN2000 unchanged.','sourceAcquiredAt':manifest['retrievedAt'],'licence':'ODbL-1.0','redistribution':'OSM attribution and ODbL share-alike retained; all original IDs and checksums provided. This is an audit derived from the already pinned database.','attribution':'© OpenStreetMap contributors','sourceManifestSha256':digest(manifest_path),'sources':hashes,'totals':{'cacheNodes':len(nodes),'cacheWays':len(ways),'cacheRestrictionRelations':len(restrictions),'currentMotorWays':len(current_ids),'reviewedHighwayWays':len(selected),'roadClassCounts':dict(sorted(Counter(w['tags']['highway'] for w in selected).items())),'candidateMotorWays':len(candidates),'offlineUnionMotorWays':len(union),'offlineUnionRestrictionRelations':len(union_restrictions),'candidateNewWays':sum(not w['inCurrentModel'] for w in candidates),'rejectedWays':len(rejected),'mappedEntrances':len(entrances),'verifiedProposedSiteConnections':0},'candidateWays':candidates,'rejectedWays':rejected,'restrictionRelations':list(related.values()),'entranceRecords':entrances,'candidateNodes':{n:nodes[n] for n in sorted({n for w in candidates for n in w['nodeIds']})},'sites':sites,'decision':'Keep the active 27-way routing graph and district model independent. Review listed access, turn and boundary exclusions and obtain source-supported proposed-site access before any network replacement or trip coupling.'}

if __name__ == '__main__':
    result=audit()
    output=ROOT/'artifacts/milestone-5c/transport-audit.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'totals':result['totals'],'sites':result['sites'],'decision':result['decision']},indent=2))
