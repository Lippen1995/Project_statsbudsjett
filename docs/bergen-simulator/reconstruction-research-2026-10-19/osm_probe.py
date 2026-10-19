"""Export the pinned Skur footprint/tags to a temporary OSM2World experiment.

The compact source retained coordinates, not original footprint-node IDs. Negative
XML node references are carrier indices only, NEVER claims about observed nodes.
Original building identity, tags and coordinates remain intact. No geographic edits.
"""
import argparse
import gzip
import hashlib
import json
import resource
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps/bergen-simulator/public/data/bergen-osm.json.gz"


def export(destination):
    data = json.loads(gzip.decompress(SOURCE.read_bytes()))
    feature = next(f for f in data["features"] if f["type"] == "way" and f["id"] == "393025479")
    assert len(feature["geometry"]) == 5 and feature["geometry"][0] == feature["geometry"][-1]
    xml = ET.Element("osm", version="0.6", generator="BergenReimagined isolated research adapter")
    ET.SubElement(xml, "note").text = "OSM contributors / ODbL; negative node references are temporary coordinate-carrier IDs, not original OSM node identities."
    coordinates = feature["geometry"][:-1]
    ET.SubElement(xml, "bounds", minlat=str(min(p["lat"] for p in coordinates)-0.0001),
                  maxlat=str(max(p["lat"] for p in coordinates)+0.0001),
                  minlon=str(min(p["lon"] for p in coordinates)-0.0001),
                  maxlon=str(max(p["lon"] for p in coordinates)+0.0001))
    for i, p in enumerate(coordinates, 1):
        ET.SubElement(xml, "node", id=str(-i), version="1", visible="true", lat=str(p["lat"]), lon=str(p["lon"]))
    way = ET.SubElement(xml, "way", id=feature["id"], version="1", visible="true")
    for i in [1, 2, 3, 4, 1]:
        ET.SubElement(way, "nd", ref=str(-i))
    for k, v in sorted(feature["tags"].items()):
        ET.SubElement(way, "tag", k=k, v=v)
    ET.ElementTree(xml).write(destination, encoding="utf-8", xml_declaration=True)
    return feature


def run(destination, jar):
    destination.mkdir(parents=True, exist_ok=False)
    source = destination / "skur-carrier.osm"
    original = export(source)
    config = destination / "minimal.properties"
    config.write_text("createTerrain=false\nuseBuildingColors=true\nuseBillboards=false\n")
    output = destination / "skur-osm2world.glb"
    command = ["java", "-Xmx1024m", "-Djava.awt.headless=true", "-jar", str(jar),
               "--input", str(source), "--output", str(output), "--config", str(config), "--lod", "4"]
    start = time.monotonic()
    with (destination / "compiler.log").open("w") as log:
        result = subprocess.run(command, stdout=log, stderr=log, timeout=180, check=True)
    report = {
        "tool": "OSM2World", "version": "0.4.0", "jarSha256": hashlib.sha256(jar.read_bytes()).hexdigest(),
        "sourceSnapshotSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "sourceId": "way/393025479", "sourceTimestamp": original["timestamp"], "originalTags": original["tags"],
        "carrierNodeIds": "negative local XML indices; original building-node IDs not retained by compact snapshot",
        "carrierVersionAttributes": "format placeholders, not claimed original OSM edit versions",
        "geometryOrigin": "only pinned coordinates; no source changes or network refresh",
        "defaultDimensions": "NO metric height or roof height/pitch in source tags; OSM2World fills defaults. These are schematic, not measured.",
        "configuration": config.read_text(), "lod": 4, "runtimeSeconds": time.monotonic()-start,
        "peakChildRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
        "outputBytes": output.stat().st_size, "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "exitCode": result.returncode,
        "publication": "experiment only; never substitute for source-fitted R1C geometry",
    }
    (destination / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("jar", type=Path)
    args = parser.parse_args()
    assert not args.destination.resolve().is_relative_to(ROOT)
    run(args.destination.resolve(), args.jar.resolve())
