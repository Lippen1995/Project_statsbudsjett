#!/usr/bin/env python3
"""Pinned DSM/DTM experiment, not raw-LiDAR processing or an asset importer."""
import collections
import json
import math
import resource
import time

import numpy as np
import rasterio
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import box, shape
from shapely.ops import transform

from audit import read, APP, HERE, TO_UTM, checked_inputs, load_baseline, write


def bilinear(values, affine, x, y):
    """Sample pixel centres; reject every out-of-coverage/nodata sample."""
    c, r = ~affine * (np.asarray(x), np.asarray(y))
    c, r = c - .5, r - .5
    ci, ri = np.floor(c).astype(int), np.floor(r).astype(int)
    if np.any(ci < 0) or np.any(ri < 0) or np.any(ci+1 >= values.shape[1]) or np.any(ri+1 >= values.shape[0]):
        raise ValueError('incomplete-ground-raster')
    fx, fy = c-ci, r-ri
    samples = (values[ri,ci]*(1-fx)+values[ri,ci+1]*fx)*(1-fy) + (values[ri+1,ci]*(1-fx)+values[ri+1,ci+1]*fx)*fy
    if not np.isfinite(samples).all() or np.any(abs(samples) > 1000):
        raise ValueError('invalid-ground-values')
    return samples


def robust(A, h):
    if len(h) < 20 or np.linalg.matrix_rank(A) < A.shape[1]:
        raise ValueError('insufficient-fit-samples')
    beta = np.linalg.lstsq(A, h, rcond=None)[0]
    for _ in range(5):
        err = h - A @ beta
        keep = abs(err) <= max(.4, float(np.median(abs(err))) * 2.5)
        if keep.sum() < 20 or np.linalg.matrix_rank(A[keep]) < A.shape[1]:
            raise ValueError('insufficient-fit-inliers')
        beta = np.linalg.lstsq(A[keep], h[keep], rcond=None)[0]
    return beta


def fit_shapes(g, x, y, h, row, col):
    """Compare supported shape hypotheses on held-out cells, never infer dormers."""
    if g.geom_type != 'Polygon' or len(g.interiors) or g.area/g.minimum_rotated_rectangle.area < .85:
        return {'status':'complex-or-nonrectangular-no-simple-roof'}
    ring = np.array(g.minimum_rotated_rectangle.exterior.coords)[:-1]
    edges = np.roll(ring,-1,axis=0)-ring
    along = edges[np.argmax(np.linalg.norm(edges,axis=1))]
    along /= np.linalg.norm(along)
    across = np.array([-along[1],along[0]])
    centre = np.array([g.centroid.x,g.centroid.y])
    xy = np.column_stack([x,y])-centre
    u, v = xy @ along, xy @ across
    train = (row+col) % 2 == 0
    if train.sum() < 40 or (~train).sum() < 40:
        return {'status':'insufficient-roof-samples'}
    models = []
    for name,A in [('plane',np.column_stack([np.ones(len(x)),u,v])),
                   ('symmetric-gable',np.column_stack([np.ones(len(x)),u,abs(v)]))]:
        try:
            b = robust(A[train],h[train])
        except ValueError:
            continue
        err = h[~train] - A[~train] @ b
        models.append({'hypothesis':name,'beta':b,'heldoutRmseM':float(np.sqrt(np.mean(err**2))),
                       'heldoutWithin065m':float(np.mean(abs(err)<=.65))})
    plane = next((m for m in models if m['hypothesis']=='plane'),None)
    gable = next((m for m in models if m['hypothesis']=='symmetric-gable'),None)
    accepted = None
    if gable:
        pitch = math.degrees(math.atan(-gable['beta'][2]))
        if 10<=pitch<=65 and gable['heldoutRmseM']<=.8 and gable['heldoutWithin065m']>=.85 and (not plane or gable['heldoutRmseM'] < .7*plane['heldoutRmseM']):
            accepted = gable
    if not accepted and plane and plane['heldoutRmseM']<=.5 and plane['heldoutWithin065m']>=.85:
        accepted = plane
    result = {'status':'shape-hypothesis-passes-raster-screen' if accepted else 'no-simple-shape-supported',
              'models':[{k:round(v,4) if isinstance(v,float) else v for k,v in m.items() if k!='beta'}for m in models]}
    if accepted:
        result['hypothesis'] = accepted['hypothesis']
        result['coefficients'] = [round(float(v),5) for v in accepted['beta']]
        if accepted['hypothesis']=='symmetric-gable':
            result['pitchDegreesEstimated'] = round(math.degrees(math.atan(-accepted['beta'][2])),2)
            result['ridgeNN2000EstimatedM'] = round(float(accepted['beta'][0]),3)
        result['warning'] = 'Spatial holdout is not an independent survey. Ridge axis, symmetry and planar faces are hypotheses; facade unknown.'
    return result


