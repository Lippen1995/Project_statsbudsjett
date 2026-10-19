import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  LANDMARK_ID,
  LANDMARK_VIEWS,
  clearInspectionPosition,
  landmarkDetailLod,
} from "../src/architecture/inspection";
import { catalogue } from "../src/architecture/model";
import { useCity } from "../src/state/store";
import type { CityData, Point3 } from "../src/geo/types";
const city: CityData = JSON.parse(
  readFileSync("public/data/bergen.json", "utf8"),
);
const building = city.buildings.find((b) => b.id === LANDMARK_ID)!;

describe("R1C source-only landmark", () => {
  test("versioned recipe, explicit evidence, geometry and transfer bounds", () => {
    const raw = readFileSync(catalogue.reconstruction.contract);
    const recipe = JSON.parse(raw.toString());
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      catalogue.reconstruction.sha256,
    );
    expect(recipe.sourceId).toBe(LANDMARK_ID);
    expect(recipe.version).toBe(1);
    expect(recipe.features.doors).toHaveLength(6);
    expect(recipe.features.piers).toHaveLength(6);
    expect(
      recipe.features.doors.some((d: { face: string }) => d.face === "nw"),
    ).toBe(false);
    expect(catalogue.reconstruction.highTriangles).toBeLessThanOrEqual(4000);
    expect(catalogue.bytes).toBeLessThan(1024 * 1024);
    expect(recipe.limitations.join(" ")).toMatch(/not survey|not calibrated/);
  });
  test("clearance stays above terrain and outside landmark without changing geography", () => {
    const before = JSON.stringify(city);
    const p = clearInspectionPosition(
      [building.center[0], 0, building.center[1]],
      2,
      [building],
    );
    expect(p[1]).toBeGreaterThanOrEqual(3.1);
    expect(
      Math.hypot(p[0] - building.center[0], p[2] - building.center[1]),
    ).toBeGreaterThan(5);
    expect(clearInspectionPosition(p, 2, [building])).toEqual(p);
    expect(JSON.stringify(city)).toBe(before);
  });
  test("source-supported exterior inspection views and LOD hysteresis", () => {
    for (const view of LANDMARK_VIEWS) {
      const p = [...view.position] as Point3;
      expect(clearInspectionPosition(p, 1.9, [building])).toEqual(p);
    }
    expect(landmarkDetailLod(99, false)).toBe(true);
    expect(landmarkDetailLod(101, false)).toBe(false);
    expect(landmarkDetailLod(129, true)).toBe(true);
    expect(landmarkDetailLod(38, false, 0.39)).toBe(true);
    expect(landmarkDetailLod(41, false, 0.39)).toBe(false);
    expect(landmarkDetailLod(50, true, 0.39)).toBe(true);
    expect(landmarkDetailLod(51, true, 0.39)).toBe(false);
    expect(landmarkDetailLod(1, false, 0)).toBe(false);
    for (const d of [130, -1, Infinity, NaN])
      expect(landmarkDetailLod(d, true)).toBe(false);
  });
  test("inspection does not touch scenario persistence; overview restores navigation", () => {
    const original = JSON.stringify(city);
    useCity.getState().inspectLandmark("capital", true);
    expect(useCity.getState().camera.landmark).toBe("capital");
    useCity.getState().focus(null);
    expect(useCity.getState().camera.landmark).toBeUndefined();
    expect(JSON.stringify(city)).toBe(original);
  });
});

/** R1C may enrich Skur without quietly altering R1B's six neighboring assets. */
test("R1B neighboring geometry and photographic atlas remain byte-identical", () => {
  function unpack(raw: Buffer) {
    const length = raw.readUInt32LE(12);
    const json = JSON.parse(raw.subarray(20, 20 + length).toString());
    const start = 28 + length;
    const view = (i: number) => {
      const v = json.bufferViews[i];
      return raw.subarray(
        start + (v.byteOffset ?? 0),
        start + (v.byteOffset ?? 0) + v.byteLength,
      );
    };
    return { json, view };
  }
  const original = unpack(
    readFileSync("public/architecture/bryggen-e3dcf1e48192914c.glb"),
  );
  const current = unpack(readFileSync("public" + catalogue.url));
  for (const mesh of original.json.meshes) {
    if (mesh.extras.sourceId === LANDMARK_ID) continue;
    const replacement = current.json.meshes.find(
      (m: { name: string }) => m.name === mesh.name,
    );
    expect(replacement).toBeDefined();
    for (const [name, index] of Object.entries(mesh.primitives[0].attributes)) {
      const old = original.json.accessors[index as number];
      const next =
        current.json.accessors[replacement.primitives[0].attributes[name]];
      expect(current.view(next.bufferView)).toEqual(
        original.view(old.bufferView),
      );
    }
  }
  expect(current.view(current.json.images[0].bufferView)).toEqual(
    original.view(original.json.images[0].bufferView),
  );
});
