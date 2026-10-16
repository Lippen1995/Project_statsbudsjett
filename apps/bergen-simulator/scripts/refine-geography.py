#!/usr/bin/env python3
"""Reproduce milestone 2A from pinned inputs; abort on drift, never invent geography.

Use requirements-geo.txt. Network is authoring-only; cache misses must match the
recorded hashes. Builds and browsers consume only the checked-in static snapshot.
"""
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
import rasterio
from pyproj import Transformer
from shapely import constrained_delaunay_triangles, STRtree
from shapely.geometry import Point, Polygon, box, LineString
from shapely.ops import polygonize, unary_union

APP = Path(__file__).resolve().parent.parent
REPO = APP.parent.parent
OUT = APP / 'public/data'
CACHE = APP / 'data-cache'
BASE = 'ab92713a99588dbf2458135e1bf7b41d892088a5'
STEP = 16


def baseline(path):
    return json.loads(subprocess.check_output(['git', 'show', f'{BASE}:apps/bergen-simulator/{path}'], cwd=REPO))


def checked_input(url, name, digest):
    path = CACHE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.read_bytes() if path.exists() else urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise RuntimeError(f'Input integrity check failed: {name}; existing snapshot retained')
    if not path.exists():
        path.write_bytes(raw)
    return raw


