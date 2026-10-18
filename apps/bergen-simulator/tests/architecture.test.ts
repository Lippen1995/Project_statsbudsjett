import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  catalogue,
  assetIds,
  assertAssetSnapshot,
  fallbackWithoutAssets,
  architecturalLod,
} from "../src/architecture/model";
import { checkedGlbJson } from "../src/architecture/load";
import { featureAtFace } from "../src/geo/geometry";
import type { CityData } from "../src/geo/types";
const raw = readFileSync("public/data/bergen.json");
const city: CityData = JSON.parse(raw.toString());
const glb = readFileSync("public" + catalogue.url);
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const hash = (raw: Uint8Array) =>
  createHash("sha256").update(raw).digest("hex");

describe("bounded, source-only architecture assets", () => {
  test("pinned source/asset hashes, licensed attribution and small GLB", () => {
    expect(hash(raw)).toBe(catalogue.snapshotSha256);
    expect(hash(glb)).toBe(catalogue.sha256);
    expect(glb.length).toBe(catalogue.bytes);
    expect(glb.length).toBeLessThan(250 * 1024);
    expect(assetIds.size).toBe(7);
    const notice = readFileSync("public/architecture/NOTICE.md", "utf8");
    for (const credit of [
      "Kartverket",
      "OpenStreetMap",
      "Kognos",
      "CC BY-SA 4.0",
      "3 October 2022",
    ])
      expect(notice).toContain(credit);
    const json = checkedGlbJson(bytes);
    expect(
      json.meshes
        .map((m: { extras: { sourceId: string } }) => m.extras.sourceId)
        .every((id: string) => assetIds.has(id)),
    ).toBe(true);
    expect(json.images[0].uri).toBeUndefined();
  });
  test("source compatibility fails closed without mutation", () => {
    const original = JSON.stringify(city);
    assertAssetSnapshot(city);
    const changed = structuredClone(city);
    changed.buildings.find((b) => assetIds.has(b.id))!.rings[0][0][0] += 0.1;
    expect(() => assertAssetSnapshot(changed)).toThrow(/mismatch/);
    changed.buildings = changed.buildings.filter((b) => !assetIds.has(b.id));
    expect(() => assertAssetSnapshot(changed)).toThrow(/mismatch/);
    expect(JSON.stringify(city)).toBe(original);
  });
  test("five bounded roof fits, two explicit rejections, no missing source height invented", () => {
    expect(catalogue.buildings.filter((b) => b.roof.accepted)).toHaveLength(5);
    expect(catalogue.buildings.filter((b) => !b.roof.accepted)).toHaveLength(2);
    for (const b of catalogue.buildings) {
      expect(b.roof.samples).toBeGreaterThan(200);
      expect(b.roof.ridgeNN2000).toBeGreaterThan(b.roof.eaveNN2000);
      if (b.roof.accepted) {
        expect(b.roof.inlierRmseM).toBeLessThanOrEqual(0.65);
        expect(b.roof.inlierFraction).toBeGreaterThanOrEqual(0.85);
        expect(b.roof.pitchDegrees).toBeGreaterThanOrEqual(10);
        expect(b.roof.pitchDegrees).toBeLessThanOrEqual(65);
      }
    }
  });
  test("fallback index preserves source buffers, source ID and face selection", () => {
    const features = city.buildings.slice(0, 4);
    const known = city.buildings.find((b) => assetIds.has(b.id))!;
    const all = [features[0], known, ...features.slice(1)];
    const source = {
      geometry: new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(new Float32Array(all.length * 9), 3),
      ),
      ranges: all.map((feature, i) => ({ end: i + 1, feature })),
    };
    const original = source.geometry.getAttribute("position").array.slice();
    const filtered = fallbackWithoutAssets(source);
    expect(source.geometry.index).toBeNull();
    expect(filtered.geometry.getAttribute("position")).toBe(
      source.geometry.getAttribute("position"),
    );
    expect(filtered.ranges).toHaveLength(4);
    for (let i = 0; i < 4; i++)
      expect(featureAtFace(filtered.ranges, i)).toBe(features[i]);
    expect([...filtered.geometry.index!.array]).toEqual([
      0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(source.geometry.getAttribute("position").array).toEqual(original);
    filtered.geometry.dispose();
    source.geometry.dispose();
  });
  test("LOD hysteresis, low power and malformed envelopes", () => {
    expect(architecturalLod(599, false, true)).toBe(true);
    expect(architecturalLod(601, false, true)).toBe(false);
    expect(architecturalLod(749, true, true)).toBe(true);
    for (const d of [750, Infinity, NaN, -1])
      expect(architecturalLod(d, true, true)).toBe(false);
    expect(architecturalLod(1, true, false)).toBe(false);
    for (const size of [0, 12, 99])
      expect(() => checkedGlbJson(new ArrayBuffer(size))).toThrow();
    const bad = bytes.slice(0);
    new DataView(bad).setUint32(0, 0, true);
    expect(() => checkedGlbJson(bad)).toThrow();
  });
});
