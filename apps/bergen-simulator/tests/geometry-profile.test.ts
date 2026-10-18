import { test, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  makeBuildings,
  makeTerrain,
  makeRoads,
  makeWater,
  makeCoastalEdge,
  makeRoofEdges,
} from "../src/geo/geometry";
import { terrainSampler } from "../src/geo/surface";
import { parseCityData } from "../src/geo/types";
import type { BufferGeometry } from "three";

test("profile pinned geometry with reproducible attribute hashes and bounded disposal", () => {
  const stages: Record<string, number> = {};
  const measure = <T>(name: string, run: () => T): T => {
    const start = performance.now();
    const result = run();
    stages[name] = performance.now() - start;
    return result;
  };
  const data = measure("geography.parse-validate", () =>
    parseCityData(JSON.parse(readFileSync("public/data/bergen.json", "utf8"))),
  );
  const sample = measure("terrain.index", () => terrainSampler(data.terrain));
  let samples = 0,
    missingSamples = 0;
  const counted = (x: number, z: number) => {
    samples++;
    const y = sample(x, z);
    if (y === null) missingSamples++;
    return y;
  };
  const buildings = measure("geometry.buildings", () =>
    makeBuildings(data, counted),
  );
  const roads = measure("geometry.roads", () => makeRoads(data, sample));
  const terrain = measure("geometry.terrain", () => makeTerrain(data));
  const water = measure("geometry.water", () => makeWater(data));
  const coast = measure("geometry.coast", () => makeCoastalEdge(data));
  const roofEdges = measure("geometry.roof-edges", () => makeRoofEdges(data));
  const hash = (g: BufferGeometry) => {
    const h = createHash("sha256");
    let bytes = 0;
    for (const [name, attribute] of Object.entries(g.attributes).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const a = attribute.array;
      h.update(name);
      h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      bytes += a.byteLength;
    }
    if (g.index) {
      const a = g.index.array;
      h.update("index");
      h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      bytes += a.byteLength;
    }
    return {
      sha256: h.digest("hex"),
      bytes,
      vertices: g.getAttribute("position").count,
    };
  };
  const geometry = Object.fromEntries(
    Object.entries({
      buildings: buildings.geometry,
      roads: roads.geometry,
      terrain,
      water,
      coast,
      roofEdges,
    }).map(([k, g]) => [k, hash(g)]),
  );
  const baseline = JSON.parse(
    readFileSync("tests/geometry-baseline-r1.json", "utf8"),
  );
  expect(geometry).toEqual(baseline.geometry);
  expect(samples).toBe(baseline.samples);
  expect(missingSamples).toBe(baseline.missingSamples);
  expect(buildings.ranges).toHaveLength(data.buildings.length);
  expect(samples).toBeGreaterThan(1000);
  for (const g of [
    buildings.geometry,
    roads.geometry,
    terrain,
    water,
    coast,
    roofEdges,
  ])
    g.dispose();
  if (process.env.BERGEN_PROFILE) {
    const dir = "artifacts/milestone-5c/" + process.env.BERGEN_PROFILE;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      dir + "/geometry-profile.json",
      JSON.stringify(
        {
          stages,
          geometry,
          samples,
          missingSamples,
          note: "Node CPU diagnostic, not browser/GPU performance. R1 attribute hashes pinned; source positions/normals independently pinned to 7243b535.",
        },
        null,
        2,
      ) + "\n",
    );
  }
}, 30000);
