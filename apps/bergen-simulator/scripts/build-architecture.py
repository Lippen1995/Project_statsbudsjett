#!/usr/bin/env python3
"""R1B opt-in, pinned-source asset compiler. Never writes public/data or saves.
Dependencies: requirements-geo.txt. Source drift aborts before any output write.
Outputs GLB 2.0, one shared photo atlas, immutable source-ID catalogue.
"""
import hashlib, io, json, math, struct, urllib.request
from pathlib import Path
import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import Point, Polygon
from PIL import Image

APP = Path(__file__).resolve().parent.parent
INPUTS = json.loads((APP / "scripts/r1b-inputs.json").read_text())
IDS = [
    "way/488690084",
    "way/331274578",
    "way/331274560",
    "way/331274567",
    "way/292320260",
    "way/292320261",
    "way/393025479",
]
# Original photograph /5 pixel coordinates, manually traced from visible edges.
# Order: left eave, apex, right eave, right lower crop, left lower crop.
# Crops stop above the street: no synthetic completion of occluded shopfronts.
TRACES = [
    [[51, 487], [117, 407], [198, 487], [198, 580], [51, 580]],
    [[202, 485], [270, 400], [335, 485], [335, 580], [202, 580]],
    [[337, 483], [377, 443], [413, 483], [413, 580], [337, 580]],
    [[414, 485], [477, 406], [549, 485], [549, 580], [414, 580]],
    [[551, 491], [600, 423], [650, 491], [650, 580], [551, 580]],
    [[650, 483], [702, 413], [751, 483], [751, 580], [650, 580]],
]


def checked(entry):
    path = APP / "data-cache/r1b" / entry["file"]
    fixture = APP / "tests/fixtures/r1b-dom.tif"
    raw = (
        path.read_bytes()
        if path.exists()
        else (
            fixture.read_bytes()
            if entry["file"] == "dom.tif" and fixture.exists()
            else urllib.request.urlopen(entry["url"], timeout=60).read()
        )
    )
    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Source drift: " + entry["file"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return raw


def fit_roof(b, raster, T):
    ring = np.array(b["rings"][0][:-1])
    edges = np.roll(ring, -1, axis=0) - ring
    axis = edges[np.argmax(np.linalg.norm(edges, axis=1))]
    axis /= np.linalg.norm(axis)
    across = np.array([-axis[1], axis[0]])
    lo, hi = (ring @ across).min(), (ring @ across).max()
    mid = (lo + hi) / 2
    poly = Polygon(ring).buffer(-0.8)
    rows = []
    values_grid = raster.read(1)
    rad = math.pi / 180
    R = 6371008.8
    for x in np.arange(ring[:, 0].min(), ring[:, 0].max(), 0.5):
        for z in np.arange(ring[:, 1].min(), ring[:, 1].max(), 0.5):
            if not poly.contains(Point(x, z)):
                continue
            e, n = T.transform(
                5.3235 + x / (R * rad * math.cos(60.395 * rad)), 60.395 - z / (R * rad)
            )
            row, col = raster.index(e, n)
            h = float(values_grid[row, col])
            if not math.isfinite(h) or h < 0 or h > 50:
                raise ValueError("Invalid DOM sample")
            rows.append([abs(np.array([x, z]) @ across - mid), h])
    values = np.array(rows)
    A = np.column_stack([np.ones(len(values)), values[:, 0]])
    beta = np.linalg.lstsq(A, values[:, 1], rcond=None)[0]
    err = values[:, 1] - A @ beta
    for _ in range(5):
        keep = abs(err) < max(0.4, np.median(abs(err)) * 2.5)
        beta = np.linalg.lstsq(A[keep], values[keep, 1], rcond=None)[0]
        err = values[:, 1] - A @ beta
    rmse = float(np.sqrt(np.mean(err[keep] ** 2)))
    fraction = float(np.mean(keep))
    pitch = math.degrees(math.atan(-beta[1]))
    accepted = rmse <= 0.65 and fraction >= 0.85 and 10 <= pitch <= 65
    # Reject two multi-surface fits. Their existing OSM gables remain unchanged.
    eave = float(beta[0] + beta[1] * (hi - lo) / 2)
    ridge = float(beta[0])
    if not accepted:
        eave = b["elevation"] + 0.3 + b["height"] - float(b["tags"]["roof:height"])
        ridge = b["elevation"] + 0.3 + b["height"]
    if eave <= b["elevation"] + 1 or ridge <= eave:
        raise ValueError("Invalid roof envelope")
    return (
        ring,
        across,
        mid,
        lo,
        hi,
        eave,
        ridge,
        dict(
            method="robust symmetric gable fit to DOM; ridge axis inferred from OSM footprint",
            accepted=accepted,
            samples=len(values),
            inlierFraction=round(fraction, 4),
            inlierRmseM=round(rmse, 3),
            eaveNN2000=round(eave, 3),
            ridgeNN2000=round(ridge, 3),
            pitchDegrees=round(
                math.degrees(math.atan((ridge - eave) / ((hi - lo) / 2))), 2
            ),
        ),
    )


