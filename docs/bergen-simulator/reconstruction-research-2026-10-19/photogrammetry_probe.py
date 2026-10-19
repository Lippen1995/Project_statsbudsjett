"""Bounded CPU SfM probe of already licensed Skur references, not asset publication.

Run with isolated PyCOLMAP 4.0.3. Writes only a NEW temporary
workspace. No source modifications, acquisition, invented cameras or dense fill.
"""
import argparse
import hashlib
import json
import resource
import shutil
import sqlite3
import time
from pathlib import Path

import pycolmap as colmap

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "apps/bergen-simulator"


def run(destination, enhanced=False):
    destination.mkdir(parents=True, exist_ok=False)
    images = destination / "images"
    images.mkdir()
    locks = json.loads((APP / "scripts/r1c-inputs.json").read_text())
    locks += [e for e in json.loads((APP / "scripts/r1b-inputs.json").read_text()) if e["file"] == "skur11.jpg"]
    inputs = []
    for entry in locks:
        source = APP / "data-cache/r1b" / entry["file"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry["sha256"]
        shutil.copyfile(source, images / entry["file"])
        inputs.append({k: entry[k] for k in ["file", "sha256", "bytes"]})
    database = destination / "database.db"
    extraction = colmap.FeatureExtractionOptions()
    extraction.max_image_size = 2400 if enhanced else 1600
    extraction.num_threads = 2
    extraction.use_gpu = False
    extraction.sift.max_num_features = 8192 if enhanced else 4096
    extraction.sift.estimate_affine_shape = enhanced
    extraction.sift.domain_size_pooling = enhanced
    matching = colmap.FeatureMatchingOptions()
    matching.num_threads = 2
    matching.use_gpu = False
    matching.guided_matching = True
    mapping = colmap.IncrementalPipelineOptions()
    mapping.num_threads = 2
    mapping.random_seed = 7
    mapping.mapper.random_seed = 7
    mapping.min_model_size = 3  # default 10 would reject every five-image collection
    mapping.max_num_models = 3
    mapping.init_num_trials = 50
    mapping.max_runtime_seconds = 120
    mapping.ba_use_gpu = False
    start = time.monotonic()
    colmap.extract_features(database, images, extraction_options=extraction, device=colmap.Device.cpu)
    extracted = time.monotonic()
    colmap.match_exhaustive(database, matching_options=matching, device=colmap.Device.cpu)
    matched = time.monotonic()
    sparse = destination / "sparse"
    sparse.mkdir()
    models = colmap.incremental_mapping(database, images, sparse, options=mapping)
    end = time.monotonic()
    with sqlite3.connect(database) as db:
        names = dict(db.execute("SELECT image_id,name FROM images"))
        features = [{"image": names[i], "keypoints": rows} for i, rows in db.execute("SELECT image_id,rows FROM keypoints")]
        verified = []
        for pair, rows, configuration in db.execute("SELECT pair_id,rows,config FROM two_view_geometries"):
            left, right = divmod(pair, 2147483647)
            verified.append({"images": [names[left], names[right]], "inliers": rows, "configuration": configuration})
    report = {
        "tool": "PyCOLMAP", "version": colmap.__version__, "cudaAvailable": colmap.has_cuda,
        "inputs": inputs, "configuration": {"imageMaxSide": extraction.max_image_size, "siftMaxFeatures": extraction.sift.max_num_features,
        "affineShapeAndDspSift": enhanced,
        "threads": 2, "seed": 7, "guidedMatching": True, "cameraMode": "AUTO / EXIF priors",
        "minimumModelImages": 3, "initialInliers": mapping.mapper.init_min_num_inliers,
        "initialTriangulationAngleDegrees": mapping.mapper.init_min_tri_angle, "mappingDeadlineSeconds": 120},
        "timingsSeconds": {"features": extracted-start, "matching": matched-extracted, "mapping": end-matched, "total": end-start},
        "peakProcessRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "features": features, "verifiedPairs": verified,
        "models": [{"id": i, "registeredImages": m.num_reg_images(), "points3D": m.num_points3D(),
        "meanReprojectionErrorPixels": m.compute_mean_reprojection_error(),
        "images": sorted(im.name for im in m.images.values())} for i, m in models.items()],
        "metricScaleAndGeoreference": "unavailable; no surveyed control points or accepted similarity transform",
        "denseModel": "not attempted: CPU-only sparse feasibility probe; sparse success alone does not justify a complete facade mesh",
        "inputAccuracy": "uncalibrated 2009/2012 photographs; no withheld survey ground truth",
    }
    (destination / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--enhanced", action="store_true")
    args = parser.parse_args()
    assert not args.destination.resolve().is_relative_to(ROOT), "Experiments must stay outside the repository"
    run(args.destination.resolve(), args.enhanced)
