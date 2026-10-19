"""Source-linked parametric components, metres in the existing read-only grid.
Photo traces constrain feature positions; depths/finish are explicitly schematic.
No source writes, executable inputs, arbitrary meshes, or generated hidden facades.
"""

import math
import re
import numpy as np


def validate_contract(c):
    required = {
        "version",
        "sourceId",
        "tier",
        "references",
        "features",
        "presentation",
        "limitations",
    }
    assert required <= set(c) <= required | {"anchor", "evidencedFaces", "palette"}
    assert c["version"] == 1 and re.fullmatch(r"way/[1-9][0-9]{0,14}", c["sourceId"])
    anchor = c.get("anchor", [2, 3, 1])
    assert len(anchor) == 3 and len(set(anchor)) == 3
    assert all(type(i) is int and 0 <= i < 4 for i in anchor)
    faces = c.get("evidencedFaces", ["sw", "ne", "se"])
    assert len(faces) <= 4 and len(set(faces)) == len(faces)
    assert all(f in ["sw", "ne", "se", "nw"] for f in faces)
    if "palette" in c:
        assert set(c["palette"]) == {"wall", "metal", "stone"}
        assert all(
            len(v) == 3 and all(math.isfinite(x) and 0 <= x <= 1 for x in v)
            for v in c["palette"].values()
        )
    assert c["tier"] == 1
    assert set(c["features"]) == {"doors", "piers", "corrugationPitchM"}
    assert 0.15 <= c["features"]["corrugationPitchM"] <= 0.3
    assert len(c["features"]["doors"]) <= 8 and len(c["features"]["piers"]) <= 8
    for d in c["features"]["doors"]:
        assert set(d) == {
            "face",
            "u0",
            "u1",
            "heightFraction",
            "reference",
            "confidence",
        }
        assert d["face"] in faces and 0 <= d["u0"] < d["u1"] <= 1
        assert (
            0.4 <= d["heightFraction"] <= 0.95 and d["confidence"] == "photo-inferred"
        )
        assert d["reference"] in c["references"]
    for p in c["features"]["piers"]:
        assert set(p) == {"u", "v", "reference", "confidence"}
        assert 0 <= p["u"] <= 1 and p["v"] in [0, 1]
        assert p["reference"] in c["references"] and p["confidence"] == "photo-inferred"
    assert set(c["presentation"]) == {
        "recessM",
        "pierWidthM",
        "reliefM",
        "capAboveEaveM",
    }
    for k, v in c["presentation"].items():
        assert math.isfinite(v) and 0 < v <= (3 if k == "capAboveEaveM" else 0.8)
    return c


class Components:
    """One unindexed, vertex-coloured batch. Reusable box/strip/reveal components."""

    def __init__(self, origin, along, across):
        self.origin, self.along, self.across = origin, along, across
        self.positions, self.colors = [], []

    def world(self, p):
        q = self.origin + p[0] * self.along + p[2] * self.across
        return [float(q[0]), float(p[1]), float(q[1])]

    def tri(self, a, b, c, color):
        self.positions.extend(self.world(a) + self.world(b) + self.world(c))
        linear = [
            v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in color
        ]
        self.colors.extend(linear * 3)

    def quad(self, a, b, c, d, color):
        self.tri(a, b, c, color)
        self.tri(a, c, d, color)

    def box(self, lo, hi, color):
        x, y, z = lo
        X, Y, Z = hi
        p = [
            [x, y, z],
            [X, y, z],
            [X, Y, z],
            [x, Y, z],
            [x, y, Z],
            [X, y, Z],
            [X, Y, Z],
            [x, Y, Z],
        ]
        for a, b, c, d in [
            (0, 3, 2, 1),
            (4, 5, 6, 7),
            (0, 4, 7, 3),
            (1, 2, 6, 5),
            (3, 7, 6, 2),
            (0, 1, 5, 4),
        ]:
            self.quad(p[a], p[b], p[c], p[d], color)

    def brace(self, a, b, width, depth, color, face):
        a, b = np.array(a, dtype=float), np.array(b, dtype=float)
        delta = b - a
        normal = np.array([-delta[1], delta[0]])
        normal *= width / 2 / np.linalg.norm(normal)
        pts = [a - normal, b - normal, b + normal, a + normal]

        def pos(p, offset):
            return (
                [p[0], p[1], offset] if face in ["ne", "sw"] else [offset, p[1], p[0]]
            )

        self.quad(*[pos(p, depth) for p in pts], color)


