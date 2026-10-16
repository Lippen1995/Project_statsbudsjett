#!/usr/bin/env python3
"""Offline-build importer. Public OSM + elevation only; never loads environment files.

python -m venv /tmp/bergen-geo
/tmp/bergen-geo/bin/pip install -r scripts/requirements-geo.txt
/tmp/bergen-geo/bin/python scripts/import-geography.py
Network errors abort without replacing the checked-in snapshot. Raw inputs are cached.
"""
import concurrent.futures
import datetime
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'data-cache'
OUTPUT = ROOT / 'public' / 'data'
BOUNDS = (5.298, 60.382, 5.349, 60.408)  # west, south, east, north
ORIGIN = (5.3235, 60.395)
R = 6371008.8
RAD = math.pi / 180
ZOOM = 13
RESOLUTION = 32
manifest = []


def fetch(url, name):
    path = CACHE / name
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'BergenReimagined/0.1 (local geographic research prototype)'})
        with urllib.request.urlopen(request, timeout=90) as response:
            content = response.read()
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_bytes(content)
        temporary.replace(path)
    content = path.read_bytes()
    retrieved = datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()
    return content, {'url': url, 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'retrievedAt': retrieved}


def project(lon, lat):
    return (R * (lon - ORIGIN[0]) * RAD * math.cos(ORIGIN[1] * RAD), -R * (lat - ORIGIN[1]) * RAD)


def unproject(x, z):
    return (ORIGIN[0] + x / (R * RAD * math.cos(ORIGIN[1] * RAD)), ORIGIN[1] - z / (R * RAD))


def pixel(lon, lat):
    return ((lon + 180) / 360 * 2**ZOOM * 256,
            (1 - math.asinh(math.tan(lat * RAD)) / math.pi) / 2 * 2**ZOOM * 256)


def rounded(values):
    return [round(float(v), 2) for v in values]


def parts(geometry):
    if geometry.is_empty:
        return []
    return [geometry] if geometry.geom_type == 'Polygon' else [p for p in getattr(geometry, 'geoms', []) if p.geom_type == 'Polygon']


