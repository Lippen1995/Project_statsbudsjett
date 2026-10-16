import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { parseCityData, type Building } from "../src/geo/types";
import { project, unproject } from "../src/geo/projection";
import {
  buildingGeometry,
  featureAtFace,
  makeBuildings,
  makeRoads,
  makeWater,
  roadGeometry,
  polygonShape,
} from "../src/geo/geometry";
import { terrainSampler } from "../src/geo/surface";
import { gableProfile, metreTag } from "../src/geo/roofs";

const data = parseCityData(
  JSON.parse(
    readFileSync(
      new URL("../public/data/bergen.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("geographic snapshot and provenance", () => {
  it("rejects absent and structurally corrupt snapshots", () => {
    expect(() => parseCityData(null)).toThrow();
    expect(() =>
      parseCityData({
        ...data,
        terrain: { positions: [0, NaN, 0], indices: [0] },
      }),
    ).toThrow();
    expect(() => parseCityData({ ...data, version: 2 })).toThrow();
  });
  it("matches the redistributed OSM source checksum", () => {
    const raw = gunzipSync(
      readFileSync(
        new URL("../public/data/bergen-osm.json.gz", import.meta.url),
      ),
    );
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      data.provenance.osmSha256,
    );
    expect(JSON.parse(raw.toString()).licence).toBe("ODbL-1.0");
  });
  it("contains real mapped geometry with elevations and stable OSM identities", () => {
    expect(data.buildings.length).toBeGreaterThan(100);
    expect(data.roads.length).toBeGreaterThan(100);
    expect(data.coastline.length).toBeGreaterThan(0);
    expect(data.provenance.terrainTiles.length).toBeGreaterThan(0);
    for (const feature of [
      ...data.buildings,
      ...data.roads,
      ...data.landmarks,
    ]) {
      expect(feature.id).toMatch(/^(way|node|relation)\/\d+$/);
      expect(feature.location[0]).toBeGreaterThanOrEqual(
        data.bounds[0] - 0.000001,
      );
      expect(feature.location[1]).toBeGreaterThanOrEqual(
        data.bounds[1] - 0.000001,
      );
      expect(feature.location[0]).toBeLessThanOrEqual(
        data.bounds[2] + 0.000001,
      );
      expect(feature.location[1]).toBeLessThanOrEqual(
        data.bounds[3] + 0.000001,
      );
    }
    expect(
      Math.max(...data.terrain.positions.filter((_, i) => i % 3 === 1)),
    ).toBeGreaterThan(100);
  });
  it("keeps unknown heights null and never presents storey-derived heights as observed", () => {
    for (const b of data.buildings) {
      if (b.heightStatus === "unknown") expect(b.height).toBeNull();
      else if (b.heightStatus === "levels-estimate")
        expect(b.height).toBeCloseTo(Number(b.tags["building:levels"]) * 3, 2);
      else expect(b.tags.height).toBeTruthy();
    }
  });
});

describe("local metre coordinate system", () => {
  it("maps the source origin to zero and keeps north at negative Z", () => {
    expect(project(data.origin, data.origin)).toEqual([0, -0]);
    expect(
      project([data.origin[0], data.origin[1] + 0.001], data.origin)[1],
    ).toBeCloseTo(-111.195, 2);
    expect(
      project([data.origin[0] + 0.001, data.origin[1]], data.origin)[0],
    ).toBeGreaterThan(50);
  });
  it("round-trips actual mapped feature locations without axis reversal", () => {
    for (const feature of data.buildings.slice(0, 20)) {
      const result = unproject(
        project(feature.location, data.origin),
        data.origin,
      );
      expect(result[0]).toBeCloseTo(feature.location[0], 8);
      expect(result[1]).toBeCloseTo(feature.location[1], 8);
    }
  });
});

describe("geometry and merged-mesh selection", () => {
  it("preserves courtyard holes and vertical metre scale", () => {
    const rings: Building["rings"] = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [2, 8],
        [8, 8],
        [8, 2],
        [2, 2],
      ],
    ];
    expect(polygonShape(rings).holes).toHaveLength(1);
    const b = {
      ...data.buildings[0],
      rings,
      height: 12,
      elevation: 20,
      ground: undefined,
      tags: {},
    };
    const geometry = buildingGeometry(b);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(20.3);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(32.3);
    const shape = new THREE.ShapeGeometry(polygonShape(rings));
    const pos = shape.getAttribute("position"),
      idx = shape.index!;
    let area = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i));
      const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + 1));
      const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + 2));
      area += new THREE.Triangle(a, b, c).getArea();
    }
    expect(area).toBe(64);
    geometry.dispose();
    shape.dispose();
  });
  it("renders unknown heights as flat footprints without inventing a building height", () => {
    const geometry = buildingGeometry({
      ...data.buildings[0],
      height: null,
      heightStatus: "unknown",
      ground: undefined,
    });
    geometry.computeBoundingBox();
    expect(
      geometry.boundingBox!.max.y - geometry.boundingBox!.min.y,
    ).toBeCloseTo(0);
    geometry.dispose();
  });
  it("maps triangle boundary indices to the correct source feature", () => {
    const merged = makeBuildings({
      ...data,
      buildings: data.buildings.slice(0, 3),
    });
    expect(featureAtFace(merged.ranges, 0)?.id).toBe(data.buildings[0].id);
    expect(featureAtFace(merged.ranges, merged.ranges[0].end)?.id).toBe(
      data.buildings[1].id,
    );
    expect(featureAtFace(merged.ranges, merged.ranges[2].end)).toBeNull();
    expect(featureAtFace(merged.ranges, -1)).toBeNull();
    expect(merged.geometry.getAttribute("position").count / 3).toBe(
      merged.ranges[2].end,
    );
    merged.geometry.dispose();
  });
});

