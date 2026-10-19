#!/usr/bin/env python3
"""Opt-in authoring download of pinned open-data subsets, never runtime/build.

Retains proxy/TLS defaults; no credentials, background export order or viewer
extraction. Aborts on source drift or an unsupported HTTP Range response.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import urllib.request

import pyarrow.parquet as pq
from shapely import from_wkb
from shapely.geometry import box, mapping, shape

from audit import APP, BOUNDS, HERE, ROOT


def fetch(url, target, expected, byte_limit):
    raw = target.read_bytes() if target.exists() else None
    if raw is None:
        with urllib.request.urlopen(url,timeout=60) as response:
            raw=response.read(byte_limit+1)
        if len(raw)>byte_limit:
            raise ValueError('Download limit exceeded')
        if hashlib.sha256(raw).hexdigest()!=expected:
            raise ValueError('Source drift: '+target.name)
        target.write_bytes(raw)
    if hashlib.sha256(raw).hexdigest()!=expected:
        raise ValueError('Cache drift: '+target.name)
    return raw


class LockedRanges(io.RawIOBase):
    def __init__(self, contract, cache):
        self.contract,self.cache,self.pos=contract,cache,0
        self.size=contract['source']['file:size']
        self.ranges={(r['start'],r['end']):r for r in contract['requests']}

    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
        return self.pos

    def read(self,size=-1):
        if size<0:
            raise ValueError('Unbounded Parquet read refused')
        size=min(size,self.size-self.pos)
        if size<=0:return b''
        start,end=self.pos,self.pos+size-1
        entry=self.ranges.get((start,end))
        if not entry:
            raise ValueError('Unreviewed byte range; use pinned PyArrow version')
        path=self.cache/f'ov-range-{start}-{end}.bin'
        if path.exists():
            raw=path.read_bytes()
        else:
            request=urllib.request.Request(self.contract['source']['href'],headers={'Range':f'bytes={start}-{end}'})
            with urllib.request.urlopen(request,timeout=60) as response:
                if response.status!=206:
                    raise ValueError('HTTP server did not honour byte range')
                raw=response.read(size+1)
            if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
                raise ValueError('Range source drift')
            path.write_bytes(raw)
        if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
            raise ValueError('Range cache drift')
        self.pos+=size
        return raw


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,required=True)
    args=parser.parse_args()
    args.cache.mkdir(parents=True,exist_ok=True)
    lock=json.loads((HERE/'inputs.json').read_text())
    tile=fetch(lock['microsoftTile']['Url'],args.cache/'ms-120020133.gz',
               lock['upstreamFiles']['ms-120020133.gz']['sha256'],16_000_000)
    scope=box(*BOUNDS)
    ms=[]
    for line_number,line in enumerate(gzip.decompress(tile).splitlines(keepends=True),1):
        f=json.loads(line)
        if shape(f['geometry']).intersects(scope):
            f['id']=f"120020133:line-{line_number}:{hashlib.sha256(line).hexdigest()[:16]}"
            ms.append(f)
    remote=LockedRanges(lock['overtureRanges'],args.cache)
    parquet=pq.ParquetFile(remote)
    overture=[]
    west,south,east,north=BOUNDS
    for group in lock['overtureRanges']['rowGroups']:
        for record in parquet.read_row_group(group).to_pylist():
            b=record['bbox']
            if b['xmin']<=east and b['xmax']>=west and b['ymin']<=north and b['ymax']>=south:
                geometry=from_wkb(record.pop('geometry'))
                record.pop('bbox')
                overture.append({'type':'Feature','id':record['id'],'properties':record,'geometry':mapping(geometry)})
    for name,features in [('microsoft.geojson.gz',ms),('overture.geojson.gz',overture)]:
        raw=gzip.compress(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':'),default=str).encode(),mtime=0)
        rel=str((HERE/name).relative_to(ROOT))
        if hashlib.sha256(raw).hexdigest()!=lock['localInputs'][rel]['sha256']:
            raise ValueError('Re-extracted subset differs; existing retained')
        # Output only research copies. Never overwrite an observed app snapshot.
        (HERE/name).write_bytes(raw)
        print(name,len(features),len(raw),'locked hash verified')
    terrain=json.loads((APP/'public/data/terrain-source.json').read_text())['raster']
    ground=APP/'data-cache/research-2a/bergen-dtm-2m.tif'
    ground.parent.mkdir(parents=True,exist_ok=True)
    fetch(terrain['url'],ground,terrain['sha256'],11_000_000)


if __name__=='__main__':
    main()
