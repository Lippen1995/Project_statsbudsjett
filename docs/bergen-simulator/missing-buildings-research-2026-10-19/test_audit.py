#!/usr/bin/env python3
"""Safety, matching and raster regressions for the isolated experiment."""
import copy
import gzip
import json
import sys
import unittest
from unittest.mock import patch

import numpy as np
from affine import Affine
from shapely import STRtree
from shapely.geometry import LineString, Polygon, box

import audit
from heights import bilinear, fit_shapes, respect_roof_metadata
from registry import completed_register_status, parse_points
import registry


class Matching(unittest.TestCase):
    def setUp(self):
        self.gs=[box(0,0,10,10),box(12,0,22,10)]
        self.tree=STRtree(self.gs)

    def test_identical_and_split_merge_do_not_become_missing_buildings(self):
        self.assertEqual(audit.classify(self.gs[0],self.tree,self.gs)['classification'],'spatial-match')
        self.assertEqual(audit.classify(box(0,0,22,10),self.tree,self.gs)['classification'],'spatial-match')
        self.assertEqual(audit.classify(box(0,0,5,10),self.tree,self.gs)['classification'],'spatial-match')

    def test_disjoint_gap_and_near_touch_are_separate(self):
        self.assertEqual(audit.classify(box(30,0,40,10),self.tree,self.gs)['classification'],'gap-candidate')
        self.assertEqual(audit.classify(box(10,0,11,10),self.tree,self.gs)['classification'],'ambiguous-overlap-or-near')
        self.assertEqual(audit.classify(box(23,0,25,10),self.tree,self.gs)['classification'],'ambiguous-overlap-or-near')

    def test_invalid_topology_rejected_without_repair(self):
        bow=Polygon([(0,0),(10,10),(0,10),(10,0),(0,0)])
        self.assertEqual(audit.classify(bow,self.tree,self.gs)['classification'],'invalid-source-geometry')
        self.assertFalse(bow.is_valid)

    def test_original_identity_not_reassigned_by_changed_geometry(self):
        c=audit.classify(box(30,0,40,10),self.tree,self.gs,'way/1',{'way/1'})
        self.assertEqual(c['classification'],'same-source-id')
        self.assertEqual(c['coveredFraction'],0)

    def test_screens_water_road_coast_coverage_and_existing_footprint(self):
        roads=[LineString([(15,-20),(15,40)]).buffer(2)]
        ctx=(box(-20,-20,40,40),LineString([(38,-20),(38,40)]),box(20,20,30,30),STRtree(roads),roads)
        self.assertIn('mapped-road-review-corridor',audit.screen(box(13,0,18,5),ctx))
        self.assertIn('inland-water',audit.screen(box(21,21,27,27),ctx))
        self.assertIn('coastline-review-buffer',audit.screen(box(35,0,38,8),ctx))
        self.assertIn('outside-rendered-terrain-or-sea',audit.screen(box(36,0,44,8),ctx))
        self.assertIn('existing-footprint-overlap',audit.screen(box(0,0,5,5),ctx,.02))
        self.assertEqual(audit.screen(box(0,0,5,5),ctx),[])

    def test_shared_osm_lineage_and_attribute_only_sources(self):
        f={'properties':{'sources':[{'dataset':'OpenStreetMap','property':'','record_id':'w123@4'},
                                    {'dataset':'Microsoft ML Buildings','property':'/properties/height','record_id':None}]}}
        self.assertEqual(audit.source_osm_id(f),'way/123')
        self.assertEqual(audit.source_lineage(f),['OpenStreetMap'])


class Raster(unittest.TestCase):
    def test_pixel_centre_bilinear_sampling_and_outside_failure(self):
        a=np.arange(16,dtype=float).reshape(4,4)
        t=Affine(2,0,10,0,-2,20)
        self.assertEqual(bilinear(a,t,[11],[19])[0],0)
        self.assertAlmostEqual(bilinear(a,t,[12],[18])[0],2.5)
        with self.assertRaises(ValueError):bilinear(a,t,[9],[19])
        a[0,0]=np.nan
        with self.assertRaises(ValueError):bilinear(a,t,[11],[19])

    def test_roof_shapes_are_deterministic_hypotheses_and_flat_is_not_gabled(self):
        g=box(0,0,30,10)
        rows,cols=np.indices((16,56));row,col=rows.ravel(),cols.ravel()
        x,y=col*.5+1,row*.5+1
        h=10-.5*abs(y-5)
        a=fit_shapes(g,x,y,h,row,col)
        self.assertEqual(a,fit_shapes(g,x,y,h,row,col))
        self.assertEqual(a['hypothesis'],'symmetric-gable')
        self.assertAlmostEqual(a['pitchDegreesEstimated'],26.57,places=2)
        flat=fit_shapes(g,x,y,np.full(len(x),10),row,col)
        self.assertEqual(flat['hypothesis'],'plane')

    def test_complex_and_inadequate_roofs_do_not_get_invented_geometry(self):
        g=Polygon([(0,0),(30,0),(30,5),(5,5),(5,30),(0,30)])
        self.assertEqual(fit_shapes(g,np.array([]),np.array([]),np.array([]),np.array([]),np.array([]))['status'],
                         'complex-or-nonrectangular-no-simple-roof')

    def test_good_fit_cannot_override_a_different_mapped_roof(self):
        fit={'status':'shape-hypothesis-passes-raster-screen','hypothesis':'symmetric-gable'}
        original=copy.deepcopy(fit)
        self.assertEqual(respect_roof_metadata(fit,'hipped')['status'],'mapped-roof-conflict-review')
        self.assertEqual(respect_roof_metadata(fit,'gabled')['status'],fit['status'])
        self.assertEqual(fit,original)


