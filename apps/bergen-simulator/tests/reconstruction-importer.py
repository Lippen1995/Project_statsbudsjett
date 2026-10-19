"""Offline R1C component/geometry regressions; observed snapshot is immutable."""

import sys, copy, json, hashlib, unittest
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, Point

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP / "scripts"))
from reconstruction import reconstruct, validate_contract


class ReconstructionTests(unittest.TestCase):
    def setUp(self):
        self.city = json.loads((APP / "public/data/bergen.json").read_text())
        self.b = next(b for b in self.city["buildings"] if b["id"] == "way/393025479")
        self.c = json.loads(
            (APP / "scripts/reconstructions/skur-11.v1.json").read_text()
        )
        self.r = next(
            b["roof"]
            for b in json.loads((APP / "src/architecture/catalogue.json").read_text())[
                "buildings"
            ]
            if b["id"] == self.b["id"]
        )

    def test_deterministic_bounded_anchored_and_immutable(self):
        before = json.dumps([self.b, self.r, self.c])
        a = reconstruct(self.b, self.r, self.c)
        self.assertEqual(a, reconstruct(self.b, self.r, self.c))
        self.assertEqual(before, json.dumps([self.b, self.r, self.c]))
        p = np.array(a["positions"]).reshape(-1, 3)
        color = np.array(a["colors"])
        self.assertTrue(np.isfinite(p).all())
        self.assertTrue(((color >= 0) & (color <= 1)).all())
        self.assertLessEqual(len(p) // 3, 4000)
        self.assertGreater(len(p) // 3, 1000)
        poly = Polygon(self.b["rings"][0]).buffer(0.6)
        for x, y, z in p:
            self.assertTrue(poly.covers(Point(x, z)))
        self.assertLess(p[:, 1].max(), 12)
        self.assertGreaterEqual(p[:, 1].min(), 1.5)

    def test_medium_lod_preserves_pier_silhouette_and_reduces_geometry(self):
        hi = reconstruct(self.b, self.r, self.c)
        mid = reconstruct(self.b, self.r, self.c, detail=False)
        a = np.array(hi["positions"]).reshape(-1, 3)
        b = np.array(mid["positions"]).reshape(-1, 3)
        self.assertLess(len(b), len(a) / 2)
        self.assertAlmostEqual(a[:, 1].max(), b[:, 1].max(), delta=0.04)

    def test_no_degenerate_triangles_and_real_depth(self):
        m = reconstruct(self.b, self.r, self.c)
        p = np.array(m["positions"]).reshape(-1, 3, 3)
        area = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)
        self.assertTrue((area > 1e-9).all())
        # Points occur inside the footprint, not just on a photo plane.
        poly = Polygon(self.b["rings"][0])
        vertices = p.reshape(-1, 3)
        self.assertGreater(
            sum(poly.buffer(-0.1).contains(Point(v[0], v[2])) for v in vertices), 30
        )

    def test_invalid_recipe_fails_closed(self):
        for key, value in [("version", 2), ("sourceId", "way/unknown")]:
            c = copy.deepcopy(self.c)
            c[key] = value
            with self.assertRaises(AssertionError):
                validate_contract(c)
        for mutate in [
            lambda c: c.update(mesh=[]),
            lambda c: c["features"]["doors"][0].update(face="nw"),
            lambda c: c["features"]["piers"][0].update(u=2),
            lambda c: c["presentation"].update(recessM=-0.2),
        ]:
            c = copy.deepcopy(self.c)
            mutate(c)
            with self.assertRaises(AssertionError):
                validate_contract(c)

    def test_profile_reuses_source_identity_and_corner_anchors(self):
        # Test-only source fixture, not an invented Bergen record or emitted asset.
        b, c = copy.deepcopy(self.b), copy.deepcopy(self.c)
        b["id"] = c["sourceId"] = "way/123456"
        original = reconstruct(self.b, self.r, self.c)
        b["rings"][0] = b["rings"][0][1:-1] + b["rings"][0][:2]
        c["anchor"] = [1, 2, 0]
        result = reconstruct(b, self.r, c)
        self.assertEqual(result["id"], b["id"])
        self.assertEqual(result["positions"], original["positions"])
        c["anchor"] = [0, 0, 0]
        with self.assertRaises(AssertionError):
            validate_contract(c)

    def test_all_locked_reference_integrity(self):
        for e in json.loads((APP / "scripts/r1c-inputs.json").read_text()):
            p = APP / "data-cache/r1b" / e["file"]
            # Explicitly skip uncached images in a clean offline checkout; compiler requires
            # hashes before using them. Geometry tests need the retained recipe only.
            if p.exists():
                self.assertEqual(
                    hashlib.sha256(p.read_bytes()).hexdigest(), e["sha256"]
                )


if __name__ == "__main__":
    unittest.main()
