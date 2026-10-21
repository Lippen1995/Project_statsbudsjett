import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { CityData } from "../src/geo/types";
import { featureAtFace } from "../src/geo/geometry";
import { assetIds } from "../src/architecture/model";
import {
  assertEnhancementSnapshot,
  catalogue,
  enhancementIds,
  withoutEnhancements,
} from "../src/enhancements/model";
import {
  checkedEnhancementGlb,
  loadEnhancements,
} from "../src/enhancements/load";
import { useEnhancements } from "../src/enhancements/state";

const raw = readFileSync("public/data/bergen.json");
const city: CityData = JSON.parse(raw.toString());
const source = readFileSync("public" + catalogue.url);
const bytes = () =>
  source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("R1E reversible public-geodata pilot", () => {
  test("pinned observations, original IDs and existing architectural priority", () => {
    expect(sha(raw)).toBe(catalogue.snapshotSha256);
    expect(sha(source)).toBe(catalogue.sha256);
    expect(source.length).toBe(catalogue.bytes);
    expect(enhancementIds.size).toBe(6);
    for (const b of catalogue.buildings) {
      expect(assetIds.has(b.id)).toBe(false);
      expect(b.truthClass).toBe("SOURCE_DERIVED_ESTIMATE");
      expect(b.roof.holdoutRmseM).toBeLessThanOrEqual(0.65);
      expect(b.roof.within065m).toBeGreaterThanOrEqual(0.85);
      expect(b.sourceHeight).toBeNull();
    }
    for (const [path, hash] of Object.entries(catalogue.inputHashes))
      expect(sha(readFileSync(path))).toBe(hash);
    expect(readFileSync("public/enhancements/NOTICE.md", "utf8")).toContain(
      "not a building survey",
    );
  });
  test("geographic source changes fail closed and never mutate source", () => {
    const before = JSON.stringify(city);
    assertEnhancementSnapshot(city);
    const changed = structuredClone(city);
    changed.buildings.find((b) => enhancementIds.has(b.id))!.rings[0][0][0] +=
      0.01;
    expect(() => assertEnhancementSnapshot(changed)).toThrow(/mismatch/);
    const groundChanged = structuredClone(city);
    const ground = groundChanged.buildings.find((b) => enhancementIds.has(b.id))!
      .ground;
    if (!ground) throw new Error("Pinned pilot building must retain source ground");
    ground[0][0] += 0.1;
    expect(() => assertEnhancementSnapshot(groundChanged)).toThrow(/mismatch/);
    const missing = {
      ...city,
      buildings: city.buildings.filter((b) => !enhancementIds.has(b.id)),
    };
    expect(() => assertEnhancementSnapshot(missing)).toThrow(/mismatch/);
    expect(JSON.stringify(city)).toBe(before);
  });
  test.each([false, true])(
    "index-only filtering and original picking, indexed=%s",
    (indexed) => {
      const features = [
        city.buildings[0],
        city.buildings.find((b) => enhancementIds.has(b.id))!,
        city.buildings[2],
      ];
      const geometry = new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(new Float32Array(27), 3),
      );
      if (indexed) geometry.setIndex([6, 7, 8, 3, 4, 5, 0, 1, 2]);
      const indices = geometry.index?.array.slice();
      const filtered = withoutEnhancements({
        geometry,
        ranges: features.map((feature, i) => ({ feature, end: i + 1 })),
      });
      expect(filtered.geometry.getAttribute("position")).toBe(
        geometry.getAttribute("position"),
      );
      expect(filtered.geometry.index!.count).toBe(6);
      expect(featureAtFace(filtered.ranges, 0)).toBe(features[0]);
      expect(featureAtFace(filtered.ranges, 1)).toBe(features[2]);
      expect(geometry.index?.array).toEqual(indices);
      filtered.geometry.dispose();
      geometry.dispose();
    },
  );
  test("GLB allows only bounded, embedded immutable geometry", () => {
    const json = checkedEnhancementGlb(bytes());
    expect(json.images).toBeUndefined();
    expect(json.textures).toBeUndefined();
    expect(json.meshes).toHaveLength(6);
    expect(
      catalogue.buildings.reduce((sum, b) => sum + b.triangles, 0),
    ).toBeLessThanOrEqual(2500);
    const corrupt = bytes();
    new DataView(corrupt).setUint32(0, 0);
    expect(() => checkedEnhancementGlb(corrupt)).toThrow();
    expect(() => checkedEnhancementGlb(bytes().slice(0, 30))).toThrow();
    const changed = new TextDecoder()
      .decode(
        new Uint8Array(bytes(), 20, new DataView(bytes()).getUint32(12, true)),
      )
      .replace('"componentType":5126', '"componentType":5125');
    const invalid = bytes();
    new Uint8Array(invalid, 20, changed.length).set(
      new TextEncoder().encode(changed),
    );
    expect(() => checkedEnhancementGlb(invalid)).toThrow(/buffer bounds/);
  });
  test("load, source picking and disposal without copying or modifying source", async () => {
    const before = JSON.stringify(city);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes())),
    );
    const tile = await loadEnhancements(city, new AbortController().signal);
    expect(tile.ranges).toHaveLength(6);
    expect(tile.geometry.getAttribute("position").count / 3).toBe(162);
    expect(featureAtFace(tile.ranges, 0)).toBe(
      city.buildings.find((b) => b.id === catalogue.buildings[0].id),
    );
    const dispose = vi.fn();
    tile.geometry.addEventListener("dispose", dispose);
    tile.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(JSON.stringify(city)).toBe(before);
  });
  test("missing, corrupt and aborted loads cannot promote a partial asset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Missing", { status: 404 })),
    );
    await expect(
      loadEnhancements(city, new AbortController().signal),
    ).rejects.toThrow(/unavailable/);
    const corrupt = bytes();
    new Uint8Array(corrupt)[corrupt.byteLength - 1] ^= 1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corrupt)),
    );
    await expect(
      loadEnhancements(city, new AbortController().signal),
    ).rejects.toThrow(/integrity/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes())),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(loadEnhancements(city, controller.signal)).rejects.toThrow();
  });
  test("pilot is opt-in and never adds persisted scenario state", () => {
    expect(useEnhancements.getState().enabled).toBe(false);
    useEnhancements.getState().setEnabled(true);
    expect(useEnhancements.getState().enabled).toBe(true);
    useEnhancements.getState().setEnabled(false);
    expect(Object.keys(useEnhancements.getState()).sort()).toEqual([
      "enabled",
      "setEnabled",
      "status",
    ]);
  });
});