class Integrity(unittest.TestCase):
    def test_input_drift_fails_before_outputs(self):
        with patch.object(audit,'digest',return_value='incorrect'):
            with self.assertRaisesRegex(ValueError,'Input drift'):audit.checked_inputs()

    def test_real_snapshot_and_all_source_ids_remain_intact(self):
        audit.checked_inputs()
        raw=(audit.APP/'public/data/bergen.json').read_bytes()
        d,base=audit.load_baseline()
        saved=copy.deepcopy(d)
        gs=[g for b,g in base];tree=STRtree(gs)
        audit.classify(gs[0],tree,gs)
        self.assertEqual(d,saved)
        self.assertEqual((audit.APP/'public/data/bergen.json').read_bytes(),raw)
        self.assertEqual(len(base),6502)
        # One multipolygon source has two disjoint components. Preserve that
        # relationship rather than inventing an extra observed building identity.
        self.assertEqual(len({b['id']for b,g in base}),6501)
        parts=[g for b,g in base if b['id']=='relation/5903565']
        self.assertEqual(len(parts),2)
        self.assertTrue(parts[0].disjoint(parts[1]))

    def test_all_candidate_results_stay_in_quarantine_including_clear_masks(self):
        records=audit.read('candidate-triage.json.gz')['records']
        self.assertTrue(records)
        self.assertTrue(any(not r['maskReasons']for r in records))
        self.assertTrue(all(r['admission']=='quarantine-only-no-approved-new-building'for r in records))
        self.assertEqual(json.loads((audit.HERE/'detail-results.json').read_text())['newBuildingsAdmitted'],0)

    def test_missing_heights_are_not_relabelled_observed(self):
        d,base=audit.load_baseline()
        self.assertEqual(sum(b['heightStatus']=='unknown'and b['height']is None for b,g in base),2878)
        for name in ('microsoft.geojson.gz','overture.geojson.gz'):
            f=json.load(gzip.open(audit.HERE/name))['features']
            self.assertEqual(len({x['id']for x in f}),len(f))


class Register(unittest.TestCase):
    def test_live_reacquisition_refuses_to_overwrite_the_locked_extract(self):
        with patch.object(sys,'argv',['registry.py','--acquire']),patch.object(registry.urllib.request,'urlopen') as network:
            with self.assertRaisesRegex(ValueError,'Refuse to overwrite'):registry.main()
            network.assert_not_called()

    def test_planned_and_demolition_status_are_not_completed_building_evidence(self):
        for status in ('IG','RA','GR','BR','unknown',None):
            self.assertFalse(completed_register_status({'bygningsstatus':status}))
        for status in ('TB','MB','FA'):
            self.assertTrue(completed_register_status({'bygningsstatus':status}))

    def test_wrong_crs_and_outside_points_fail_closed(self):
        xml='''<FeatureCollection xmlns:a="http://skjema.geonorge.no/SOSI/produktspesifikasjon/Matrikkelen-Bygningspunkt/20211101" xmlns:g="http://www.opengis.net/gml/3.2"><a:Bygning g:id="test"><a:representasjonspunkt><g:Point srsName="urn:ogc:def:crs:EPSG::25832"><g:pos>10 10</g:pos></g:Point></a:representasjonspunkt></a:Bygning></FeatureCollection>'''
        self.assertEqual(len(parse_points(xml,(0,0,20,20))),1)
        with self.assertRaises(ValueError):parse_points(xml,(0,0,5,5))
        with self.assertRaises(ValueError):parse_points(xml.replace('25832','4326'),(0,0,20,20))

    def test_registry_points_do_not_promote_candidates_or_override_geometry(self):
        records=json.loads((audit.HERE/'registry-results.json').read_text())['records']
        self.assertEqual(len(records),4)
        self.assertTrue(any(r['pointsInsideCandidate']for r in records))
        self.assertTrue(all(r['completedStatusPointsInsideCandidate']==0 for r in records))
        self.assertTrue(all(r['status']=='review-support-only-never-geometry-admission'for r in records))


if __name__=='__main__':
    unittest.main(verbosity=2)