describe("milestone 2A source-aware rendering", () => {
  it("retains the exact original building heights, footprints, source IDs and coastline", () => {
    const baseline = JSON.parse(
      readFileSync(new URL("geography-baseline.json", import.meta.url), "utf8"),
    );
    const digest = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(
      digest(
        data.buildings.map((b) => [
          b.id,
          b.location,
          b.rings,
          b.height,
          b.heightStatus,
          b.tags,
        ]),
      ),
    ).toBe(baseline.buildingsSha256);
    expect(
      digest(
        data.roads.map((r) => [
          r.id,
          r.location,
          r.points.map(([x, , z]) => [x, z]),
          r.tags,
        ]),
      ),
    ).toBe(baseline.roadsSha256);
    expect(digest(data.coastline)).toBe(baseline.coastlineSha256);
    expect(digest(data.water.map((w) => w.rings))).toBe(
      baseline.waterOutlinesSha256,
    );
    let area = 0;
    const { positions: p, indices } = data.terrain;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map((j) => j * 3);
      area +=
        Math.abs(
          (p[b] - p[a]) * (p[c + 2] - p[a + 2]) -
            (p[b + 2] - p[a + 2]) * (p[c] - p[a]),
        ) / 2;
    }
    expect(Math.abs(area - baseline.landAreaSquareMetres)).toBeLessThan(
      baseline.landAreaSquareMetres * 0.0001,
    );
    const raw = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("../public/data/bergen-osm.json.gz", import.meta.url),
        ),
      ).toString(),
    );
    const source = new Map(
      raw.features.map(
        (f: { type: string; id: string; tags: Record<string, string> }) => [
          f.type + "/" + f.id,
          f.tags,
        ],
      ),
    );
    for (const b of data.buildings) {
      if (source.has(b.id)) expect(b.tags).toEqual(source.get(b.id));
      if (b.heightStatus === "osm-height")
        expect(b.height).toBe(metreTag(b.tags.height));
    }
    const terrainSource = JSON.parse(
      readFileSync(
        new URL("../public/data/terrain-source.json", import.meta.url),
        "utf8",
      ),
    );
    expect(terrainSource.licence).toBe("CC-BY-4.0");
    expect(terrainSource.projects.map((p: { id: number }) => p.id)).toEqual([
      6266, 6282,
    ]);
    expect(
      terrainSource.projects.every(
        (p: { verticalDatum: string; openExport: boolean }) =>
          p.openExport && p.verticalDatum === "NN2000 (EPSG:5941)",
      ),
    ).toBe(true);
    expect(data.provenance.refinement!.rasterSha256).toBe(
      terrainSource.raster.sha256,
    );
    const context = gunzipSync(
      readFileSync(
        new URL("../public/data/bergen-context-osm.json.gz", import.meta.url),
      ),
    );
    expect(createHash("sha256").update(context).digest("hex")).toBe(
      data.provenance.refinement!.contextSha256,
    );
  });
  it("uses barycentric rendered terrain heights, including negative bins and missing land", () => {
    const sample = terrainSampler({
      positions: [-10, 0, -10, 10, 20, -10, -10, 10, 10],
      indices: [0, 2, 1],
    });
    expect(sample(-5, -5)).toBeCloseTo(7.5);
    expect(sample(-10, -10)).toBe(0);
    expect(sample(20, 20)).toBeNull();
    expect(
      terrainSampler({
        positions: [0, 0, 0, 0, 1, 0, 0, 2, 0],
        indices: [0, 1, 2],
      })(0, 0),
    ).toBeNull();
  });
  it("fits both edges of a road to the rendered terrain and omits unresolved structures without losing source records", () => {
    const road = {
      ...data.roads[0],
      points: [
        [0, 0, 0],
        [10, 0, 0],
      ] as [number, number, number][],
      roadClass: "residential",
      tags: {},
    };
    const g = roadGeometry(road, (_x, z) => z * 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++)
      expect(p.getY(i)).toBeCloseTo(p.getZ(i) * 2 + 0.22, 4);
    g.dispose();
    const roads = makeRoads({
      ...data,
      roads: [
        { ...road, renderStatus: "unresolved-bridge" },
        { ...road, id: "way/2", renderStatus: "surface" },
      ],
    });
    expect(roads.ranges.map((r) => r.feature.id)).toEqual(["way/2"]);
    roads.geometry.dispose();
    expect(
      data.roads.filter((r) => r.renderStatus === "unresolved-bridge"),
    ).toHaveLength(88);
  });
  it("models a mapped gable within the reported total height and rejects unknown or unsupported roofs", () => {
    const b = {
      ...data.buildings[0],
      rings: [
        [
          [0, 0],
          [10, 0],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
      ] as Building["rings"],
      elevation: 0,
      ground: undefined,
      height: 14,
      heightStatus: "osm-height" as const,
      tags: { height: "14", "roof:height": "5", "roof:shape": "gabled" },
    };
    expect(gableProfile(b)?.height).toBe(5);
    const g = buildingGeometry(b);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(14.3);
    const p = g.getAttribute("position");
    const ridge = Array.from({ length: p.count }, (_, i) => [
      p.getX(i),
      p.getY(i),
    ]).filter((v) => Math.abs(v[1] - 14.3) < 0.001);
    expect(ridge.length).toBeGreaterThan(0);
    expect(ridge.every((v) => Math.abs(v[0] - 5) < 0.001)).toBe(true);
    g.dispose();
    // Front-face culling requires outward gable facades for either source-ring
    // winding; otherwise a roof face can vanish from a legitimate camera view.
    for (const ring of [b.rings[0], [...b.rings[0]].reverse()]) {
      const geometry = buildingGeometry({ ...b, rings: [ring] });
      const p = geometry.getAttribute("position"),
        n = geometry.getAttribute("normal");
      for (let i = 0; i < p.count; i++)
        if (Math.abs(n.getY(i)) < 0.001)
          expect(
            (p.getX(i) - 5) * n.getX(i) + (p.getZ(i) - 10) * n.getZ(i),
          ).toBeGreaterThanOrEqual(-0.001);
      geometry.dispose();
    }
    expect(
      gableProfile({ ...b, height: null, heightStatus: "unknown" }),
    ).toBeNull();
    expect(
      gableProfile({ ...b, tags: { ...b.tags, "roof:height": "unknown" } }),
    ).toBeNull();
    expect(
      gableProfile({ ...b, tags: { ...b.tags, "roof:shape": "hipped" } }),
    ).toBeNull();
    expect(gableProfile({ ...b, rings: [...b.rings, b.rings[0]] })).toBeNull();
    expect(metreTag("20 ft")).toBeNull();
  });
  it("grounds a known volume with a schematic skirt and drapes unknown footprints without assigning height", () => {
    const b = {
      ...data.buildings[0],
      rings: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ] as Building["rings"],
      elevation: 10,
      ground: [[0, 10, 10, 0, 0]],
      height: 12,
      tags: {},
    };
    const g = buildingGeometry(b);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0.05);
    expect(g.boundingBox!.max.y).toBeCloseTo(22.3);
    g.dispose();
    const flat = buildingGeometry(
      { ...b, height: null, heightStatus: "unknown" },
      (x) => x,
    );
    const p = flat.getAttribute("position");
    for (let i = 0; i < p.count; i++)
      expect(p.getY(i)).toBeCloseTo(p.getX(i) + 0.3, 4);
    flat.dispose();
  });
  it("merges water into one disposable geometry and produces finite complete city batches", () => {
    const water = makeWater(data);
    expect(water.getAttribute("position").count).toBeGreaterThan(6);
    water.dispose();
    const buildings = makeBuildings(data);
    expect(buildings.ranges).toHaveLength(data.buildings.length);
    expect(
      Array.from(buildings.geometry.getAttribute("position").array).every(
        Number.isFinite,
      ),
    ).toBe(true);
    expect(
      Array.from(buildings.geometry.getAttribute("normal").array).every(
        Number.isFinite,
      ),
    ).toBe(true);
    buildings.geometry.dispose();
  });
});