def main():
    CACHE.mkdir(exist_ok=True)
    OUTPUT.mkdir(exist_ok=True)
    w, s, e, n = BOUNDS
    nodes, ways, relations = {}, {}, {}
    requests = []
    # OSM map API has a 50,000-node response cap. Small cached tiles, 2 requests at a time.
    for col in range(6):
        for row in range(5):
            bounds = [w + (e-w)*col/6, s + (n-s)*row/5, w + (e-w)*(col+1)/6, s + (n-s)*(row+1)/5]
            url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(f'{b:.7f}' for b in bounds)
            requests.append((url, f'osm-{col}-{row}.xml'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for index, (content, entry) in enumerate(pool.map(lambda args: fetch(*args), requests)):
            manifest.append(entry)
            root = ET.fromstring(content)
            for element in root:
                if element.tag == 'node':
                    nodes[element.attrib['id']] = element
                elif element.tag == 'way':
                    ways[element.attrib['id']] = element
                elif element.tag == 'relation':
                    relations[element.attrib['id']] = element
            print(f'OSM tile {index+1}/{len(requests)}', flush=True)

    def tags(element):
        return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}

    def way_points(way):
        refs = [nd.attrib['ref'] for nd in way.findall('nd')]
        if not all(ref in nodes for ref in refs):
            return []
        return [project(float(nodes[ref].attrib['lon']), float(nodes[ref].attrib['lat'])) for ref in refs]

    nw = project(w, n)
    se = project(e, s)
    extent = box(nw[0], nw[1], se[0], se[1])
    coastlines = []
    oriented_coasts = []
    for way in ways.values():
        if tags(way).get('natural') == 'coastline':
            points = way_points(way)
            if len(points) > 1:
                line = LineString(points)
                oriented_coasts.append(line)
                clipped = line.intersection(extent)
                for p in ([clipped] if clipped.geom_type == 'LineString' else getattr(clipped, 'geoms', [])):
                    if p.geom_type == 'LineString':
                        coastlines.append(list(p.coords))
    if not coastlines:
        raise RuntimeError('No verified coastline. Refusing to invent land or water.')
    # OSM coastline direction keeps land on its left in geographic X/Y.
    # Local coordinates flip north to negative Z, so land is on the right here.
    boundaries = unary_union([extent.boundary, *[LineString(p) for p in coastlines]])
    regions = list(polygonize(boundaries))
    land_points = []
    for line in oriented_coasts:
        coords = list(line.coords)
        for a, b in zip(coords, coords[1:]):
            dx, dz = b[0]-a[0], b[1]-a[1]
            length = math.hypot(dx, dz)
            if length > 1:
                land_points.append(Point((a[0]+b[0])/2 + dz/length*0.4, (a[1]+b[1])/2 - dx/length*0.4))
    land = unary_union([p for p in regions if any(p.contains(point) for point in land_points)])
    # Known observation test: the mapped Bryggen node/footprints must be on land;
    # no fallback land polygon is permitted if coast topology is incomplete.
    fraction = land.area / extent.area
    if not 0.25 < fraction < 0.95:
        raise RuntimeError(f'Coast topology check failed: land coverage {fraction:.3f}')

    tiles = {}
    tile_manifest = []
    px0, py0 = pixel(w, n)
    px1, py1 = pixel(e, s)
    for x in range(math.floor(px0/256), math.floor(px1/256)+1):
        for y in range(math.floor(py0/256), math.floor(py1/256)+1):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
            raw, entry = fetch(url, f'terrarium-{ZOOM}-{x}-{y}.png')
            metadata_path = CACHE / f'terrarium-{ZOOM}-{x}-{y}.metadata.json'
            if not metadata_path.exists():
                with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=45) as response:
                    metadata = {'imagerySources': response.headers.get('x-amz-meta-x-imagery-sources', ''),
                                'lastModified': response.headers.get('last-modified', '')}
                metadata_path.write_text(json.dumps(metadata))
            entry.update(json.loads(metadata_path.read_text()))
            image = Image.open(io.BytesIO(raw)).convert('RGB')
            tiles[(x, y)] = image
            tile_manifest.append(entry)

    def elevation(x, z):
        lon, lat = unproject(x, z)
        px, py = pixel(min(e-1e-9, max(w, lon)), min(n-1e-9, max(s, lat)))
        # Bilinear interpolation across tile seams, decoded from Terrarium RGB.
        ix, iy = math.floor(px), math.floor(py)
        samples = []
        for ox, oy in [(0,0), (1,0), (0,1), (1,1)]:
            gx, gy = ix+ox, iy+oy
            tile = tiles.get((gx//256, gy//256))
            if tile is None:
                gx, gy = ix, iy
                tile = tiles[(gx//256, gy//256)]
            red, green, blue = tile.getpixel((gx % 256, gy % 256))
            samples.append(red*256 + green + blue/256 - 32768)
        fx, fy = px-ix, py-iy
        value = (samples[0]*(1-fx)+samples[1]*fx)*(1-fy)+(samples[2]*(1-fx)+samples[3]*fx)*fy
        return max(0, value)

    raw_features, shapes, relation_members = [], [], set()
    for relation in relations.values():
        t = tags(relation)
        if not (t.get('building') or t.get('natural') == 'water'):
            continue
        outer, inner, members = [], [], []
        complete = True
        for member in relation.findall('member'):
            if member.attrib['type'] != 'way':
                continue
            ref = member.attrib['ref']
            if ref not in ways or len(way_points(ways[ref])) < 2:
                complete = False
                break
            members.append(ref)
            (inner if member.attrib.get('role') == 'inner' else outer).append(LineString(way_points(ways[ref])))
        if not complete or not outer:
            continue
        polygon = unary_union(list(polygonize(unary_union(outer))))
        if inner:
            polygon = polygon.difference(unary_union(list(polygonize(unary_union(inner)))))
        if polygon.is_empty:
            continue
        shapes.append(('relation/' + relation.attrib['id'], t, polygon))
        relation_members.update(members)
    for way in ways.values():
        t = tags(way)
        pts = way_points(way)
        if not pts or not (way.attrib['id'] in relation_members or t.get('building') or t.get('highway') or t.get('natural') in ['water', 'coastline'] or t.get('tourism') == 'attraction'):
            continue
        raw_features.append({'type':'way', 'id':way.attrib['id'], 'timestamp':way.attrib.get('timestamp'), 'tags':t,
                             'geometry':[dict(zip(['lon','lat'], unproject(*p))) for p in pts]})
        if way.attrib['id'] not in relation_members and len(pts) >= 4 and pts[0] == pts[-1] and (t.get('building') or t.get('natural') == 'water'):
            polygon = Polygon(pts)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            shapes.append(('way/' + way.attrib['id'], t, polygon))

    water, buildings, roads, landmarks = [], [], [], []

    def rings(polygon):
        return [[rounded(p) for p in ring.coords] for ring in [polygon.exterior, *polygon.interiors]]

    def feature(id_, t, polygon, kind):
        center = polygon.representative_point()
        x, z = center.x, center.y
        return {'id':id_, 'name':t.get('name:en', t.get('name', t.get('addr:street', 'Mapped ' + kind))),
                'kind':kind, 'center':rounded((x,z)), 'location':[round(v,7) for v in unproject(x,z)],
                'elevation':round(elevation(x,z),2), 'tags':t}

    for id_, t, polygon in shapes:
        clipped = polygon.intersection(extent)
        for part in parts(clipped):
            if part.area < 4:
                continue
            if t.get('natural') == 'water':
                center = part.representative_point()
                water.append({'rings':rings(part),'elevation':round(elevation(center.x,center.y),2)})
                land = land.difference(part)
            elif t.get('building') and t['building'] != 'no':
                b = feature(id_, t, part, 'building')
                # Only strict metre tags are accepted; invalid units remain unknown.
                try:
                    h = float(t.get('height','').removesuffix(' m').replace(',','.'))
                    if not math.isfinite(h) or not 1 <= h <= 200:
                        raise ValueError()
                    status = 'osm-height'
                except ValueError:
                    try:
                        levels = float(t.get('building:levels',''))
                        if not math.isfinite(levels) or not 0 < levels <= 60:
                            raise ValueError()
                        h, status = levels*3, 'levels-estimate'
                    except ValueError:
                        h, status = None, 'unknown'
                b.update(rings=rings(part), height=round(h,2) if h is not None else None, heightStatus=status)
                # Flat base at maximum sampled ring elevation avoids buried walls.
                b['elevation'] = round(max(elevation(*p) for p in part.exterior.coords),2)
                buildings.append(b)
    for way in ways.values():
        t = tags(way)
        if not t.get('highway') or t.get('area') == 'yes' or t.get('tunnel') == 'yes' or t['highway'] in ['proposed','construction']:
            continue
        points = way_points(way)
        if len(points) < 2:
            continue
        clipped = LineString(points).intersection(extent)
        lines = [clipped] if clipped.geom_type == 'LineString' else list(getattr(clipped,'geoms',[]))
        for line in lines:
            if line.geom_type != 'LineString' or line.length < 1:
                continue
            r = feature('way/'+way.attrib['id'], t, line, 'road')
            # Add samples every <= 16m for draping; centreline stays unchanged.
            dense = []
            coords = list(line.coords)
            for a,b in zip(coords,coords[1:]):
                count = max(1,math.ceil(math.dist(a,b)/16))
                dense.extend([(a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count) for i in range(count)])
            dense.append(coords[-1])
            r.update(points=[rounded((x,elevation(x,z),z)) for x,z in dense],roadClass=t['highway'])
            roads.append(r)
    # Named attraction nodes plus mapped landmark buildings; no invented pins.
    for node in nodes.values():
        t = tags(node)
        if not t.get('name') or t.get('tourism') not in ['attraction','museum','viewpoint']:
            continue
        lon,lat = float(node.attrib['lon']),float(node.attrib['lat'])
        point = Point(project(lon,lat))
        if extent.contains(point):
            landmarks.append(feature('node/'+node.attrib['id'],t,point,'landmark'))
            raw_features.append({'type':'node','id':node.attrib['id'],'tags':t,'lon':lon,'lat':lat})
    for b in buildings:
        if b['tags'].get('name') and (b['tags'].get('tourism') in ['attraction','museum'] or b['tags'].get('historic')):
            landmarks.append({k:v for k,v in b.items() if k not in ['rings','height','heightStatus']} | {'kind':'landmark'})
    priority = ['Bryggen','Håkonshallen','Rosenkrantztårnet','Bergenhus','Mariakirken','Fløibanen','Fløyen']
    landmarks.sort(key=lambda f: (next((i for i,name in enumerate(priority) if name.casefold() in f['name'].casefold()),99),f['name']))

    positions, indices, vertex_map = [], [], {}
    def vertex(x,z):
        key = (round(x,3),round(z,3))
        if key not in vertex_map:
            vertex_map[key] = len(positions)//3
            positions.extend(rounded((x,elevation(x,z),z)))
        return vertex_map[key]
    # Clip each regular cell to mapped land, then triangulate its exact boundary.
    for x in range(math.floor(nw[0]),math.ceil(se[0]),RESOLUTION):
        for z in range(math.floor(nw[1]),math.ceil(se[1]),RESOLUTION):
            clipped = land.intersection(box(x,z,x+RESOLUTION,z+RESOLUTION))
            for p in parts(clipped):
                for triangle in constrained_delaunay_triangles(p).geoms:
                    points = list(triangle.exterior.coords)[:3]
                    # Local X/Z clockwise makes surface normals point up in XYZ.
                    a,b,c = points
                    if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0:
                        points.reverse()
                    indices.extend(vertex(x,z) for x,z in points)
    raw = json.dumps({'licence':'ODbL-1.0','bounds':BOUNDS,'features':raw_features,
                      'relations':[ET.tostring(r,encoding='unicode') for r in relations.values() if tags(r).get('building') or tags(r).get('natural')=='water']},ensure_ascii=False,separators=(',',':')).encode()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = {'version':1,'origin':ORIGIN,'bounds':BOUNDS,'extent':rounded((*nw,*se)),
            'provenance':{'importedAt':now,'osmTimestamp':max(item['retrievedAt'] for item in manifest),'osmEndpoint':'https://api.openstreetmap.org/api/0.6/map',
                          'osmSha256':hashlib.sha256(raw).hexdigest(),'elevation':'Mapzen Terrain Tiles / AWS Open Data, Terrarium z13',
                          'terrainResolution':RESOLUTION,'terrainTiles':tile_manifest,
                          'notes':['OSM map tiles retrieved non-transactionally; timestamp is retrieval time, not survey date.',
                                   'OSM height tags are mapper-reported; all other heights explicitly estimated.',
                                   'Road widths are schematic; tunnels excluded; bridge elevations are not resolved.',
                                   'Historical Kartverket 10m DEM via Mapzen tile processing; not a current direct survey.',
                                   'Bilinear DEM sampling; negative coastal elevations clamped to zero; water level schematic.',
                                   'Buildings have flat bases at maximum sampled footprint elevation; roofs are flat.',
                                   'Incomplete building/water multipolygon relations are skipped; bounding-box clipping applies.']},
            'terrain':{'positions':positions,'indices':indices},'coastline':[[rounded(p) for p in line] for line in coastlines],
            'water':water,'buildings':buildings,'roads':roads,'landmarks':landmarks}
    if not buildings or not roads or not positions:
        raise RuntimeError('Incomplete geography; existing snapshot retained.')
    for name,content in [('bergen.json',json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()),
                         ('bergen-osm.json.gz',gzip.compress(raw,mtime=0)),
                         ('source-manifest.json',json.dumps({'retrievedAt':now,'osm':manifest,'elevation':tile_manifest},indent=2).encode())]:
        temporary = OUTPUT / (name+'.tmp')
        temporary.write_bytes(content)
        temporary.replace(OUTPUT/name)
    print(json.dumps({'buildings':len(buildings),'roads':len(roads),'landmarks':len(landmarks),'terrainTriangles':len(indices)//3,'landCoverage':fraction,'elevationTiles':len(tiles)},indent=2))


if __name__ == '__main__':
    main()
