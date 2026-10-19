#!/usr/bin/env python3
"""Offline, bounded coverage audit. Writes only this research directory, never the app.

Input subsets are source geometries, not admitted city buildings. No geometry repair,
source overwrite, guessed height, road connection or trusted validity import exists.
"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import resource
import time

import numpy as np
from pyproj import Transformer
from shapely import STRtree, union_all
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.ops import transform

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
APP = ROOT / 'apps/bergen-simulator'
TO_UTM = Transformer.from_crs(4326, 25832, always_xy=True)
TO_WGS = Transformer.from_crs(25832, 4326, always_xy=True)
BOUNDS = (5.298, 60.382, 5.349, 60.408)
R = 6371008.8
RAD = math.pi / 180


def local_to_utm(x, z, y=None):
    return TO_UTM.transform(5.3235 + np.asarray(x) / (R * RAD * math.cos(60.395 * RAD)),
                            60.395 - np.asarray(z) / (R * RAD))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name, value):
    raw=(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()
    (HERE/name).write_bytes(gzip.compress(raw,mtime=0) if name.endswith('.gz') else raw)


def read(name):
    raw=(HERE/name).read_bytes()
    return json.loads(gzip.decompress(raw) if name.endswith('.gz') else raw)


def checked_inputs():
    lock = json.loads((HERE / 'inputs.json').read_text())
    for name, expected in lock['localInputs'].items():
        path = ROOT / name
        if digest(path) != expected['sha256']:
            raise ValueError('Input drift: ' + name)
    return lock


def load_baseline():
    d = json.loads((APP / 'public/data/bergen.json').read_text())
    buildings = []
    for b in d['buildings']:
        g = transform(local_to_utm, Polygon(b['rings'][0], b['rings'][1:]))
        if not g.is_valid or g.is_empty:
            raise ValueError('Invalid baseline geometry: ' + b['id'])
        buildings.append((b, g))
    return d, buildings


def classify(g, tree, geometries, source_id=None, identities=None):
    """Conservative candidate screen; ratios are agreement, never accuracy/recall."""
    if g.geom_type not in ('Polygon', 'MultiPolygon') or g.is_empty or not g.is_valid or g.area <= 0:
        return {'classification': 'invalid-source-geometry'}
    hits = list(tree.query(g, predicate='intersects'))
    overlap = union_all([geometries[i].intersection(g) for i in hits]).area if hits else 0
    fraction = overlap / g.area
    pairs = [(g.intersection(geometries[i]).area / g.union(geometries[i]).area, i) for i in hits]
    iou, best = max(pairs, default=(0, None))
    nearest = int(tree.nearest(g))
    distance = g.distance(geometries[nearest])
    same_id = source_id is not None and identities is not None and source_id in identities
    category = ('same-source-id' if same_id else
                'spatial-match' if fraction >= .5 or iou >= .25 else
                'ambiguous-overlap-or-near' if fraction >= .05 or distance < 2 else
                'gap-candidate')
    return {'classification': category, 'coveredFraction': round(fraction, 6),
            'bestIou': round(iou, 6), 'nearestDistanceM': round(distance, 3),
            'nearestIndex': nearest, 'overlapAreaM2': round(overlap, 4),
            'bestIndex': best, 'intersectingBaselineCount': len(hits)}


def source_osm_id(f):
    for s in f['properties'].get('sources') or []:
        if s['dataset'] == 'OpenStreetMap' and s['property'] in ('', '/geometry'):
            m = re.fullmatch(r'([wr])(\d+)@\d+', s.get('record_id') or '')
            if m:
                return ('way/' if m[1] == 'w' else 'relation/') + m[2]
    return None


def source_lineage(f):
    return sorted({s['dataset'] for s in f['properties'].get('sources') or []
                   if s['property'] in ('', '/geometry')})


def build_masks(d):
    t = d['terrain']
    pts = np.array(t['positions']).reshape(-1, 3)
    triangles = [Polygon(pts[np.array(t['indices'][i:i+3])][:, (0, 2)])
                 for i in range(0, len(t['indices']), 3)]
    land = transform(local_to_utm, union_all(triangles))
    coast = transform(local_to_utm, union_all([LineString(c) for c in d['coastline'] if len(c) >= 2]))
    waters = [transform(local_to_utm, Polygon(w['rings'][0], w['rings'][1:])) for w in d['water']]
    if not all(g.is_valid for g in waters):
        raise ValueError('Invalid baseline water mask; refuse screening')
    roads = []
    for r in d['roads']:
        if len(r['points']) < 2:
            continue
        tags = r['tags']
        # Any mapped line is a review conflict: bridges/tunnels are NOT silently
        # ground-connected or discarded. This deliberately overflags some cases.
        hw = tags.get('highway', '')
        assumed_half_width = 3.5 if hw in ('primary','secondary','tertiary','trunk','motorway') else .9 if hw in ('footway','path','steps','cycleway') else 2
        line = transform(local_to_utm, LineString([(p[0], p[2]) for p in r['points']]))
        roads.append(line.buffer(assumed_half_width))
    return land, coast, union_all(waters), STRtree(roads), roads


def screen(g, context, overlap=0):
    """Diagnostic quarantine reasons; passing is NOT admission or feasibility."""
    land, coast, water, roads_tree, roads = context
    reasons = []
    if not 12 <= g.area <= 10000:
        reasons.append('area-outside-research-range')
    if sum(len(p.exterior.coords) for p in ([g] if g.geom_type == 'Polygon' else g.geoms)) > 256:
        reasons.append('excessive-source-complexity')
    if overlap > .01:
        reasons.append('existing-footprint-overlap')
    uncovered = g.difference(land).area
    if uncovered > .01:
        reasons.append('outside-rendered-terrain-or-sea')
    if g.intersects(water):
        reasons.append('inland-water')
    if g.distance(coast) < 1:
        reasons.append('coastline-review-buffer')
    if len(roads_tree.query(g, predicate='intersects')):
        reasons.append('mapped-road-review-corridor')
    return reasons


def main():
    start = time.perf_counter()
    checked_inputs()
    d, base = load_baseline()
    gs = [g for _,g in base]
    tree = STRtree(gs)
    ids = {b['id'] for b,_ in base}
    scope = box(*BOUNDS)
    in_scope = [(b,g) for b,g in base if scope.covers(transform(TO_WGS.transform, g).centroid)]
    context = build_masks(d)
    preparation = time.perf_counter() - start
    output = []
    summary = {'boundsWgs84': BOUNDS, 'crs': 'EPSG:25832',
               'baselineRenderedCount': len(base), 'baselineCentroidInBounds': len(in_scope),
               'baselineUniqueSourceIds':len(ids),
               'baselineMultiComponentSourceIds':dict((k,v) for k,v in collections.Counter(b['id'] for b,g in base).items() if v>1),
               'baselineHeightStatus': dict(collections.Counter(b['heightStatus'] for b,_ in in_scope)),
               'baselineTags': {k:sum(k in b['tags'] for b,_ in in_scope) for k in
                  ('height','building:levels','roof:shape','roof:height','building:material','building:colour')},
               'datasets': {}}
    all_sources = {}
    for dataset, filename in [('microsoft','microsoft.geojson.gz'),('overture','overture.geojson.gz')]:
        features = json.load(gzip.open(HERE / filename))['features']
        records = []
        for f in features:
            raw = shape(f['geometry'])
            if not scope.covers(raw.centroid):
                continue
            g = transform(TO_UTM.transform, raw)
            src_id = source_osm_id(f) if dataset == 'overture' else None
            c = classify(g, tree, gs, src_id, ids)
            props = {'dataset':dataset, 'sourceId':f['id'], 'osmId':src_id,
                     'areaM2':round(g.area,2), 'centroidWgs84':[round(raw.centroid.x,7),round(raw.centroid.y,7)],
                     'geometryLineage':source_lineage(f) if dataset == 'overture' else ['Microsoft ML Buildings'], **c}
            if 'nearestIndex' in props:
                props['nearestBaselineId'] = base[props.pop('nearestIndex')][0]['id']
                best = props.pop('bestIndex')
                props['bestBaselineId'] = base[best][0]['id'] if best is not None else None
            if c['classification'] == 'gap-candidate':
                props['quarantineReasons'] = screen(g, context, c['overlapAreaM2'])
                props['reviewStatus'] = 'unverified-candidate-never-auto-import'
                output.append({'type':'Feature','id':dataset+':'+f['id'],'properties':props,'geometry':f['geometry']})
            records.append(props)
        all_sources[dataset] = records
        height = lambda f: f['properties'].get('height') is not None and f['properties']['height'] > 0
        valid_features = [f for f in features if scope.covers(shape(f['geometry']).centroid)]
        summary['datasets'][dataset] = {'centroidInBounds':len(records),
             'classifications':dict(collections.Counter(x['classification'] for x in records)),
             'heightPresentNotNecessarilyMeasured':sum(height(f) for f in valid_features),
             'geometryLineage':dict(collections.Counter('+'.join(x['geometryLineage']) for x in records)),
             'quarantineReasons':dict(collections.Counter(r for x in records for r in x.get('quarantineReasons',[]))),
             'gapCandidatesNoMaskConflicts':sum(x['classification']=='gap-candidate' and not x.get('quarantineReasons') for x in records)}
    # Cross-source agreement is reported, not treated as independent corroboration.
    ms = [f for f in output if f['properties']['dataset']=='microsoft']
    ms_geoms = [transform(TO_UTM.transform, shape(f['geometry'])) for f in ms]
    ms_tree = STRtree(ms_geoms)
    for f in output:
        if f['properties']['dataset'] == 'overture' and ms:
            g = transform(TO_UTM.transform, shape(f['geometry']))
            f['properties']['microsoftCandidateMatch'] = classify(g, ms_tree, ms_geoms)['classification']
    summary['timing'] = {'maskAndBaselinePreparationSeconds':round(preparation,4),
                         'totalSeconds':round(time.perf_counter()-start,4),
                         'processPeakRssMiB':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,2)}
    write('coverage-results.json', summary)
    write('matches.json.gz', all_sources)
    write('candidates.geojson.gz', {'type':'FeatureCollection', 'features':output})
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
