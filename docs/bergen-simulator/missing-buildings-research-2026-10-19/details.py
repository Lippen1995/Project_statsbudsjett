#!/usr/bin/env python3
"""Derived agreement/triage metrics, no claim of ground-truth completeness."""
import collections
import gzip
import json
import math

import numpy as np
import rasterio
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import Point, shape
from shapely.ops import transform

from audit import read, APP, HERE, TO_UTM, TO_WGS, checked_inputs, load_baseline, write
from heights import bilinear


def slope_review(g, dtm, values):
    """A conservative 2 m-raster diagnostic, not bearing capacity/suitability."""
    T = Transformer.from_crs(25832, dtm.crs, always_xy=True)
    p = transform(T.transform, g)
    x0,y0,x1,y1 = p.bounds
    xs,ys = np.meshgrid(np.arange(x0,x1+2,2),np.arange(y0,y1+2,2))
    xx,yy = xs.ravel(),ys.ravel()
    inside = contains_xy(p.buffer(1), xx, yy)
    xx,yy = xx[inside], yy[inside]
    try:
        # Gradient over a 2 m baseline; source is already bilinear/resampled.
        gx = (bilinear(values,dtm.transform,xx+1,yy)-bilinear(values,dtm.transform,xx-1,yy))/2
        gy = (bilinear(values,dtm.transform,xx,yy+1)-bilinear(values,dtm.transform,xx,yy-1))/2
        angle = np.degrees(np.arctan(np.hypot(gx,gy)))
        return {'samples':len(xx),'maxDtmSlopeDegrees':round(float(angle.max()),2),
                'status':'slope-review-required' if angle.max()>20 else 'coarse-slope-screen-only'}
    except ValueError:
        return {'status':'no-complete-ground-support'}


def main():
    checked_inputs()
    _,base = load_baseline()
    base_by_id = {b['id']:b for b,g in base}
    matches = read('matches.json.gz')
    fs = json.load(gzip.open(HERE/'overture.geojson.gz'))['features']
    overture_by_id = {f['id']:f for f in fs}
    enriched = []
    source_counts = collections.Counter()
    for m in matches['overture']:
        f = overture_by_id[m['sourceId']]
        p = f['properties']
        if m['classification']!='same-source-id' or not p.get('height') or p['height']<=0:
            continue
        b = base_by_id[m['osmId']]
        hs = [s for s in p['sources'] if s['property'] in ('/properties/height','/height','height')]
        src = sorted({s['dataset'] for s in hs}) or m['geometryLineage']
        source_counts.update(src)
        enriched.append({'osmId':b['id'],'gersId':f['id'],'baselineHeightStatus':b['heightStatus'],
                         'baselineHeightM':b['height'],'alternativeHeightM':p['height'],
                         'heightSources':hs,'geometryIou':m['bestIou'],
                         'status':'comparison-only-no-attribute-import'})
    agreement = {}
    for ds in ('microsoft','overture'):
        v = [m['bestIou'] for m in matches[ds] if m['classification']in('same-source-id','spatial-match')]
        agreement[ds] = {'matches':len(v),'medianBestIou':round(float(np.median(v)),4),
                          'p10BestIou':round(float(np.percentile(v,10)),4),
                          'warning':'Agreement to existing footprint; not surveyed accuracy. OSM lineage is shared.'}
    candidates = read('candidates.geojson.gz')['features']
    dtm = rasterio.open(APP/'data-cache/research-2a/bergen-dtm-2m.tif')
    values = dtm.read(1)
    h = json.loads((HERE/'height-results.json').read_text())
    heights = {r['id']:r for r in h['records']}
    triage = []
    for f in candidates:
        p=f['properties']
        g=transform(TO_UTM.transform,shape(f['geometry']))
        r={'candidateId':f['id'],'sourceId':p['sourceId'],'dataset':p['dataset'],
           'areaM2':p['areaM2'],'centroidWgs84':p['centroidWgs84'],
           'nearestBaselineId':p['nearestBaselineId'],'maskReasons':p['quarantineReasons'],
           'slope':slope_review(g,dtm,values),'heightEvidence':heights.get(f['id'],{'status':'outside-pinned-dom'}),
           'admission':'quarantine-only-no-approved-new-building'}
        triage.append(r)
    known_height_records=[r for r in h['records']if r['kind']=='existing'and r['baselineHeightStatus']=='osm-height']
    differences=[abs(r['q90AboveGroundM']-r['baselineHeightM'])for r in known_height_records]
    write('height-attribute-candidates.json.gz',{'features':enriched,
          'countsByOriginalStatus':dict(collections.Counter(e['baselineHeightStatus']for e in enriched)),
          'heightSourceCounts':dict(source_counts)})
    write('candidate-triage.json.gz',{'records':triage})
    write('detail-results.json',{'footprintAgreement':agreement,
          'overtureHeightCandidatesByExistingStatus':dict(collections.Counter(e['baselineHeightStatus']for e in enriched)),
          'heightSourceCounts':dict(source_counts),
          'maskClearSlopeCounts':dict(collections.Counter(r['dataset']+':'+r['slope']['status']for r in triage if not r['maskReasons'])),
          'bryggenRaster':{'existingBuildings':sum(r['kind']=='existing'for r in h['records']),
              'unknownHeightsWithRasterEstimate':sum(r['kind']=='existing'and r.get('baselineHeightStatus')=='unknown'and r['status'].startswith('raised-')for r in h['records']),
              'osmHeightComparisonCount':len(differences),
              'medianAbsoluteQ90VsOsmDifferenceM':round(float(np.median(differences)),3),
              'warning':'Q90 surface height and mapper total height are different definitions; neither is independent survey truth.'},
          'newBuildingsAdmitted':0})
    print((HERE/'detail-results.json').read_text())


if __name__=='__main__':
    main()
