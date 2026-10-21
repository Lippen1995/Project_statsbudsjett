#!/usr/bin/env python3
"""Offline R1E GIS gates against pinned observations; no network or source writes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np
import rasterio
from shapely.geometry import Polygon

APP = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('r1e', APP / 'scripts/r1e_geodata.py')
r1e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r1e)


class PublicGeodata(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.city = json.loads((APP / 'public/data/bergen.json').read_text())
        cls.catalogue = json.loads((APP / 'src/enhancements/catalogue.json').read_text())
        cls.dom = rasterio.open(APP / 'tests/fixtures/r1e/dom-025.tif')
        cls.dtm = rasterio.open(APP / 'tests/fixtures/r1e/dtm-025.tif')
        cls.dv, cls.tv = cls.dom.read(1), cls.dtm.read(1)

    @classmethod
    def tearDownClass(cls):
        cls.dom.close()
        cls.dtm.close()

    def test_native_crs_grid_vertical_project_metadata_and_integrity(self):
        lock = json.loads((APP / 'scripts/r1e-inputs.json').read_text())
        for entry in lock['files']:
            self.assertEqual(hashlib.sha256((APP / entry['path']).read_bytes()).hexdigest(), entry['sha256'])
        self.assertEqual(self.dom.crs.to_epsg(), 25832)
        self.assertEqual(self.dom.transform, self.dtm.transform)
        self.assertEqual(self.dom.res, (.25, .25))
        self.assertEqual(self.dom.shape, (1008, 752))
        self.assertTrue(np.isfinite(self.dv).all() and np.isfinite(self.tv).all())
        project = json.loads((APP / 'tests/fixtures/r1e/project-6266.json').read_text())['ProjectMetadata'][0]['properties']
        self.assertEqual(project['HOYDESYSTEM'], '5941')
        self.assertEqual(project['BEST_OPEN'], '1')

    def test_repeated_fits_and_glb_are_byte_reproducible_without_mutation(self):
        before = json.dumps(self.city, sort_keys=True)
        meshes = []
        for record in self.catalogue['buildings']:
            building = next(b for b in self.city['buildings'] if b['id'] == record['id'])
            a = r1e.fit(building, self.dom, self.dtm, self.dv, self.tv)
            b = r1e.fit(building, self.dom, self.dtm, self.dv, self.tv)
            self.assertEqual(a, b)
            self.assertEqual(a['status'], 'supported-gable-hypothesis')
            self.assertLessEqual(a['roof']['holdoutRmseM'], .65)
            self.assertGreaterEqual(a['roof']['within065m'], .85)
            positions, colours = r1e.geometry(building, a)
            self.assertEqual(len(positions) // 9, record['triangles'])
            footprint = Polygon(building['rings'][0])
            for triangle in np.array(positions).reshape(-1, 3, 3):
                horizontal = Polygon(triangle[:, [0, 2]])
                if horizontal.area > 1e-7:
                    self.assertLess(horizontal.difference(footprint).area, 1e-7)
                self.assertTrue(np.isfinite(triangle).all())
            meshes.append((building['id'], positions, colours))
        self.assertEqual(hashlib.sha256(r1e.glb(meshes)).hexdigest(), self.catalogue['sha256'])
        self.assertEqual(json.dumps(self.city, sort_keys=True), before)

    def test_unknown_only_and_existing_verified_assets_have_priority(self):
        old = json.loads((APP / 'src/architecture/catalogue.json').read_text())
        self.assertFalse({b['id'] for b in old['buildings']} & {b['id'] for b in self.catalogue['buildings']})
        self.assertTrue(all(b['sourceHeight'] is None for b in self.catalogue['buildings']))
        self.assertEqual(len(self.catalogue['buildings']), 6)

    def test_outside_invalid_and_hole_geometry_cannot_be_promoted(self):
        source = next(b for b in self.city['buildings'] if b['id'] == self.catalogue['buildings'][0]['id'])
        outside = {**source, 'rings': [[[x + 2000, z] for x, z in source['rings'][0]]]}
        self.assertEqual(r1e.fit(outside, self.dom, self.dtm)['status'], 'outside-pilot')
        center = Polygon(source['rings'][0]).representative_point()
        x, z = center.x, center.y
        hole = [[x-.1,z-.1],[x+.1,z-.1],[x+.1,z+.1],[x-.1,z+.1],[x-.1,z-.1]]
        self.assertEqual(r1e.fit({**source, 'rings': [source['rings'][0], hole]}, self.dom, self.dtm)['status'], 'unsupported-topology')
        bowtie = [[x-1,z-1],[x+1,z+1],[x-1,z+1],[x+1,z-1],[x-1,z-1]]
        self.assertEqual(r1e.fit({**source, 'rings': [bowtie]}, self.dom, self.dtm)['status'], 'unsupported-topology')

    def test_nodata_and_input_drift_fail_closed(self):
        source = next(b for b in self.city['buildings'] if b['id'] == self.catalogue['buildings'][0]['id'])
        with self.assertRaisesRegex(ValueError, 'NoData'):
            r1e.fit(source, self.dom, self.dtm, np.full_like(self.dv, np.nan), self.tv)
        with self.assertRaisesRegex(ValueError, 'input drift'):
            r1e.checked(APP / 'public/data/bergen.json', '0' * 64)
        with self.assertRaisesRegex(ValueError, 'unsupported pilot terrain'):
            r1e.validate_rasters(self.dom,self.dtm,self.dv,np.zeros_like(self.tv))
        with self.assertRaisesRegex(ValueError, 'coverage/values'):
            r1e.validate_rasters(self.dom,self.dtm,np.full_like(self.dv,np.nan),self.tv)


if __name__ == '__main__':
    unittest.main()
