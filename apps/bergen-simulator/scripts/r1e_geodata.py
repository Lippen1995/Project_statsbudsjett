#!/usr/bin/env python3
"""R1E opt-in, pinned public-raster authoring. Never writes public/data or saves.

Raw native-grid DOM/DTM are observations; fitted roofs remain source-derived
estimates. Existing architectural assets and mapped metric heights take priority.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np
from pyproj import Transformer
import rasterio
from shapely import contains_xy, constrained_delaunay_triangles
from shapely.geometry import LineString, Polygon, box
from shapely.ops import split, transform

APP=Path(__file__).resolve().parent.parent
R=6371008.8
RAD=math.pi/180
T=Transformer.from_crs(4326,25832,always_xy=True)


def local_utm(x,z,y=None):
    return T.transform(5.3235+np.asarray(x)/(R*RAD*math.cos(60.395*RAD)),60.395-np.asarray(z)/(R*RAD))


def checked(path,expected):
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected:
        raise ValueError('R1E input drift: '+path.name)
    return raw


def robust(A,h):
    b=np.linalg.lstsq(A,h,rcond=None)[0]
    for _ in range(5):
        error=h-A@b
        keep=abs(error)<=max(.4,float(np.median(abs(error)))*2.5)
        if keep.sum()<40 or np.linalg.matrix_rank(A[keep])<A.shape[1]:
            raise ValueError('insufficient roof inliers')
        b=np.linalg.lstsq(A[keep],h[keep],rcond=None)[0]
    return b


def fit(building,dom,dtm,dom_values=None,dtm_values=None):
    local=Polygon(building['rings'][0],building['rings'][1:])
    g=transform(local_utm,local)
    if not box(*dom.bounds).covers(g):return {'status':'outside-pilot'}
    if not g.is_valid or g.geom_type!='Polygon' or len(g.interiors):return {'status':'unsupported-topology'}
    inner=g.buffer(-.75)
    if inner.is_empty:return {'status':'insufficient-interior'}
    window=rasterio.windows.from_bounds(*inner.bounds,transform=dom.transform).round_offsets().round_lengths()
    if window.width*window.height>250000:raise ValueError('Raster window bound')
    row,col=np.indices((int(window.height),int(window.width)))
    row,col=row.ravel()+int(window.row_off),col.ravel()+int(window.col_off)
    x,y=rasterio.transform.xy(dom.transform,row,col)
    x,y=np.array(x),np.array(y)
    keep=contains_xy(inner,x,y)
    row,col,x,y=row[keep],col[keep],x[keep],y[keep]
    if len(x)<80:return {'status':'insufficient-samples'}
    top=(dom_values[row,col] if dom_values is not None else dom.read(1,window=window)[(row-window.row_off).astype(int),(col-window.col_off).astype(int)]).astype(float)
    ground=(dtm_values[row,col] if dtm_values is not None else dtm.read(1,window=window)[(row-window.row_off).astype(int),(col-window.col_off).astype(int)]).astype(float)
    if not np.isfinite(top).all()or not np.isfinite(ground).all():raise ValueError('NoData in pilot')
    relative=top-ground
    record={'status':'height-only','samples':len(x),'q10AboveGroundM':round(float(np.percentile(relative,10)),3),
            'q50AboveGroundM':round(float(np.percentile(relative,50)),3),'q90AboveGroundM':round(float(np.percentile(relative,90)),3),
            'groundRangeM':round(float(np.ptp(ground)),3)}
    if not 2<=record['q90AboveGroundM']<=80:return {**record,'status':'unsupported-surface-height'}
    if g.area/g.minimum_rotated_rectangle.area<.85:return record
    # Model axes use the ORIGINAL local footprint; no footprint reshaping/snapping.
    r=np.array(local.minimum_rotated_rectangle.exterior.coords)[:-1]
    edges=np.roll(r,-1,axis=0)-r
    along=edges[np.argmax(np.linalg.norm(edges,axis=1))];along/=np.linalg.norm(along)
    across=np.array([-along[1],along[0]])
    # Recover exact local coordinates from observed raster cell positions.
    reverse=Transformer.from_crs(25832,4326,always_xy=True)
    lon,lat=reverse.transform(x,y)
    xy=np.column_stack([(lon-5.3235)*(R*RAD*math.cos(60.395*RAD)),-(lat-60.395)*R*RAD])
    center=np.array([local.centroid.x,local.centroid.y]);xy-=center
    u,v=xy@along,xy@across
    # One-metre block holdout reduces direct adjacent-cell leakage; still not
    # an independent field survey or independent acquisition.
    train=((row//4+col//4)%2)==0
    if min(train.sum(),(~train).sum())<40:return record
    A=np.column_stack([np.ones(len(x)),u,abs(v)])
    plane=np.column_stack([np.ones(len(x)),u,v])
    try:
        beta=robust(A[train],top[train]);bp=robust(plane[train],top[train])
    except ValueError:return record
    residual=top[~train]-A[~train]@beta
    rmse=float(np.sqrt(np.mean(residual**2)))
    planar=float(np.sqrt(np.mean((top[~train]-plane[~train]@bp)**2)))
    pitch=math.degrees(math.atan(-beta[2]));fraction=float(np.mean(abs(residual)<=.65))
    roof={'center':center.tolist(),'along':along.tolist(),'across':across.tolist(),
          'coefficients':beta.tolist(),'holdoutRmseM':round(rmse,4),'planeHoldoutRmseM':round(planar,4),
          'within065m':round(fraction,4),'pitchDegrees':round(pitch,2)}
    if not(10<=pitch<=65 and rmse<=.65 and fraction>=.85 and rmse<.7*planar):return {**record,'roofDiagnostic':roof}
    if building['tags'].get('roof:shape')not in (None,'gabled'):
        return {**record,'status':'mapped-roof-conflict','roofDiagnostic':roof}
    vertices=np.array(building['rings'][0][:-1]);offset=vertices-center
    at_corners=beta[0]+beta[1]*(offset@along)+beta[2]*abs(offset@across)
    if float(at_corners.min())<max(building['ground'][0])+2:
        return {**record,'status':'roof-ground-conflict','roofDiagnostic':roof}
    return {**record,'status':'supported-gable-hypothesis','roof':roof}


def roof_height(record,p):
    roof=record['roof'];q=np.array(p)-roof['center'];b=roof['coefficients']
    return float(b[0]+b[1]*np.dot(q,roof['along'])+b[2]*abs(np.dot(q,roof['across'])))


def geometry(building,record):
    ring=building['rings'][0][:-1];p=Polygon(ring);roof=record['roof']
    center=np.array(roof['center']);along=np.array(roof['along']);across=np.array(roof['across'])
    limit=200;ridge=LineString([center-along*limit,center+along*limit])
    # Split roof at inferred ridge. Every output triangle stays in source outline.
    parts=list(split(p,ridge).geoms)
    positions=[];colors=[]
    wall=[.32,.28,.23];top=[.24,.15,.11] # restrained artistic palette, not a material survey
    def tri(a,b,c,color):
        if np.linalg.norm(np.cross(np.array(b)-a,np.array(c)-a))<1e-8:return
        positions.extend([*a,*b,*c]);colors.extend(color*3)
    for part in parts:
        for t in constrained_delaunay_triangles(part).geoms:
            a,b,c=list(t.exterior.coords)[:3]
            tri([a[0],roof_height(record,a),a[1]],[c[0],roof_height(record,c),c[1]],[b[0],roof_height(record,b),b[1]],top)
    for i,a in enumerate(ring):
        b=ring[(i+1)%len(ring)];da=np.dot(np.array(a)-center,across);db=np.dot(np.array(b)-center,across)
        points=[(a,building['ground'][0][i])]
        if da*db<0:
            f=da/(da-db);points.append(((np.array(a)+(np.array(b)-a)*f).tolist(),building['ground'][0][i]*(1-f)+building['ground'][0][(i+1)%len(ring)]*f))
        points.append((b,building['ground'][0][(i+1)%len(ring)]))
        for (v,vg),(w,wg)in zip(points,points[1:]):
            low1=[v[0],vg,v[1]];low2=[w[0],wg,w[1]];high1=[v[0],roof_height(record,v),v[1]];high2=[w[0],roof_height(record,w),w[1]]
            tri(low1,low2,high2,wall);tri(low1,high2,high1,wall)
    return positions,colors


def glb(meshes):
    blob=bytearray();views=[];accessors=[];out=[]
    def attribute(array):
        data=np.array(array,dtype='<f4').tobytes();offset=len(blob);blob.extend(data)
        vi=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':34962})
        a=np.array(array).reshape(-1,3);ai=len(accessors);accessors.append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()});return ai
    for ident,positions,colors in meshes:
        out.append({'primitives':[{'attributes':{'POSITION':attribute(positions),'COLOR_0':attribute(colors)},'material':0}], 'extras':{'sourceId':ident}})
    doc={'asset':{'version':'2.0','generator':'Bergen R1E source-derived raster roof compiler v1'},'scene':0,
         'scenes':[{'nodes':list(range(len(out)))}],'nodes':[{'mesh':i,'extras':{'sourceId':m['extras']['sourceId']}}for i,m in enumerate(out)],
         'meshes':out,'materials':[{'pbrMetallicRoughness':{'metallicFactor':0,'roughnessFactor':1},'doubleSided':True}],
         'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
    return struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob


def validate_rasters(dom,dtm,dom_values,dtm_values):
    if not(dom.crs.to_epsg()==25832==dtm.crs.to_epsg()and dom.res==dtm.res==(.25,.25)and dom.transform==dtm.transform and dom.shape==dtm.shape):
        raise ValueError('Incompatible pilot raster grids or CRS')
    if not(np.isfinite(dom_values).all()and np.isfinite(dtm_values).all()and -20<dom_values.min()and dom_values.max()<600 and -20<dtm_values.min()and dtm_values.max()<600):
        raise ValueError('Invalid pilot raster coverage/values')
    # Empty mosaics can return a valid TIFF with all-zero pixels and no NoData.
    # This land-and-water pilot has independently pinned nonconstant terrain.
    if np.ptp(dtm_values)<.25 or np.percentile(dtm_values,90)<.5:
        raise ValueError('Empty or unsupported pilot terrain response')


def compile_assets():
    lock=json.loads((APP/'scripts/r1e-inputs.json').read_text())
    checked(APP/'public/data/bergen.json',lock['snapshotSha256'])
    for entry in lock['files']:checked(APP/entry['path'],entry['sha256'])
    city=json.loads((APP/'public/data/bergen.json').read_text())
    old=json.loads((APP/'src/architecture/catalogue.json').read_text());old_ids={b['id']for b in old['buildings']}
    properties=json.loads((APP/'tests/fixtures/r1e/project-6266.json').read_text())['ProjectMetadata'][0]['properties']
    if not(properties['LAS_PROJECT_ID']=='6266'and properties['BEST_OPEN']=='1'and properties['KOORDINATSYSTEM']=='25832'and properties['HOYDESYSTEM']=='5941'):
        raise ValueError('Project rights, identity or datum mismatch')
    dom=rasterio.open(APP/'tests/fixtures/r1e/dom-025.tif');dtm=rasterio.open(APP/'tests/fixtures/r1e/dtm-025.tif')
    dom_values,dtm_values=dom.read(1),dtm.read(1)
    validate_rasters(dom,dtm,dom_values,dtm_values)
    results=[];selected=[];meshes=[]
    for b in city['buildings']:
        result=fit(b,dom,dtm,dom_values,dtm_values)
        if result['status']=='outside-pilot':continue
        results.append({'id':b['id'],'originalHeightStatus':b['heightStatus'],'originalHeightM':b['height'],'originalElevationM':b['elevation'],**result})
        if result['status']!='supported-gable-hypothesis'or b['height']is not None or b['id']in old_ids:continue
        if len(selected)>=16:continue
        positions,colors=geometry(b,result)
        roof=result['roof'];roof={k:([round(float(v),7)for v in val]if isinstance(val,list)else val)for k,val in roof.items()}
        selected.append({'id':b['id'],'footprint':b['rings'],'sourceHeight':b['height'],'sourceElevation':b['elevation'],'sourceGround':b['ground'],
                         'roof':roof,'triangles':len(positions)//9,'heightQ90M':result['q90AboveGroundM'],
                         'truthClass':'SOURCE_DERIVED_ESTIMATE','facade':'schematic; no openings or materials surveyed'})
        meshes.append((b['id'],positions,colors))
    if not selected:raise ValueError('No eligible new roofs; retain existing renderer')
    raw=glb(meshes);sha=hashlib.sha256(raw).hexdigest()
    if len(raw)>256*1024 or sum(x['triangles']for x in selected)>2500:raise ValueError('Pilot geometry budget exceeded')
    manifest={'version':1,'snapshotSha256':lock['snapshotSha256'],'origin':city['origin'],'bounds':city['bounds'],
              'url':f'/enhancements/bryggen-2022-{sha[:16]}.glb','sha256':sha,'bytes':len(raw),
              'source':'Kartverket / Bergen 10pkt 2022, native 0.25 m DOM/DTM; EPSG:25832 / NN2000 EPSG:5941',
              'acquisitionDate':'2022-04-18','acquisitionDateMeaning':'Last project flight, not per-pixel date',
              'licence':'CC-BY-4.0 + OSM ODbL-1.0','inputHashes':{e['path']:e['sha256']for e in lock['files']},
              'buildings':selected}
    (APP/'public/enhancements').mkdir(exist_ok=True);(APP/'src/enhancements').mkdir(exist_ok=True)
    (APP/'public'/manifest['url'][1:]).write_bytes(raw)
    (APP/'src/enhancements/catalogue.json').write_text(json.dumps(manifest,indent=2)+'\n')
    target=APP.parent.parent/'docs/bergen-simulator/r1e-evidence'
    target.mkdir(exist_ok=True)
    (target/'roof-results.json').write_text(json.dumps({'snapshotSha256':lock['snapshotSha256'],'records':results,
           'integratedIds':[s['id']for s in selected],'triangles':sum(s['triangles']for s in selected),'glbBytes':len(raw)},indent=2)+'\n')
    print('R1E',len(results),'buildings assessed;',len(selected),'unknown-height buildings in opt-in roof pilot;',len(raw),'GLB bytes')
    return manifest,results


if __name__=='__main__':compile_assets()