def reconstruct(b, roof, c, detail=True):
    validate_contract(c)
    assert (
        len(b["rings"]) == 1
    ), "Courtyard/multi-ring profile requires another reviewed adapter"
    ring = np.array(b["rings"][0][:-1], dtype=float)
    assert b["id"] == c["sourceId"], "Reconstruction/source identity mismatch"
    assert len(ring) == 4
    o, a, v = c.get("anchor", [2, 3, 1])
    origin = ring[o]
    along = ring[a] - origin
    across = ring[v] - origin
    opposite = next(i for i in range(4) if i not in [o, a, v])
    assert np.linalg.norm(ring[opposite] - (origin + along + across)) <= 0.03
    L, W = np.linalg.norm(along), np.linalg.norm(across)
    along /= L
    across /= W
    assert 2 < L <= 100 and 1 < W <= 40 and L >= W and abs(along @ across) < 0.01
    mesh = Components(origin, along, across)
    eave, ridge = roof["eaveNN2000"], roof["ridgeNN2000"]
    base = min(b["ground"][0]) + 0.05
    green = c.get("palette", {}).get("wall", [0.29, 0.45, 0.36])
    metal = c.get("palette", {}).get("metal", [0.10, 0.16, 0.14])
    stone = c.get("palette", {}).get("stone", [0.60, 0.59, 0.54])
    P = c["presentation"]
    pitch = c["features"]["corrugationPitchM"]
    # Side-by-side strips follow a photo-supported corrugated form. Exact pitch,
    # thickness, roughness and relief are presentation parameters, not measurements.
    for face, length in [("sw", L), ("ne", L), ("se", W), ("nw", W)]:
        doors = [d for d in c["features"]["doors"] if d["face"] == face]
        steps = (
            math.ceil(length / (pitch / 2))
            if detail and face in c.get("evidencedFaces", ["sw", "ne", "se"])
            else 1
        )
        breaks = sorted(
            set(
                ([length / 2] if face in ["se", "nw"] else [])
                + [i * length / steps for i in range(steps + 1)]
                + [d[k] * length for d in doors for k in ["u0", "u1"]]
            )
        )

        def position(s, y, depth):
            if face == "sw":
                return [s, y, -depth]
            if face == "ne":
                return [s, y, W + depth]
            if face == "se":
                return [L + depth, y, s]
            return [-depth, y, s]

        def top(s):
            return (
                eave
                if face in ["ne", "sw"]
                else eave + (ridge - eave) * (1 - abs(2 * s / W - 1))
            )

        for a, z in zip(breaks, breaks[1:]):
            d = next(
                (
                    d
                    for d in doors
                    if d["u0"] * length <= (a + z) / 2 <= d["u1"] * length
                ),
                None,
            )
            bottom = base + (eave - base) * d["heightFraction"] if d else base
            da = (
                P["reliefM"] * (1 + math.cos(a / pitch * 2 * math.pi)) / 2
                if steps > 1
                else 0
            )
            dz = (
                P["reliefM"] * (1 + math.cos(z / pitch * 2 * math.pi)) / 2
                if steps > 1
                else 0
            )
            mesh.quad(
                position(a, bottom, da),
                position(z, bottom, dz),
                position(z, top(z), dz),
                position(a, top(a), da),
                green,
            )
        for d in doors:
            a, z = d["u0"] * length, d["u1"] * length
            h = base + (eave - base) * d["heightFraction"]
            depth = -P["recessM"]
            # Actual open facade recess: wall triangles above deliberately omit this bay.
            mesh.quad(
                position(a, base, depth),
                position(z, base, depth),
                position(z, h, depth),
                position(a, h, depth),
                [0.23, 0.37, 0.30],
            )
            for p, q in [((a, base), (a, h)), ((z, h), (z, base)), ((a, h), (z, h))]:
                mesh.quad(
                    position(*p, 0),
                    position(*q, 0),
                    position(*q, depth),
                    position(*p, depth),
                    metal,
                )
            # Raised frame and X bracing from the dated references; no invented window pattern.
            for s in [a, (a + z) / 2, z]:
                if face in ["ne", "sw"]:
                    v = 0 if face == "sw" else W
                    mesh.box(
                        [s - 0.035, base, v - 0.055], [s + 0.035, h, v + 0.055], metal
                    )
                else:
                    end = L if face == "se" else 0
                    mesh.box(
                        [end - 0.055, base, s - 0.035],
                        [end + 0.055, h, s + 0.035],
                        metal,
                    )
            normalDepth = (
                -0.01
                if face in ["sw", "nw"]
                else W + 0.01 if face == "ne" else L + 0.01
            )
            for left, right in [(a, (a + z) / 2), ((a + z) / 2, z)]:
                for p, q in [
                    ([left, base + 0.1], [right, h - 0.1]),
                    ([right, base + 0.1], [left, h - 0.1]),
                ]:
                    mesh.brace(p, q, 0.07, normalDepth, metal, face)
    # Source-fitted gable planes, with thin photo-supported fascia; no dormers/chimneys.
    for v0, v1 in [(0, W / 2), (W / 2, W)]:

        def y(v):
            return eave + (ridge - eave) * (1 - abs(2 * v / W - 1))

        mesh.quad(
            [0, y(v0), v0],
            [L, y(v0), v0],
            [L, y(v1), v1],
            [0, y(v1), v1],
            [0.25, 0.42, 0.34],
        )
        if detail:
            # Coarse raised seams rather than a costly wavy roof tessellation.
            for u in np.arange(0, L, 0.7):
                mesh.quad(
                    [u, y(v0) + 0.02, v0],
                    [u + 0.035, y(v0) + 0.02, v0],
                    [u + 0.035, y(v1) + 0.02, v1],
                    [u, y(v1) + 0.02, v1],
                    [0.31, 0.46, 0.37],
                )
    # Only source-visible piers; do not mirror an unseen north gable.
    for p in c["features"]["piers"]:
        u, v = p["u"] * L, p["v"] * W
        w = P["pierWidthM"]
        half = w / 2
        h = eave + P["capAboveEaveM"]
        mesh.box(
            [u - half - 0.09, base, v - half - 0.09],
            [u + half + 0.09, base + 0.42, v + half + 0.09],
            stone,
        )
        n = 9 if detail else 1
        for i in range(n):
            y0 = base + 0.42 + (h - base - 0.85) * i / n
            y1 = base + 0.42 + (h - base - 0.85) * (i + 1) / n - 0.012
            tone = [x * (0.96 + (i % 3) * 0.025) for x in stone]
            mesh.box([u - half, y0, v - half], [u + half, y1, v + half], tone)
        mesh.box(
            [u - half - 0.05, eave - 0.16, v - half - 0.05],
            [u + half + 0.05, eave + 0.22, v + half + 0.05],
            [0.48, 0.47, 0.41],
        )
        # Rolled capital is evidenced in 2009/2012 views. Shape dimensions inferred.
        radius = w * 0.63
        cy = h - 0.2
        nseg = 12 if detail else 8
        bands = (
            [
                (-half - 0.025, 0.9),
                (-half / 2, 1),
                (0, 0.9),
                (half / 2, 1),
                (half + 0.025, 0.9),
            ]
            if detail
            else [(-half - 0.025, 1), (half + 0.025, 1)]
        )
        for (v0, r0), (v1, r1) in zip(bands, bands[1:]):
            for i in range(nseg):
                a = 2 * math.pi * i / nseg
                z = 2 * math.pi * (i + 1) / nseg

                def point(angle, offset, r):
                    return [
                        u + radius * r * math.cos(angle),
                        cy + radius * r * math.sin(angle),
                        v + offset,
                    ]

                mesh.quad(
                    point(a, v0, r0),
                    point(a, v1, r1),
                    point(z, v1, r1),
                    point(z, v0, r0),
                    stone,
                )
        for offset, r in [bands[0], bands[-1]]:
            for i in range(nseg):
                a = 2 * math.pi * i / nseg
                z = 2 * math.pi * (i + 1) / nseg
                mesh.tri(
                    [u, cy, v + offset],
                    [
                        u + radius * r * math.cos(a),
                        cy + radius * r * math.sin(a),
                        v + offset,
                    ],
                    [
                        u + radius * r * math.cos(z),
                        cy + radius * r * math.sin(z),
                        v + offset,
                    ],
                    [0.53, 0.52, 0.47],
                )
                if detail:
                    # The visible circular roll motif is supported by the dated photos;
                    # shallow ring depth is illustrative, not a surveyed carving.
                    d = offset + (0.008 if offset > 0 else -0.008)
                    R = radius * 0.57
                    rr = radius * 0.50
                    mesh.quad(
                        [u + R * math.cos(a), cy + R * math.sin(a), v + d],
                        [u + R * math.cos(z), cy + R * math.sin(z), v + d],
                        [u + rr * math.cos(z), cy + rr * math.sin(z), v + d],
                        [u + rr * math.cos(a), cy + rr * math.sin(a), v + d],
                        [0.46, 0.45, 0.40],
                    )
    vertices = len(mesh.positions) // 3
    assert vertices % 3 == 0 and vertices // 3 <= 4000
    a = np.array(mesh.positions).reshape(-1, 3)
    assert np.isfinite(a).all() and a[:, 1].min() >= 0 and a[:, 1].max() <= 40
    return dict(
        id=b["id"], kind="landmark", positions=mesh.positions, colors=mesh.colors
    )