def respect_roof_metadata(fit, mapped_shape):
    """A good raster fit must not silently replace contradictory source detail."""
    fit = dict(fit)
    hypothesis=fit.get('hypothesis')
    if hypothesis and mapped_shape and (
        (hypothesis=='symmetric-gable' and mapped_shape!='gabled') or
        (hypothesis=='plane' and mapped_shape not in ('flat','skillion'))
    ):
        fit['status']='mapped-roof-conflict-review'
        fit['mappedRoofShape']=mapped_shape
        fit['warning']='Rejected for promotion: simple raster hypothesis conflicts with mapped roof. Preserve source geometry.'
    return fit


def sample(g, dom, dtm, dvalues):
    if not box(*dom.bounds).covers(g):
        return {'status':'outside-pinned-dom'}
    inset = g.buffer(-.75)
    if inset.is_empty:
        return {'status':'too-narrow-after-edge-inset'}
    window = rasterio.windows.from_bounds(*inset.bounds, transform=dom.transform).round_offsets().round_lengths()
    if window.width*window.height > 250000:
        raise ValueError('bounded-raster-window-exceeded')
    rows, cols = np.indices((int(window.height),int(window.width)))
    rows, cols = rows.ravel()+int(window.row_off), cols.ravel()+int(window.col_off)
    xs, ys = rasterio.transform.xy(dom.transform, rows, cols)
    xs, ys = np.asarray(xs),np.asarray(ys)
    inside = contains_xy(inset,xs,ys)
    xs,ys,rows,cols = xs[inside],ys[inside],rows[inside],cols[inside]
    if len(xs) < 12:
        return {'status':'too-few-dom-cells','samples':len(xs)}
    heights = dom.read(1,window=window)[(rows-window.row_off).astype(int),(cols-window.col_off).astype(int)].astype(float)
    if not np.isfinite(heights).all() or np.any(abs(heights)>1000):
        return {'status':'invalid-dom-values'}
    T = Transformer.from_crs(dom.crs,dtm.crs,always_xy=True)
    ex,ny = T.transform(xs,ys)
    ground = bilinear(dvalues,dtm.transform,ex,ny)
    relative = heights-ground
    if np.percentile(relative,90)<2 or np.percentile(relative,90)>80:
        return {'status':'no-bounded-raised-surface','samples':len(xs), 'q90AboveGroundM':round(float(np.percentile(relative,90)),3)}
    return {'status':'raised-surface-height-candidate-not-building-verification',
            'samples':len(xs), 'insetM':.75,
            'q10AboveGroundM':round(float(np.percentile(relative,10)),3),
            'q50AboveGroundM':round(float(np.percentile(relative,50)),3),
            'q90AboveGroundM':round(float(np.percentile(relative,90)),3),
            'groundRangeM':round(float(np.ptp(ground)),3),
            'groundSlopeOrRegistrationReview':bool(np.ptp(ground)>2),
            'roof':fit_shapes(g,xs,ys,heights,rows,cols)}


def main():
    start = time.perf_counter()
    checked_inputs()
    d,base = load_baseline()
    dom = rasterio.open(APP/'tests/fixtures/r1b-dom.tif')
    dtm = rasterio.open(APP/'data-cache/research-2a/bergen-dtm-2m.tif')
    assert dom.crs.to_epsg()==25832 and dom.res==(.5,.5)
    assert dtm.crs.to_epsg()==25833 and dtm.res==(2,2)
    dv = dtm.read(1)
    records = []
    for b,g in base:
        r = sample(g,dom,dtm,dv)
        if r['status']!='outside-pinned-dom':
            if 'roof' in r:
                r['roof']=respect_roof_metadata(r['roof'],b['tags'].get('roof:shape'))
            records.append({'id':b['id'],'kind':'existing','name':b['name'],
                            'baselineHeightStatus':b['heightStatus'],'baselineHeightM':b['height'],
                            'osmRoofShape':b['tags'].get('roof:shape'),**r})
    for f in read('candidates.geojson.gz')['features']:
        r = sample(transform(TO_UTM.transform,shape(f['geometry'])),dom,dtm,dv)
        if r['status']!='outside-pinned-dom':
            records.append({'id':f['id'],'kind':'gap-candidate','quarantineReasons':f['properties']['quarantineReasons'],**r})
    summary = {'dom':'Existing 0.5 m DOM, project 6266; raster derived from aerial laser, not raw points',
               'dtm':'Existing 2 m DTM, project 6266/6282 mosaic; ground registration/epoch uncertainty retained',
               'records':records,'counts':dict(collections.Counter(r['kind']+':'+r['status'] for r in records)),
               'roofHypotheses':dict(collections.Counter(r['roof']['hypothesis'] if r.get('roof',{}).get('status')=='shape-hypothesis-passes-raster-screen' else 'not-supported-or-conflict' for r in records if r['kind']=='existing')),
               'roofSourceConflicts':sum(r.get('roof',{}).get('status')=='mapped-roof-conflict-review' for r in records),
               'timing':{'seconds':round(time.perf_counter()-start,4),'peakRssMiB':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,2)}}
    write('height-results.json',summary)
    print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2))


if __name__=='__main__':
    main()