def polygons(g):
    return [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']


def bilinear_sample(values, transform, easting, northing):
    """Raster affine coordinates address pixel corners; values address centres."""
    col, row = ~transform * (easting, northing)
    col, row = col-0.5, row-0.5
    c, r = math.floor(col), math.floor(row)
    assert 0 <= c < values.shape[1]-1 and 0 <= r < values.shape[0]-1, 'DEM crop incomplete'
    fx, fy = col-c, row-r
    return float((values[r,c]*(1-fx)+values[r,c+1]*fx)*(1-fy)+(values[r+1,c]*(1-fx)+values[r+1,c+1]*fx)*fy)


def main():
    data = baseline('public/data/bergen.json')
    manifest = baseline('public/data/source-manifest.json')
    source = json.loads((OUT / 'terrain-source.json').read_text())
    raster = source['raster']
    checked_input(raster['url'], 'research-2a/bergen-dtm-2m.tif', raster['sha256'])
    for project in source['projects']:
        raw = checked_input(project['metadataUrl'], f"research-2a/project-{project['lastFlightDate'][:4]}.json", project['metadataSha256'])
        properties = json.loads(raw)['ProjectMetadata'][0]['properties']
        assert properties['HOYDESYSTEM'] == '5941' and properties['BEST_OPEN'] == '1'
    dem = rasterio.open(CACHE / 'research-2a/bergen-dtm-2m.tif')
    assert dem.crs.to_epsg() == 25833 and dem.res == (2, 2)
    values = dem.read(1, masked=True)
    assert values.count() == values.size and np.isfinite(values).all()
    assert -20 < values.min() and values.max() < 650
    to_utm = Transformer.from_crs(4326, 25833, always_xy=True)
    lon0, lat0 = data['origin']
    rad = math.pi / 180
    radius = 6371008.8

    def project(lon, lat):
        return radius*(lon-lon0)*rad*math.cos(lat0*rad), -radius*(lat-lat0)*rad

    def elevation(x, z):
        lon, lat = lon0+x/(radius*rad*math.cos(lat0*rad)), lat0-z/(radius*rad)
        e, n = to_utm.transform(lon, lat)
        return round(max(0, bilinear_sample(values, dem.transform, e, n)), 2)

    # Keep the existing checked-in coast/lake mask exactly (including courtyards
    # and lake holes); this is refinement, not an uncontrolled OSM refresh.
    old = data['terrain']
    land = unary_union([Polygon([(old['positions'][j*3], old['positions'][j*3+2]) for j in old['indices'][i:i+3]]) for i in range(0, len(old['indices']), 3)])
    nodes, ways, relations = {}, {}, {}
    for col in range(6):
        for row in range(5):
            entry = manifest['osm'][col*5+row]
            raw = checked_input(entry['url'], f'osm-{col}-{row}.xml', entry['sha256'])
            for item in ET.fromstring(raw):
                collection = {'node': nodes, 'way': ways, 'relation': relations}.get(item.tag)
                if collection is not None:
                    collection[item.attrib['id']] = item

    def tags(item):
        return {t.attrib['k']: t.attrib['v'] for t in item.findall('tag')}

    def points(way):
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        return [project(float(nodes[r].attrib['lon']), float(nodes[r].attrib['lat'])) for r in refs] if all(r in nodes for r in refs) else []

    def cover(t):
        if t.get('natural') in ['wood', 'scrub'] or t.get('landuse') == 'forest': return 2
        if t.get('leisure') in ['park', 'garden'] or t.get('landuse') in ['grass', 'meadow', 'cemetery']: return 1
        return 0

    covers, context = [], []
    for item in [*ways.values(), *relations.values()]:
        t = tags(item)
        if not cover(t): continue
        if item.tag == 'way':
            pts = points(item)
            if len(pts) < 4 or pts[0] != pts[-1]: continue
            shape = Polygon(pts)
        else:
            lines, holes, complete = [], [], True
            for member in item.findall('member'):
                if member.attrib['type'] != 'way': continue
                way = ways.get(member.attrib['ref'])
                pts = points(way) if way is not None else []
                if len(pts) < 2: complete = False; break
                (holes if member.attrib.get('role') == 'inner' else lines).append(LineString(pts))
            if not complete or not lines: continue
            shape = unary_union(list(polygonize(unary_union(lines))))
            if holes: shape = shape.difference(unary_union(list(polygonize(unary_union(holes)))))
        if not shape.is_valid: shape = shape.buffer(0)
        shape = shape.intersection(land)
        if shape.is_empty: continue
        context.append({'id':item.tag+'/'+item.attrib['id'], 'tags':t, 'polygons':[[[[round(x,2),round(z,2)] for x,z in ring.coords] for ring in [p.exterior,*p.interiors]] for p in polygons(shape)]})
        covers.append((shape, cover(t)))
    cover_tree = STRtree([g for g, _ in covers])
    positions, indices, colours, vertex_map = [], [], [], {}

    def vertex(x, z):
        key = round(x, 2), round(z, 2)
        if key not in vertex_map:
            vertex_map[key] = len(positions)//3
            positions.extend([key[0], elevation(*key), key[1]])
            matches = cover_tree.query(Point(*key), predicate='intersects')
            colours.append(max([covers[i][1] for i in matches], default=0))
        return vertex_map[key]

    west, north, east, south = data['extent']
    for x in range(math.floor(west), math.ceil(east), STEP):
        for z in range(math.floor(north), math.ceil(south), STEP):
            for part in polygons(land.intersection(box(x, z, min(x+STEP,east), min(z+STEP,south)))):
                for triangle in constrained_delaunay_triangles(part).geoms:
                    pts = list(triangle.exterior.coords)[:3]
                    a,b,c = pts
                    if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0: pts.reverse()
                    ids = [vertex(*p) for p in pts]
                    if len(set(ids)) == 3: indices.extend(ids)
    triangles = [Polygon([(positions[j*3],positions[j*3+2]) for j in indices[i:i+3]]) for i in range(0,len(indices),3)]
    tree = STRtree(triangles)

    def surface(x,z):
        matches = tree.query(Point(x,z), predicate='intersects')
        if len(matches):
            i = int(matches[0])*3
            a,b,c = [positions[j*3:j*3+3] for j in indices[i:i+3]]
            den = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
            if abs(den) > 1e-8:
                u = ((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den
                v = ((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den
                return round(u*a[1]+v*b[1]+(1-u-v)*c[1],2)
        return elevation(x,z)  # coastline rounding / source line outside mapped land

    for b in data['buildings']:
        b['ground'] = [[surface(x,z) for x,z in ring] for ring in b['rings']]
        b['elevation'] = max(b['ground'][0])
    for r in data['roads']:
        r['points'] = [[x,surface(x,z),z] for x,_,z in r['points']]
        r['elevation'] = surface(*r['center'])
        r['renderStatus'] = 'unresolved-bridge' if r['tags'].get('bridge','no') not in ['no','false','0'] else 'surface'
        if r['tags'].get('tunnel', 'no') not in ['no','false','0','building_passage']:
            r['renderStatus'] = 'subsurface'
    for f in data['landmarks']: f['elevation'] = surface(*f['center'])
    for w in data['water']:
        pts = w['rings'][0]
        w['elevation'] = round(float(np.median([elevation(x,z) for x,z in pts])),2)
    data['coastElevation'] = [[surface(x,z) for x,z in line] for line in data['coastline']]
    data['terrain'] = {'positions':positions,'indices':indices,'cover':colours}
    raw = json.dumps({'licence':'ODbL-1.0','sourceManifest':'source-manifest.json','features':context},ensure_ascii=False,separators=(',',':')).encode()
    data['provenance']['refinement'] = {'baselineCommit':BASE,'terrainSource':'terrain-source.json','rasterSha256':raster['sha256'],'contextSha256':hashlib.sha256(raw).hexdigest(),'landcoverFeatures':len(context),'importer':'scripts/refine-geography.py'}
    data['provenance']['elevation'] = 'Kartverket Høydedata / Bergen 10pkt 2022 and 2023 project DTM; NN2000'
    data['provenance']['terrainResolution'] = STEP
    data['provenance']['notes'] = ['Historical baseline notes follow; the milestone 2A notes below supersede the terrain and rendering descriptions.'] + data['provenance']['notes'] + ['Milestone 2A supersedes the historical terrain tile surface, not the retained OSM mapping or heights.', 'NN2000 project DTM resampled to a 2 m crop and a 16 m display mesh; old coastline and lake holes unchanged.', 'Ground contact and road-edge draping follow the rendered TIN. Building foundations are schematic skirts; unknown heights remain unknown.', 'Bridge decks and subsurface roads are retained as source records but omitted from the surface rendering until deck elevations are verified.', 'Landcover colours sample observed OSM park/garden/grass/wood/forest polygons. Materials, lighting and water ripples are artistic.']
    manifest['refinement'] = source
    outputs = {'bergen.json':json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),'bergen-context-osm.json.gz':gzip.compress(raw,mtime=0),'source-manifest.json':json.dumps(manifest,indent=2,ensure_ascii=False).encode()}
    for name, raw in outputs.items(): (OUT/(name+'.tmp')).write_bytes(raw)
    for name in outputs: (OUT/(name+'.tmp')).replace(OUT/name)
    print(json.dumps({'terrainTriangles':len(indices)//3,'landcoverFeatures':len(context),'unresolvedBridges':sum(r['renderStatus']=='unresolved-bridge' for r in data['roads']),'terrainRange':[min(positions[1::3]),max(positions[1::3])]},indent=2))


if __name__ == '__main__': main()
