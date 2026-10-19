"""Extract exact R1C landmark buffers for a fair one-building comparison.

No topology, materials, elevations, axes or source IDs are changed. Unused atlas
and neighboring buildings are omitted only in this isolated benchmark artifact.
"""
import copy
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def extract(destination):
    app = ROOT / "apps/bergen-simulator"
    catalogue = json.loads((app / "src/architecture/catalogue.json").read_text())
    raw = (app / "public" / catalogue["url"].lstrip("/")).read_bytes()
    length = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20:20+length])
    binary = raw[28+length:]
    old = next(m for m in gltf["meshes"] if m.get("extras", {}).get("layer") == "landmark")
    mesh = copy.deepcopy(old)
    views, accessors, output = [], [], bytearray()
    for primitive in mesh["primitives"]:
        assert "indices" not in primitive
        for semantic, index in list(primitive["attributes"].items()):
            accessor = copy.deepcopy(gltf["accessors"][index])
            view = copy.deepcopy(gltf["bufferViews"][accessor["bufferView"]])
            start, count = view.get("byteOffset", 0), view["byteLength"]
            output.extend(b"\0" * (-len(output) % 4))
            view["byteOffset"] = len(output)
            output.extend(binary[start:start+count])
            accessor["bufferView"] = len(views)
            primitive["attributes"][semantic] = len(accessors)
            views.append(view)
            accessors.append(accessor)
        assert primitive["material"] == 0
    document = {
        "asset": {"version": "2.0", "generator": "R1C exact landmark buffer extraction; research only"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": old["name"], "extras": old["extras"]}],
        "meshes": [mesh], "materials": [gltf["materials"][0]],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(output)}],
    }
    js = json.dumps(document, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    output.extend(b"\0" * (-len(output) % 4))
    packed = struct.pack("<III", 0x46546C67, 2, 28+len(js)+len(output))
    packed += struct.pack("<II", len(js), 0x4E4F534A) + js
    packed += struct.pack("<II", len(output), 0x004E4942) + output
    destination.write_bytes(packed)
    print(json.dumps({"bytes": len(packed), "sourceId": mesh["extras"]["sourceId"], "triangles": accessors[0]["count"]//3}))


if __name__ == "__main__":
    destination = Path(sys.argv[1]).resolve()
    assert not destination.is_relative_to(ROOT)
    extract(destination)
