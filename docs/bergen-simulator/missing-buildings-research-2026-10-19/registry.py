#!/usr/bin/env python3
"""Four bounded public-register probes. Points support review, never roofprints.

Only --acquire accesses the public WFS. No ownership, addresses, household or
bruksenhet details are retained. Runtime/source geography is never changed.
"""
import argparse
import hashlib
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from shapely import STRtree
from shapely.geometry import Point, mapping, shape, box
from shapely.ops import transform

from audit import read, HERE, TO_UTM, TO_WGS, checked_inputs, load_baseline, write

NS={'a':'http://skjema.geonorge.no/SOSI/produktspesifikasjon/Matrikkelen-Bygningspunkt/20211101',
    'g':'http://www.opengis.net/gml/3.2','w':'http://www.opengis.net/wfs/2.0'}
SELECTED=['overture:bf8cda4a-2d01-48cc-b7d2-0e2e1eb639c1',
          'overture:16c376e2-ddb8-4054-be8d-42a577771af0',
          'overture:7eb0b26f-0b54-4ca4-8b51-6c22120175f9',
          'microsoft:120020133:line-105626:7f1f9bdc1472d040']


def completed_register_status(properties):
    # A registry lifecycle code is supporting evidence, never geometry or survey.
    # In particular IG is permission to commence, GR is approved demolition.
    return properties.get('bygningsstatus') in ('TB','MB','FA')


def parse_points(raw, bounds):
    root=ET.fromstring(raw)
    records=[]
    for b in root.findall('.//a:Bygning',NS):
        p=b.find('.//g:Point',NS)
        if p is None or p.attrib.get('srsName')!='urn:ogc:def:crs:EPSG::25832':
            raise ValueError('Unexpected register CRS or geometry')
        coords=[float(v)for v in p.find('g:pos',NS).text.split()]
        if len(coords)!=2 or not box(*bounds).covers(Point(*coords)):
            raise ValueError('Point outside requested bbox')
        props={}
        for name in ['bygningsnummer','bygningsstatus','uuidBygning','stedfestingVerifisert','oppdateringsdato']:
            el=b.find('a:'+name,NS)
            props[name]=el.text if el is not None else None
        records.append({'id':b.attrib['{'+NS['g']+'}id'],'pointUtm32':coords,'properties':props})
    if len(records)>=50:
        raise ValueError('Potentially truncated register query; do not claim completeness')
    return records


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--acquire',action='store_true');args=parser.parse_args()
    checked_inputs()
    candidates={f['id']:f for f in read('candidates.geojson.gz')['features']}
    if args.acquire:
        if (HERE/'registry-probes.json').exists():
            raise ValueError('Refuse to overwrite locked register inputs; a new source revision is required')
        probes=[]
        for ident in SELECTED:
            g=transform(TO_UTM.transform,shape(candidates[ident]['geometry']))
            bounds=g.buffer(3).bounds
            params={'service':'WFS','version':'2.0.0','request':'GetFeature','typeNames':'app:Bygning',
                    'srsName':'urn:ogc:def:crs:EPSG::25832','bbox':','.join(map(str,bounds))+',urn:ogc:def:crs:EPSG::25832',
                    'count':'50','propertyName':'app:representasjonspunkt,app:bygningsnummer,app:bygningsstatus,app:uuidBygning,app:stedfestingVerifisert,app:oppdateringsdato'}
            url='https://wfs.geonorge.no/skwms1/wfs.matrikkelen-bygningspunkt?'+urllib.parse.urlencode(params)
            with urllib.request.urlopen(url,timeout=40) as response:
                raw=response.read(300001)
            if len(raw)>300000:raise ValueError('Bounded register response exceeds research limit')
            points=parse_points(raw,bounds)
            probes.append({'candidateId':ident,'url':url,'bboxUtm32':bounds,'rawSha256':hashlib.sha256(raw).hexdigest(),
                           'rawBytes':len(raw),'points':points})
        write('registry-probes.json',{'accessedAt':'2026-10-19','licence':'CC-BY-4.0','probes':probes,
              'warning':'Source WFS ignores property projection and reports unreliable numberReturned; parse actual bounded members. Retain only selected non-personal building fields. Not a complete central-Bergen register extraction.'})
    source=json.loads((HERE/'registry-probes.json').read_text())
    _,base=load_baseline()
    gs=[g for b,g in base];tree=STRtree(gs)
    output=[]
    for probe in source['probes']:
        ident=probe['candidateId'];g=transform(TO_UTM.transform,shape(candidates[ident]['geometry']))
        points=[]
        for p in probe['points']:
            geom=Point(*p['pointUtm32'])
            points.append({**p,'insideCandidate':g.covers(geom),
                           'insideExistingFootprint':bool(len(tree.query(geom,predicate='intersects'))),
                           'pointWgs84':TO_WGS.transform(*p['pointUtm32'])})
        output.append({'candidateId':ident,'points':points,'pointsInsideCandidate':sum(p['insideCandidate']for p in points),
                       'completedStatusPointsInsideCandidate':sum(p['insideCandidate'] and completed_register_status(p['properties']) for p in points),
                       'status':'review-support-only-never-geometry-admission'})
    write('registry-results.json',{'records':output,'newBuildingsAdmitted':0})
    for r in output:print(r['candidateId'],'register points',len(r['points']),'inside candidate',r['pointsInsideCandidate'],'completed-status support',r['completedStatusPointsInsideCandidate'])


if __name__=='__main__':main()
