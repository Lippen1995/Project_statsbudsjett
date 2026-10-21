#!/usr/bin/env python3
"""Offline 2022/2026 roof comparison. Does not promote a contemporary model."""
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from shapely import contains_xy
from shapely.geometry import Polygon
from shapely.ops import transform

from r1e_geodata import APP, fit, local_utm

EVIDENCE = APP.parent.parent / 'docs/bergen-simulator/r1e-evidence'


def main():
    checks = json.loads((EVIDENCE / 'sample-checksums.json').read_text())
    for name in ['comparison-2026-dom-025.tif','comparison-2026-dtm-025.tif']:
        path = EVIDENCE / 'source-samples' / name
        record = next(r for r in checks if Path(r['path']).name == name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Comparison source drift')
    city = json.loads((APP / 'public/data/bergen.json').read_text())
    catalogue = json.loads((APP / 'src/enhancements/catalogue.json').read_text())
    records = []
    with rasterio.open(EVIDENCE / 'source-samples/comparison-2026-dom-025.tif') as current, \
         rasterio.open(EVIDENCE / 'source-samples/comparison-2026-dtm-025.tif') as empty, \
         rasterio.open(APP / 'tests/fixtures/r1e/dtm-025.tif') as ground, \
         rasterio.open(APP / 'tests/fixtures/r1e/dom-025.tif') as old:
        if current.transform != ground.transform or current.crs != ground.crs:
            raise ValueError('Comparison grid mismatch')
        a, b, c = current.read(1), ground.read(1), old.read(1)
        if not np.equal(empty.read(1), 0).all():
            raise ValueError('2026 terrain response changed: requires review, not automatic promotion')
        rows, cols = np.indices(a.shape)
        x, y = rasterio.transform.xy(current.transform, rows.ravel(), cols.ravel())
        x, y = np.array(x), np.array(y)
        for record in catalogue['buildings']:
            building = next(b for b in city['buildings'] if b['id'] == record['id'])
            result = fit(building,current,ground,a,b)
            ring = transform(local_utm,Polygon(building['rings'][0])).buffer(-.75)
            mask = contains_xy(ring,x,y)
            delta = a.ravel()[mask] - c.ravel()[mask]
            records.append({'id':record['id'],'2026Status':result['status'],
                '2026RoofFit':result.get('roof',result.get('roofDiagnostic')),
                'median2026Minus2022SurfaceM':round(float(np.median(delta)),3),
                'p95AbsoluteSurfaceChangeM':round(float(np.percentile(abs(delta),95)),3)})
    output = {'purpose':'Separate aerial image matching acquisition compared with pinned 2022 laser surface; temporal diagnostic, not an independent roof survey or current-building confirmation.',
        'comparisonProject':6621,
        'comparisonDTM':'REJECTED: exact-zero raster across 758016 cells despite positive known local terrain; no contemporary terrain model accepted.',
        'heightModelForFit':'2026 absolute DOM roof fit; 2022 DTM used only for preliminary relative-height screen, not a 2026 terrain observation.',
        'integrated2026Buildings':0,'records':records}
    path = APP / 'artifacts/r1e/epoch-comparison.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(output,indent=2)+'\n')
    if output != json.loads((EVIDENCE / 'epoch-comparison.json').read_text()):
        raise ValueError('Comparison regression: review source and numerical environment')
    print('Reproduced six epoch comparisons; no contemporary geometry promoted.')


if __name__ == '__main__':
    main()
