import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  placementContext,
  emptyPhysical,
  validatePhysical,
} from "../src/physical/model";
import { buildNetwork } from "../src/simulation/network";
import {
  buildingPlacement,
  validateBuilding,
  footprint,
  buildingHeight,
  validateDevelopment,
  emptyDevelopment,
  quarterChallenge,
  developmentMetrics,
  type BuildingProposal,
} from "../src/physical/buildings";
import { area } from "../src/physical/polygon";
import { developmentGeometry } from "../src/geo/development";
import { terrainSampler } from "../src/geo/surface";
import {
  scenarioFile,
  parseScenario,
  readLibrary,
  writeLibrary,
  STORAGE_KEY,
} from "../src/planning/scenarios";
import { useScenario } from "../src/state/scenario";
import { useConstruction } from "../src/state/construction";
import { emptyPlan } from "../src/simulation/interventions";
import { TrafficSimulation, TOTAL_TICKS } from "../src/simulation/engine";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const data = read("../public/data/bergen.json"),
  source = read("../public/data/bryggen-transport.json"),
  network = buildNetwork(source),
  context = placementContext(data, network);
const example = read("../public/plans/urban-quarter-example.json"),
  buildings: BuildingProposal[] = example.development.proposals,
  physical = example.physical,
  b = buildings[0],
  development = example.development;
