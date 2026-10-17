"""Read-only 12 × 16 m construction-site audit. Run from the simulator app.
Requires the pinned scripts/requirements-geo.txt environment.
Grid candidates may overlap; the separate TS challenge test proves a combined plan.
"""
import json,math,hashlib
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from pathlib import Path
j=json.load(open('public/data/bergen.json')); s=json.load(open('public/data/bryggen-transport.json'))
# Read-only site audit; no source changes. Candidate rectangles are hypothetical.
b=unary_union([Polygon(x['rings'][0],x['rings'][1:]).buffer(.25) for x in j['buildings']]); coast=unary_union([LineString(r).buffer(.25) for r in j['coastline'] if len(r)>1]); water=unary_union([Polygon(w['rings'][0],w['rings'][1:]) for w in j['water']]);
ids={w['id'] for w in s['ways']}; roads=unary_union([LineString([[p[0],p[2]] for p in r['points']]) for r in j['roads'] if r['id'] in ids]); protected=roads.buffer(6)
p=j['terrain']['positions']; ix=j['terrain']['indices']; ts=[]; grades=[]; heights=[]
for i in range(0,len(ix),3):
 a,bb,c=[p[k*3:k*3+3] for k in ix[i:i+3]]; den=(bb[0]-a[0])*(c[2]-a[2])-(bb[2]-a[2])*(c[0]-a[0]);
 if abs(den)<1e-8: continue
 ts.append(Polygon([(a[0],a[2]),(bb[0],bb[2]),(c[0],c[2])]))
 gx=((bb[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(bb[2]-a[2]))/den; gz=((bb[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(bb[1]-a[1]))/den
 grades.append(math.hypot(gx,gz)); heights.append([a,bb,c])
tree=STRtree(ts)
results=[]
for region,extent in [('bryggen',[-145,-335,145,-65]),('bergenhus',[-300,-750,160,-340]),('nordnes',[-900,-400,-380,180])]:
 found=[]
 for x in range(extent[0]+10,extent[2]-15,8):
  for z in range(extent[1]+10,extent[3]-15,8):
   q=box(x-6,z-8,x+6,z+8)
   if q.intersects(b) or q.intersects(coast) or q.intersects(water) or q.intersects(protected):continue
   ids2=tree.query(q); area=0; grade=0; hh=[]
   for k in ids2:
    t=ts[k].intersection(q)
    if t.area<1e-8:continue
    area+=t.area; grade=max(grade,grades[k])
    a,bb,c=heights[k];den=(bb[0]-a[0])*(c[2]-a[2])-(bb[2]-a[2])*(c[0]-a[0])
    for xx,zz in t.exterior.coords:
     v=((xx-a[0])*(c[2]-a[2])-(zz-a[2])*(c[0]-a[0]))/den;w=((bb[0]-a[0])*(zz-a[2])-(bb[2]-a[2])*(xx-a[0]))/den
     hh.append(a[1]+v*(bb[1]-a[1])+w*(c[1]-a[1]))
   if abs(area-q.area)>.001:continue
   found.append({'center':[x,z],'area':q.area,'maxGrade':round(grade,5),'relief':round(max(hh)-min(hh),3),'distanceToModelRoad':round(q.distance(roads),2)})
 found.sort(key=lambda v:(v['maxGrade']>.1, v['distanceToModelRoad']>25, v['relief'],v['distanceToModelRoad']))
 results.append({'region':region,'extent':extent,'candidateCount':len(found),'candidates':found[:40]})
out=Path('artifacts/milestone-4b/site-audit.json');out.parent.mkdir(parents=True,exist_ok=True)
report={'sourceHashes':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in ['public/data/bergen.json','public/data/bryggen-transport.json']},'rectangleMetres':[12,16],'gridStepMetres':8,'observedClearanceMetres':.25,'assumedModelRoadClearanceMetres':6,'regions':results,'interpretation':'Screened geometric candidates, often overlapping. Not evidence of land availability, legal permission, heritage clearance or engineering feasibility. Only the original Bryggen window is enabled.'}
out.write_text(json.dumps(report,indent=2)+'\n');print(out)
