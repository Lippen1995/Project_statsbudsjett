"""Offline authoring regression tests; run with requirements-geo.txt installed."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from pyproj import Transformer
from rasterio.transform import from_origin

spec = importlib.util.spec_from_file_location('refinement', Path(__file__).resolve().parent.parent / 'scripts/refine-geography.py')
refinement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refinement)


class GeographicTransformTests(unittest.TestCase):
    def test_pixel_centres_and_bilinear_sampling(self):
        grid = np.array([[0, 10], [20, 30]], dtype=float)
        affine = from_origin(100, 200, 2, 2)
        self.assertEqual(refinement.bilinear_sample(grid, affine, 101, 199), 0)
        self.assertEqual(refinement.bilinear_sample(grid, affine, 102, 198), 15)
        with self.assertRaisesRegex(AssertionError, 'crop incomplete'):
            refinement.bilinear_sample(grid, affine, 99, 201)

    def test_utm33_axis_order_against_hoydedata_identify_response(self):
        # Public Identify response for 5.3235 E, 60.3975 N; not an invented height.
        e, n = Transformer.from_crs(4326, 25833, always_xy=True).transform(5.3235, 60.3975)
        self.assertAlmostEqual(e, -31939.178671492264, places=2)
        self.assertAlmostEqual(n, 6734875.662405913, places=2)

    def test_input_drift_aborts_without_replacing_cached_data(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(refinement, 'CACHE', Path(directory)):
            path = Path(directory) / 'fixture'
            path.write_bytes(b'verified input')
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(refinement.checked_input('https://example.invalid', 'fixture', expected), b'verified input')
            with self.assertRaisesRegex(RuntimeError, 'integrity check failed'):
                refinement.checked_input('https://example.invalid', 'fixture', '0'*64)
            self.assertEqual(path.read_bytes(), b'verified input')


if __name__ == '__main__': unittest.main()