def main():
    raw = {x["file"]: checked(x) for x in INPUTS}
    project = json.loads(raw["dom-project.json"])["ProjectMetadata"][0]["properties"]
    assert project["HOYDESYSTEM"] == "5941" and project["BEST_OPEN"] == "1"
    data = json.loads((APP / "public/data/bergen.json").read_text())
    source_hash = hashlib.sha256(
        (APP / "public/data/bergen.json").read_bytes()
    ).hexdigest()
    assert (
        source_hash
        == "299b130ab55ed53aad274e9483167e8a6350bc32d3ba63b5cad17eae97f39812"
    ), "Pinned R1 snapshot changed; separate source revision required"
    raster = rasterio.open(io.BytesIO(raw["dom.tif"]))
    assert raster.crs.to_epsg() == 25832 and raster.res == (0.5, 0.5)
    T = Transformer.from_crs(4326, 25832, always_xy=True)
    image = Image.open(io.BytesIO(raw["reference.jpg"])).convert("RGB")
    assert image.size == (10872, 3952)
    atlas = Image.new("RGB", (1024, 1024), (150, 135, 113))
    meshes = []
    records = []
    # Small unindexed batches; flat normals preserve source roof breaks. GLB contains no executable/remote resources.
    for k, id in enumerate(IDS):
        b = next(x for x in data["buildings"] if x["id"] == id)
        ring, across, mid, lo, hi, eave, ridge, fit = fit_roof(b, raster, T)

        def roof(p):
            return eave + (ridge - eave) * max(
                0, 1 - abs(float(p @ across) - mid) / ((hi - lo) / 2)
            )

        verts = []
        cols = []
        wall = (
            [0.192, 0.333, 0.294]
            if k == 6
            else [
                [0.40, 0.19, 0.13],
                [0.69, 0.39, 0.13],
                [0.55, 0.18, 0.13],
                [0.53, 0.18, 0.13],
                [0.86, 0.84, 0.76],
                [0.86, 0.84, 0.76],
            ][k]
        )
        top = [0.192, 0.333, 0.294] if k == 6 else [0.40, 0.23, 0.17]

        def linear(v):
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

        def tri(a, b, c, color):
            verts.extend([*a, *b, *c])
            cols.extend([linear(v) for v in color] * 3)

        # Source footprint walls, including split gable ends. Lowest y follows pinned per-corner ground.
        for i, p in enumerate(ring):
            q = ring[(i + 1) % len(ring)]
            dp = p @ across - mid
            dq = q @ across - mid
            edge = [p]
            if dp * dq < 0:
                edge.append(p + (q - p) * (-dp) / (dq - dp))
            edge.append(q)
            for a, c in zip(edge, edge[1:]):
                g0 = b["ground"][0][i]
                g1 = b["ground"][0][i + 1]

                def ground(pt):
                    t = float(np.dot(pt - p, q - p) / np.dot(q - p, q - p))
                    return g0 + (g1 - g0) * t + 0.05

                for p0, p1, p2 in [
                    (
                        [a[0], ground(a), a[1]],
                        [c[0], ground(c), c[1]],
                        [c[0], roof(c), c[1]],
                    ),
                    (
                        [a[0], ground(a), a[1]],
                        [c[0], roof(c), c[1]],
                        [a[0], roof(a), a[1]],
                    ),
                ]:
                    tri(p0, p1, p2, wall)
        # Clip both roof planes to the exact mapped footprint; no invented dormers/chimneys.
        for side in [-1, 1]:
            half = []
            for i, p in enumerate(ring):
                q = ring[(i + 1) % len(ring)]
                dp = (p @ across - mid) * side
                dq = (q @ across - mid) * side
                if dp >= 0:
                    half.append(p)
                if dp * dq < 0:
                    half.append(p + (q - p) * (-dp) / (dq - dp))
            for i in range(1, len(half) - 1):
                pts = [half[0], half[i], half[i + 1]]
                if (
                    (pts[1] - pts[0])[0] * (pts[2] - pts[0])[1]
                    - (pts[1] - pts[0])[1] * (pts[2] - pts[0])[0]
                ) > 0:
                    pts.reverse()
                tri(*[[p[0], roof(p), p[1]] for p in pts], top)
        meshes.append(dict(id=id, kind="body", positions=verts, colors=cols))
        records.append(
            dict(
                id=id,
                footprint=b["rings"],
                sourceHeight=b["height"],
                sourceElevation=b["elevation"],
                label=(
                    "Skur 11"
                    if k == 6
                    else [
                        "Northern brown gable",
                        "Northern ochre gable",
                        "Narrow red gable",
                        "Wide red gable",
                        "North white gable",
                        "South white gable",
                    ][k]
                ),
                roof=fit,
                facade=(
                    "2022-10-03 photograph, perspective-mapped upper waterfront face; registration inferred, not a measured facade"
                    if k < 6
                    else "schematic OSM darkgreen; pillars, doors and corrugation unmodelled"
                ),
            )
        )
        if k == 6:
            continue
        trace = np.array(TRACES[k], dtype=float)
        minp = trace.min(axis=0)
        maxp = trace.max(axis=0)
        crop = image.crop(tuple((np.r_[minp, maxp] * 5).astype(int)))
        # 8px tile gutters prevent mip bleeding; source perspective is retained, not painted over.
        tile = crop.resize((240, 480), Image.Resampling.LANCZOS)
        ox = (k % 4) * 256 + 8
        oy = (k // 4) * 512 + 16
        atlas.paste(tile, (ox, oy))
        uv = [
            [
                float((ox + (p[0] - minp[0]) / (maxp[0] - minp[0]) * 240) / 1024),
                float((oy + (p[1] - minp[1]) / (maxp[1] - minp[1]) * 480) / 1024),
            ]
            for p in trace
        ]
        # Waterfront face selected from actual footprint edges toward SW. Ordered NW->SE like photo.
        edges = [(p, ring[(i + 1) % len(ring)]) for i, p in enumerate(ring)]
        a, c = max(
            edges, key=lambda edge: float(np.mean(edge, axis=0) @ np.array([-1, 1]))
        )
        if a[0] > c[0]:
            a, c = c, a
        t = -(a @ across - mid) / ((c - a) @ across)
        apex = a + (c - a) * t
        # Geometry height from accepted DOM envelope, or original OSM when fit fails. Lower shops occluded/not modelled.
        lower = b["elevation"] + (eave - b["elevation"]) * 0.27
        offset = np.array(
            [-0.018, 0.018]
        )  # presentation-only depth separation, 18mm, not surveyed cladding thickness
        points = [
            [a[0] + offset[0], roof(a), a[1] + offset[1]],
            [apex[0] + offset[0], ridge, apex[1] + offset[1]],
            [c[0] + offset[0], roof(c), c[1] + offset[1]],
            [c[0] + offset[0], lower, c[1] + offset[1]],
            [a[0] + offset[0], lower, a[1] + offset[1]],
        ]
        faces = [0, 2, 1, 0, 3, 2, 0, 4, 3]
        meshes.append(
            dict(
                id=id,
                kind="facade",
                positions=[v for i in faces for v in points[i]],
                uv=[v for i in faces for v in uv[i]],
            )
        )
    atlas_bytes = io.BytesIO()
    atlas.save(atlas_bytes, format="JPEG", quality=82, optimize=True, subsampling=2)
    blob = bytearray()
    views = []
    accessors = []

    def buffer(raw):
        while len(blob) % 4:
            blob.append(0)
        start = len(blob)
        blob.extend(raw)
        views.append(dict(buffer=0, byteOffset=start, byteLength=len(raw)))
        return len(views) - 1

    def attribute(values, size):
        a = np.array(values, dtype="<f4").reshape(-1, size)
        view = buffer(a.tobytes())
        accessors.append(
            dict(
                bufferView=view,
                componentType=5126,
                count=len(a),
                type={2: "VEC2", 3: "VEC3"}[size],
                min=a.min(axis=0).tolist(),
                max=a.max(axis=0).tolist(),
            )
        )
        return len(accessors) - 1

    gltf_meshes = []
    for m in meshes:
        a = np.array(m["positions"]).reshape(-1, 3)
        n = np.cross(
            a.reshape(-1, 3, 3)[:, 1] - a.reshape(-1, 3, 3)[:, 0],
            a.reshape(-1, 3, 3)[:, 2] - a.reshape(-1, 3, 3)[:, 0],
        )
        length = np.linalg.norm(n, axis=1)
        n /= np.maximum(length[:, None], 1e-10)
        n = np.repeat(n, 3, axis=0)
        attr = dict(POSITION=attribute(a, 3), NORMAL=attribute(n, 3))
        if "uv" in m:
            attr["TEXCOORD_0"] = attribute(m["uv"], 2)
        else:
            attr["COLOR_0"] = attribute(m["colors"], 3)
        gltf_meshes.append(
            dict(
                name=m["id"] + "|" + m["kind"],
                primitives=[dict(attributes=attr, material=int(m["kind"] == "facade"))],
                extras=dict(sourceId=m["id"], layer=m["kind"]),
            )
        )
    image_view = buffer(atlas_bytes.getvalue())
    g = dict(
        asset=dict(
            version="2.0",
            generator="Bergen R1B pinned architectural compiler",
            copyright="Geometry: OSM contributors ODbL-1.0 + Kartverket CC-BY-4.0. Photo atlas: Kognos / Wikimedia Commons CC-BY-SA-4.0; cropped/resampled. See NOTICE.md.",
        ),
        scene=0,
        scenes=[dict(nodes=list(range(len(meshes))))],
        nodes=[dict(mesh=i) for i in range(len(meshes))],
        meshes=gltf_meshes,
        accessors=accessors,
        bufferViews=views,
        buffers=[dict(byteLength=len(blob))],
        materials=[
            dict(
                name="source-envelope",
                doubleSided=True,
                pbrMetallicRoughness=dict(metallicFactor=0, roughnessFactor=1),
            ),
            dict(
                name="dated-photo-facades",
                doubleSided=True,
                pbrMetallicRoughness=dict(
                    baseColorTexture=dict(index=0), metallicFactor=0, roughnessFactor=1
                ),
            ),
        ],
        textures=[dict(source=0, sampler=0)],
        samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)],
        images=[dict(bufferView=image_view, mimeType="image/jpeg")],
    )
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    blob += b"\0" * ((-len(blob)) % 4)
    glb = (
        struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
        + struct.pack("<I4s", len(js), b"JSON")
        + js
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )
    digest = hashlib.sha256(glb).hexdigest()
    dest = APP / "public/architecture"
    dest.mkdir(exist_ok=True)
    name = "bryggen-" + digest[:16] + ".glb"
    (dest / name).write_bytes(glb)
    catalogue = dict(
        version=1,
        snapshotSha256=source_hash,
        url="/architecture/" + name,
        sha256=digest,
        bytes=len(glb),
        bounds=[-85, -330, 95, -120],
        textureSize=[1024, 1024],
        acquiredAt="2026-10-18",
        sources=INPUTS,
        buildings=records,
    )
    (APP / "src/architecture").mkdir(exist_ok=True)
    (APP / "src/architecture/catalogue.json").write_text(
        json.dumps(catalogue, indent=2) + "\n"
    )
    print(
        "Compiled", name, len(glb), "bytes", len(meshes), "meshes -> 2 runtime batches"
    )
    print([(r["id"], r["roof"]["accepted"], r["roof"]["inlierRmseM"]) for r in records])


if __name__ == "__main__":
    main()
