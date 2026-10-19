"""Small offline regression checks for research adapters; no app changes."""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from extract_landmark import ROOT, extract
from osm_probe import SOURCE, export


def read_glb(raw):
    n = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20+n]), raw[28+n:]


class ResearchAdapters(unittest.TestCase):
    def test_carrier_keeps_source_coordinates_tags_and_identity(self):
        before = SOURCE.read_bytes()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "one.osm"
            feature = export(path)
            xml = ET.parse(path).getroot()
            points = [{"lat": float(p.attrib["lat"]), "lon": float(p.attrib["lon"])} for p in xml.findall("node")]
            self.assertEqual(points, feature["geometry"][:-1])
            self.assertEqual(xml.find("way").attrib["id"], feature["id"])
            self.assertEqual({p.attrib["k"]: p.attrib["v"] for p in xml.find("way").findall("tag")}, feature["tags"])
            self.assertTrue(all(int(p.attrib["id"]) < 0 for p in xml.findall("node")))
            self.assertIn("not original OSM node", xml.find("note").text)
        self.assertEqual(before, SOURCE.read_bytes())

    def test_landmark_extraction_is_exact_bounded_and_repeatable(self):
        app = ROOT / "apps/bergen-simulator"
        catalogue = json.loads((app / "src/architecture/catalogue.json").read_text())
        source = (app / "public" / catalogue["url"].lstrip("/")).read_bytes()
        original, binary = read_glb(source)
        landmark = next(m for m in original["meshes"] if m.get("extras", {}).get("layer") == "landmark")
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/"a.glb", Path(d)/"b.glb"
            extract(a); extract(b)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            out, data = read_glb(a.read_bytes())
            self.assertEqual(len(out["meshes"]), 1)
            self.assertEqual(out["nodes"][0]["extras"]["sourceId"], "way/393025479")
            self.assertLess(len(data), 512*1024)
            for name, index in landmark["primitives"][0]["attributes"].items():
                old = original["accessors"][index]
                new = out["accessors"][out["meshes"][0]["primitives"][0]["attributes"][name]]
                old_view, new_view = original["bufferViews"][old["bufferView"]], out["bufferViews"][new["bufferView"]]
                i,j = old_view.get("byteOffset",0),new_view.get("byteOffset",0)
                self.assertEqual(binary[i:i+old_view["byteLength"]],data[j:j+new_view["byteLength"]])
                self.assertEqual({k:v for k,v in old.items() if k != 'bufferView'}, {k:v for k,v in new.items() if k != 'bufferView'})
        self.assertEqual(hashlib.sha256(source).hexdigest(), catalogue["sha256"])


if __name__ == "__main__":
    unittest.main()
