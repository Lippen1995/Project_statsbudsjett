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
  polygonShape,
} from "../src/geo/geometry";

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
    const b = { ...data.buildings[0], rings, height: 12, elevation: 20 };
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
