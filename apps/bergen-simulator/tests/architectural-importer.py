"""Offline roof reconstruction regression tests. No external calls or source writes."""

import sys
import hashlib, importlib.util, json, struct, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import rasterio
from pyproj import Transformer
from shapely.geometry import Polygon, Point

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP / "scripts"))
spec = importlib.util.spec_from_file_location(
    "architecture", APP / "scripts/build-architecture.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchitecturalImporter(unittest.TestCase):
    def test_pinned_raster_crs_resolution_integrity_and_fit_acceptance(self):
        source = APP / "tests/fixtures/r1b-dom.tif"
        entry = next(e for e in module.INPUTS if e["file"] == "dom.tif")
        self.assertEqual(
            hashlib.sha256(source.read_bytes()).hexdigest(), entry["sha256"]
        )
        city = json.loads((APP / "public/data/bergen.json").read_text())
        T = Transformer.from_crs(4326, 25832, always_xy=True)
        with rasterio.open(source) as raster:
            self.assertEqual(raster.crs.to_epsg(), 25832)
            self.assertEqual(raster.res, (0.5, 0.5))
            self.assertEqual(
                raster.read(1, masked=True).count(), raster.width * raster.height
            )
            for id, expected in [
                ("way/488690084", True),
                ("way/292320261", False),
                ("way/393025479", True),
            ]:
                b = next(b for b in city["buildings"] if b["id"] == id)
                before = json.dumps(b)
                fit = module.fit_roof(b, raster, T)[-1]
                self.assertEqual(fit["accepted"], expected)
                self.assertEqual(json.dumps(b), before)
                if id == "way/393025479":
                    self.assertAlmostEqual(fit["ridgeNN2000"], 9.602, delta=0.02)

    def test_compiled_roofs_cover_only_original_footprints(self):
        catalogue = json.loads((APP / "src/architecture/catalogue.json").read_text())
        raw = (APP / ("public" + catalogue["url"])).read_bytes()
        count = struct.unpack_from("<I", raw, 12)[0]
        g = json.loads(raw[20 : 20 + count])
        binary = 20 + count + 8
        city = json.loads((APP / "public/data/bergen.json").read_text())
        for mesh in g["meshes"]:
            # R1C Skur body is a multi-component silhouette; its roof/relief
            # constraints are verified in reconstruction-importer.py.
            if (
                mesh["extras"]["layer"] != "body"
                or mesh["extras"]["sourceId"] == "way/393025479"
            ):
                continue
            b = next(
                b for b in city["buildings"] if b["id"] == mesh["extras"]["sourceId"]
            )
            poly = Polygon(b["rings"][0])
            a = g["accessors"][mesh["primitives"][0]["attributes"]["POSITION"]]
            v = g["bufferViews"][a["bufferView"]]
            values = struct.unpack_from(
                "<" + str(a["count"] * 3) + "f", raw, binary + v.get("byteOffset", 0)
            )
            area = 0
            for i in range(0, len(values), 9):
                points = [(values[i + k], values[i + k + 2]) for k in (0, 3, 6)]
                tri = Polygon(points)
                if tri.area < 0.00001:
                    continue
                self.assertTrue(poly.buffer(0.001).covers(tri.centroid))
                area += tri.area
            self.assertAlmostEqual(area, poly.area, delta=0.02)

    def test_corrupt_cached_source_rejected_without_network_or_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p = root / "data-cache/r1b/example"
            p.parent.mkdir(parents=True)
            p.write_bytes(b"bad")
            with patch.object(module, "APP", root), patch.object(
                module.urllib.request,
                "urlopen",
                side_effect=AssertionError("Unexpected network"),
            ):
                with self.assertRaisesRegex(ValueError, "Source drift"):
                    module.checked(
                        dict(
                            file="example",
                            url="https://example.invalid",
                            sha256="0" * 64,
                        )
                    )
            self.assertEqual(p.read_bytes(), b"bad")
            self.assertFalse((root / "public").exists())


if __name__ == "__main__":
    unittest.main()
