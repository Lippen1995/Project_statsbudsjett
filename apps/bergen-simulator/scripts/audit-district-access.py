"""Read-only audit: node proximity never establishes a mapped site entrance."""
import hashlib
import json
import math
from pathlib import Path
from shapely.geometry import Point, LineString, Polygon
city=json.loads(Path('public/data/bergen.json').read_text())
source=json.loads(Path('public/data/bryggen-transport.json').read_text())
plan=json.loads(Path('public/plans/urban-quarter-example.json').read_text())
origin=source['origin']
# Same local tangent approximation as geo/projection.ts, pinned existing source.
def project(p):
    return [(p[0]-origin[0])*math.pi/180*6371008.8*math.cos(origin[1]*math.pi/180),-(p[1]-origin[1])*math.pi/180*6371008.8]
usage={}
for way in source['ways']:
    for node in set(way['nodeIds']):usage[node]=usage.get(node,0)+1
ids=sorted({n for w in source['ways'] for n in w['nodeIds'] if n in [w['nodeIds'][0],w['nodeIds'][-1]] or usage[n]>1})
nodes={n:project(source['nodes'][n]) for n in ids}
observed=[(b['id'],Polygon(b['rings'][0],b['rings'][1:])) for b in city['buildings']]
rows=[]
for b in plan['development']['proposals']:
    nearest=min(nodes,key=lambda n:Point(b['center']).distance(Point(nodes[n])))
    line=LineString([b['center'],nodes[nearest]])
    rows.append({'proposalId':b['id'],'center':b['center'],'nearestAuditedGraphNodeId':nearest,'nearestNodePoint':nodes[nearest],'straightLineDistanceM':round(line.length,3),'straightLineObservedBuildingConflicts':[id for id,p in observed if line.intersects(p)],'associatedSourceWays':[w['id'] for w in source['ways'] if nearest in w['nodeIds']],'verifiedSiteConnector':False})
report={'interpretation':'Synthetic proposed-site audit only. Nearest-node distance and a clear straight line do not verify an entrance, right of way, footpath connection or carriageway access. No connector edges or generated trips are added.','sourceHashes':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('public/data/bergen.json'),Path('public/data/bryggen-transport.json')]},'auditedWayCount':len(source['ways']),'graphNodeCount':len(nodes),'proposedBuildingCount':len(rows),'sourceContainsEntranceOrSiteConnectorRecords':False,'evidenceForMissingConnectors':'The pinned transport contract contains only nodes/ways for the audited highway graph; proposed sites have no matching source node or entrance IDs. City building records contain footprints/tags, not a verified site-to-graph entrance contract.','sites':rows,'decision':'Keep district and transport results separate; future coupling requires a reviewed source revision with explicit site entrances/connectors and bounded trip rates.'}
out=Path('artifacts/milestone-5a/transport-access-audit.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