function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
afterEach(() => {
  useScenario.getState().close();
  useConstruction.getState().clear();
});
it("proves three separate real-snapshot sites and a complete achievable quarter with public space", () => {
  validatePhysical(physical, context);
  for (const b of buildings) {
    const c = buildingPlacement(b, context, physical, buildings);
    expect(c.errors).toEqual([]);
    expect(c.valid).toBe(true);
    expect(c.accessDistance).toBeGreaterThanOrEqual(6);
  }
  expect(validateDevelopment(development, context, physical)).toEqual(
    development,
  );
  expect(quarterChallenge(development, physical, context).passed).toBe(true);
  expect(parseScenario(JSON.stringify(example), network, context)).toEqual(
    example,
  );
});
it.each([
  { width: 5.99 },
  { depth: 7.99 },
  { width: 30.01 },
  { depth: 30.01 },
  { width: 30, depth: 30 },
  { storeys: 0 },
  { storeys: 6.1 },
  { storeys: 7 },
  { storeyHeight: 2.79 },
  { storeyHeight: 4.01 },
  { rotation: -1 },
  { rotation: 360 },
  { width: Infinity },
  { center: [NaN, 0] },
  { center: [1e100, 0] },
  { roof: "script" },
  { purpose: "housing-price" },
  { mesh: [] },
  { valid: true },
  { height: 12 },
  { version: 99 },
])(
  "rejects unbounded, contradictory or trusted imported building parameters: %j",
  (patch) => expect(() => validateBuilding({ ...b, ...patch })).toThrow(),
);
it("enforces exact inclusive numeric bounds and rotates horizontal dimensions without distorting area", () => {
  for (const patch of [
    { width: 6, depth: 8 },
    { width: 20, depth: 30 },
    { storeys: 6, storeyHeight: 4, roof: "gabled" as const },
    { rotation: 359.99 },
  ])
    expect(() => validateBuilding({ ...b, ...patch })).not.toThrow();
  for (const rotation of [0, 15, 90, 179, 270, 359.9])
    expect(area(footprint({ ...b, rotation }))).toBeCloseTo(192, 8);
  expect(buildingHeight({ ...b, storeys: 6, storeyHeight: 4 })).toBe(26);
});
it("rejects actual observed buildings, coast/water, missing coverage and out-of-window placement", () => {
  const observed = context.buildings.find((o) => area(o.rings[0]) > 150)!;
  const center = observed.rings[0].reduce(
    (p, q) => [
      p[0] + q[0] / observed.rings[0].length,
      p[1] + q[1] / observed.rings[0].length,
    ],
    [0, 0],
  ) as [number, number];
  expect(
    buildingPlacement({ ...b, center }, context, null).errors.join(),
  ).toContain("Observed building");
  for (const center of [
    [-140, -160],
    [180, -200],
    [-5000, -200],
  ] as [number, number][])
    expect(buildingPlacement({ ...b, center }, context, null).valid).toBe(
      false,
    );
  const flooded = { ...context, water: [[footprint(b)]] };
  expect(buildingPlacement(b, flooded, null).errors.join()).toContain(
    "inland water",
  );
  const coast = {
    ...context,
    coastline: [
      [
        [-110, -317],
        [-80, -317],
      ],
    ] as [number, number][][],
  };
  expect(buildingPlacement(b, coast, null).errors.join()).toContain(
    "coastline",
  );
  expect(
    buildingPlacement(b, { ...context, triangles: [] }, null).errors.join(),
  ).toContain("entire footprint");
});
it("tests building grade and relief boundaries without changing source terrain", () => {
  const ctx = structuredClone(context);
  ctx.triangles = ctx.triangles.map((t) => ({ ...t, grade: 0.1 }));
  expect(buildingPlacement(b, ctx, null).valid).toBe(true);
  ctx.triangles.forEach((t) => (t.grade = 0.10001));
  expect(buildingPlacement(b, ctx, null).errors.join()).toContain("10%");
  ctx.triangles = context.triangles.map((t) => ({
    ...t,
    grade: 0,
    xyz: t.xyz.map(([x, , z]) => [x, (x + 101) * 0.125, z]),
  }));
  expect(buildingPlacement(b, ctx, null).relief).toBeCloseTo(1.5);
  expect(buildingPlacement(b, ctx, null).valid).toBe(true);
  ctx.triangles = context.triangles.map((t) => ({
    ...t,
    grade: 0,
    xyz: t.xyz.map(([x, , z]) => [x, (x + 101) * 0.126, z]),
  }));
  expect(buildingPlacement(b, ctx, null).errors.join()).toContain("relief");
});
it("enforces protected modelled road clearance and rejects touching or containing proposed geometry", () => {
  const edge = network.edges[0],
    q = edge.points[0];
  expect(
    buildingPlacement({ ...b, center: q }, context, null).errors.join(),
  ).toContain("Protected modelled road");
  for (const dx of [0, 12, 12.99])
    expect(
      buildingPlacement(
        { ...b, id: "other", center: [b.center[0] + dx, b.center[1]] },
        context,
        null,
        [b],
      ).errors.join(),
    ).toContain("Proposed building");
  const p = {
    ...emptyPhysical(context),
    proposals: [
      {
        id: "over",
        name: "Overlap",
        kind: "pedestrian" as const,
        vertices: footprint(b),
      },
    ],
  };
  expect(buildingPlacement(b, context, p).errors.join()).toContain(
    "public space",
  );
});
it.each([
  { geographyId: "wrong" },
  { version: 2 },
  { proposals: Array(9).fill(b) },
  { proposals: [b, b] },
  { valid: true },
])(
  "rejects incompatible or oversized building contracts atomically: %j",
  (patch) =>
    expect(() =>
      validateDevelopment({ ...development, ...patch }, context, physical),
    ).toThrow(),
);
it("derives deterministic quantities without population, economic or demand claims", () => {
  const m = developmentMetrics(development, physical);
  expect(m).toEqual(
    developmentMetrics(structuredClone(development), structuredClone(physical)),
  );
  expect(m.count).toBe(3);
  expect(m.footprintM2).toBe(576);
  expect(m.grossFloorM2).toBe(1344);
  expect(m.publicSpaceM2).toBeCloseTo(189);
  expect(m.uses).toEqual({ residential: 384, commercial: 576, civic: 384 });
  expect(m.storeys).toEqual({ 2: 2, 3: 1 });
  expect(m.conceptualVolumeM3).toBeCloseTo(1344 * 3.2 + 192);
  expect(m.maxHeightM).toBeCloseTo(9.6);
});
it("rejects challenge volume, size, access and invalid-placement exploits", () => {
  for (const d of [
    { ...development, proposals: [] },
    { ...development, proposals: buildings.map((b) => ({ ...b, storeys: 6 })) },
    {
      ...development,
      proposals: buildings.map((b) => ({ ...b, purpose: "civic" as const })),
    },
    {
      ...development,
      proposals: buildings.map((b) => ({
        ...b,
        center: [0, 0] as [number, number],
      })),
    },
  ])
    expect(quarterChallenge(d, physical, context).passed).toBe(false);
  expect(
    quarterChallenge(development, emptyPhysical(context), context).passed,
  ).toBe(false);
  expect(
    quarterChallenge(development, physical, {
      ...context,
      network: { edges: [], nodeIds: [] },
    }).passed,
  ).toBe(false);
});
it("never mutates geographic snapshots and owns imported parameters", () => {
  const frozen = freeze(structuredClone(data)),
    n = freeze(structuredClone(network)),
    ctx = placementContext(frozen, n),
    before = JSON.stringify([frozen, n]);
  const d = validateDevelopment(
    freeze(structuredClone(development)),
    ctx,
    freeze(structuredClone(physical)),
  );
  d.proposals[0].center[0] = 999;
  expect(b.center[0]).toBe(-95);
  expect(JSON.stringify([frozen, n])).toBe(before);
});
it("reads 3B/4A files without rewriting storage and reconstructs absent construction as empty", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  for (const file of ["rethinking-example.json", "waterfront-example.json"]) {
    const old = read(`../public/plans/${file}`),
      record = { id: "legacy", savedAt: "2026-10-17T00:00:00Z", scenario: old },
      raw = JSON.stringify({ version: 1, plans: [record] });
    storage.setItem(STORAGE_KEY, raw);
    s.loadLibrary(storage);
    s.reopen(record.id);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(useScenario.getState().development?.proposals).toEqual([]);
    expect(useScenario.getState().plan).toEqual(old.plan);
    expect(s.importPlan(JSON.stringify(old))).toBe(true);
  }
});
it("saves, duplicates, reloads and exports combined V3 geometry with strict revalidation", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  expect(s.importPlan(JSON.stringify(example))).toBe(true);
  expect(s.save(storage)).toBe(true);
  const id = useScenario.getState().currentId!;
  expect(s.save(storage, true)).toBe(true);
  s.close();
  s.open(source, data);
  s.loadLibrary(storage);
  s.reopen(id);
  expect(useScenario.getState().development).toEqual(development);
  expect(readLibrary(storage, network, context).plans).toHaveLength(2);
  const current = useScenario.getState();
  expect(
    scenarioFile(
      current.name,
      current.plan!,
      network,
      context,
      current.physical,
      current.development,
    ),
  ).toEqual(example);
});
it("invalid last-building imports and cross-layer collisions preserve the active city and local bytes", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  s.importPlan(JSON.stringify(example));
  s.save(storage);
  const raw = storage.getItem(STORAGE_KEY),
    before = JSON.stringify([
      useScenario.getState().plan,
      useScenario.getState().physical,
      useScenario.getState().development,
    ]);
  const bad = structuredClone(example);
  bad.development.proposals[2].center = [-140, -160];
  expect(s.importPlan(JSON.stringify(bad))).toBe(false);
  expect(
    JSON.stringify([
      useScenario.getState().plan,
      useScenario.getState().physical,
      useScenario.getState().development,
    ]),
  ).toBe(before);
  const lib = readLibrary(storage, network, context);
  lib.plans[0].scenario = bad;
  expect(() => writeLibrary(storage, lib, network, context)).toThrow();
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  expect(
    s.putSpace({
      id: "collision",
      name: "No demolition",
      kind: "pedestrian",
      vertices: footprint(b),
    }),
  ).toBe(false);
  const duplicate = structuredClone(example);
  duplicate.development.proposals[0].id = duplicate.physical.proposals[0].id;
  expect(s.importPlan(JSON.stringify(duplicate))).toBe(false);
});
it("shares bounded undo/redo across traffic, space and construction and preserves traffic on building edits", () => {
  const s = useScenario.getState();
  s.open(source, data);
  s.putSpace(physical.proposals[0]);
  s.putBuilding(b);
  s.edit(example.plan.interventions[0]);
  s.undo();
  expect(useScenario.getState().development?.proposals).toHaveLength(1);
  s.undo();
  expect(useScenario.getState().development?.proposals).toHaveLength(0);
  expect(useScenario.getState().physical?.proposals).toHaveLength(1);
  s.redo();
  expect(useScenario.getState().development?.proposals).toHaveLength(1);
  const sim = new TrafficSimulation(network, emptyPlan(network));
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const result = sim.snapshot();
  useScenario.setState({
    phase: "complete",
    baseline: result,
    intervention: result,
  });
  s.putBuilding({ ...b, purpose: "civic" });
  expect(useScenario.getState().intervention).toEqual(result);
  expect(useScenario.getState().phase).toBe("complete");
  expect(useScenario.getState().plan).toEqual(emptyPlan(network));
  for (let i = 0; i < 75; i++)
    s.putBuilding({ ...b, purpose: i % 2 ? "civic" : "commercial" });
  expect(useScenario.getState().history).toHaveLength(51);
  s.clearBuildings();
  expect(useScenario.getState().development?.proposals).toHaveLength(0);
  s.undo();
  expect(useScenario.getState().development?.proposals).toHaveLength(1);
  s.reset();
  expect(useScenario.getState().development).toEqual(emptyDevelopment(context));
});
it("keeps pointer/numeric construction drafts reversible and independent of confirmed data", () => {
  const s = useScenario.getState(),
    c = useConstruction.getState();
  s.open(source, data);
  c.start("residential");
  c.locate(b.center);
  c.patch({ ...b, id: useConstruction.getState().draft!.id });
  c.confirm();
  c.edit();
  const original = structuredClone(useScenario.getState().development);
  c.patch({ purpose: "commercial", rotation: 90 });
  c.undo();
  expect(useConstruction.getState().draft?.purpose).toBe("residential");
  c.redo();
  expect(useConstruction.getState().draft?.purpose).toBe("commercial");
  c.cancel();
  expect(useScenario.getState().development).toEqual(original);
  c.start("civic");
  for (let i = 0; i < 90; i++) c.patch({ rotation: i });
  expect(useConstruction.getState().past).toHaveLength(51);
});
it("bounds merged geometry and repeated rebuilds; invalid mesh parameters allocate no triangles", () => {
  const surface = terrainSampler(data.terrain),
    start = performance.now();
  let tris = 0;
  for (let i = 0; i < 100; i++) {
    const g = developmentGeometry(
      buildings.map((b) => ({
        building: b,
        baseY: buildingPlacement(b, context, physical, buildings).baseY,
      })),
      surface,
    );
    tris = g.body.getAttribute("position").count / 3;
    expect(g.ranges).toHaveLength(3);
    expect(tris).toBeLessThan(300);
    expect(g.edges.getAttribute("position").count / 2).toBeLessThan(50);
    g.body.dispose();
    g.edges.dispose();
  }
  const g = developmentGeometry(
    [{ building: { ...b, width: 1e100 }, baseY: 0 }],
    surface,
  );
  expect(g.body.getAttribute("position").count).toBe(0);
  g.body.dispose();
  g.edges.dispose();
  expect(performance.now() - start).toBeLessThan(5000);
});

it("bounds the maximum eight-building batch across rotations and disposes its buffers", () => {
  for (const rotation of [0, 5, 15, 45, 90, 179, 270, 359.99]) {
    const g = developmentGeometry(
      Array.from({ length: 8 }, (_, i) => ({
        building: { ...b, id: `bound-${i}`, width: 30, depth: 20, rotation },
        baseY: 2,
      })),
      () => 1,
    );
    expect(g.body.getAttribute("position").count / 3).toBeLessThan(1000);
    expect(g.ranges).toHaveLength(8);
    expect(g.edges.getAttribute("position").count / 2).toBeLessThanOrEqual(104);
    g.body.dispose();
    g.edges.dispose();
  }
});
