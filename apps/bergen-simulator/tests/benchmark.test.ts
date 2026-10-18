import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  inHeroBlock,
  sourceSwatch,
  inspectionCamera,
  BENCHMARK_VIEWS,
  heroShadow,
} from "../src/geo/benchmark";
import {
  buildingGeometry,
  buildingPalette,
  makeRoofEdges,
  makeBuildings,
  featureAtFace,
} from "../src/geo/geometry";
import { gableProfile } from "../src/geo/roofs";
import { parseCityData } from "../src/geo/types";
const city = parseCityData(
  JSON.parse(readFileSync("public/data/bergen.json", "utf8")),
);
const pilot = city.buildings.filter(inHeroBlock);
it("keeps the benchmark inside the pinned block and never promotes unknown heights", () => {
  expect(pilot.length).toBeGreaterThan(20);
  expect(pilot.filter((b) => gableProfile(b))).toHaveLength(13);
  for (const b of pilot) {
    const g = buildingGeometry(b);
    g.computeBoundingBox();
    if (b.height === null)
      expect(g.boundingBox!.max.y).toBeLessThanOrEqual(b.elevation + 0.31);
    else
      expect(g.boundingBox!.max.y).toBeCloseTo(b.elevation + b.height + 0.3, 3);
    g.dispose();
  }
  const b = pilot[0];
  expect(
    inHeroBlock({
      ...b,
      rings: [
        ...b.rings,
        [
          [1000, 1000],
          [1001, 1000],
          [1001, 1001],
          [1000, 1000],
        ],
      ],
    }),
  ).toBe(false);
});
it("accepts bounded source colour interpretations without accepting CSS or assuming unknown material", () => {
  expect(sourceSwatch("#ABC123")).toBe("#abc123");
  expect(sourceSwatch("darkgreen")).toBe("#31554b");
  for (const s of [
    undefined,
    "url(https://example.com)",
    "var(--colour)",
    "#abcd",
    "unknown",
    "wood",
  ])
    expect(sourceSwatch(s)).toBeNull();
  const shed = city.buildings.find((b) => b.id === "way/393025479")!;
  expect(buildingPalette(shed).wall).toBe("#31554b");
  expect(shed.tags["building:colour"]).toBe("darkgreen");
});
it("derives only actual supported roof perimeter/ridge coordinates in one bounded accent batch", () => {
  const before = JSON.stringify(city),
    g = makeRoofEdges(city),
    p = g.getAttribute("position");
  expect(p.count).toBeGreaterThan(0);
  expect(p.count).toBeLessThan(4000);
  expect(p.count % 2).toBe(0);
  for (let i = 0; i < p.count; i++) {
    const matches = pilot.filter((b) => {
      const roof = gableProfile(b);
      if (!roof) return false;
      const x = p.getX(i),
        z = p.getZ(i),
        xs = roof.ring.map((p) => p[0]),
        zs = roof.ring.map((p) => p[1]);
      return (
        x >= Math.min(...xs) - 0.001 &&
        x <= Math.max(...xs) + 0.001 &&
        z >= Math.min(...zs) - 0.001 &&
        z <= Math.max(...zs) + 0.001 &&
        Math.abs(
          p.getY(i) -
            (b.elevation + 0.3 + b.height! - roof.height + roof.rise([x, z])),
        ) < 0.001
      );
    });
    expect(matches.length).toBeGreaterThan(0);
  }
  expect(JSON.stringify(city)).toBe(before);
  g.dispose();
  const empty = makeRoofEdges({
    ...city,
    buildings: pilot.filter((b) => b.height === null),
  });
  expect(empty.getAttribute("position").count).toBe(0);
  empty.dispose();
});
it("retains byte-identical source building positions/normals, source picking and source records", () => {
  const before = JSON.stringify(city),
    batch = makeBuildings(city),
    baseline = JSON.parse(
      readFileSync("tests/r1-source-baseline.json", "utf8"),
    );
  for (const name of ["position", "normal"]) {
    const a = batch.geometry.getAttribute(name).array;
    expect(
      createHash("sha256")
        .update(Buffer.from(a.buffer, a.byteOffset, a.byteLength))
        .digest("hex"),
    ).toBe(baseline.attributes[name]);
  }
  for (let i = 0; i < batch.ranges.length; i++) {
    const start = i ? batch.ranges[i - 1].end : 0,
      end = batch.ranges[i].end;
    if (start < end) {
      expect(featureAtFace(batch.ranges, start)?.id).toBe(city.buildings[i].id);
      expect(featureAtFace(batch.ranges, end - 1)?.id).toBe(
        city.buildings[i].id,
      );
    }
  }
  expect(JSON.stringify(city)).toBe(before);
  batch.geometry.dispose();
}, 30000);
it("keeps reproducible cameras and frames small objects without changing geographic positions", () => {
  const views = JSON.parse(readFileSync("tests/quality-views.json", "utf8"));
  for (const v of BENCHMARK_VIEWS) {
    const fixture = views.find((r: { name: string }) => r.name === v.id);
    expect(fixture.position).toEqual(v.position);
    expect(fixture.target).toEqual(v.target);
  }
  const b = pilot.find((b) => b.heightStatus === "osm-height")!,
    pose = inspectionCamera(b, city);
  expect(pose.target[0]).toBe(b.center[0]);
  expect(pose.target[2]).toBe(b.center[1]);
  expect(pose.target[1]).toBeCloseTo(b.elevation + b.height! * 0.4);
  expect(
    Math.hypot(...pose.position.map((v, i) => v - pose.target[i])),
  ).toBeLessThan(300);
  expect(heroShadow({ x: 1050, y: 1950, z: 2150 })).toBe(false);
  expect(heroShadow({ x: -145, y: 85, z: -45 })).toBe(true);
  expect(
    heroShadow({ x: -372.02, y: 600, z: -6.08 }, { x: -450, y: -600, z: -760 }),
  ).toBe(false);
  expect(
    heroShadow(
      { x: -428.02, y: 301.42, z: 229.24 },
      { x: 430, y: -300, z: -500 },
    ),
  ).toBe(true);
  expect(heroShadow({ x: NaN, y: 0, z: 0 })).toBe(false);
});
