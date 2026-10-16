import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  placementContext,
  placement,
  emptyPhysical,
  validatePhysical,
  LIMITS,
  type PublicSpace,
} from "../src/physical/model";
import { area, clip, simple, triangulate } from "../src/physical/polygon";
import { buildNetwork } from "../src/simulation/network";
import { TrafficSimulation, TOTAL_TICKS } from "../src/simulation/engine";
import {
  emptyPlan,
  segments,
  segmentId,
  type Plan,
} from "../src/simulation/interventions";
import {
  parseScenario,
  readLibrary,
  scenarioFile,
  STORAGE_KEY,
  writeLibrary,
} from "../src/planning/scenarios";
import { waterfrontChallenge } from "../src/physical/challenge";
import { useScenario } from "../src/state/scenario";
import { usePhysical } from "../src/state/physical";
import type { CityData, Point } from "../src/geo/types";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const data: CityData = read("../public/data/bergen.json"),
  source = read("../public/data/bryggen-transport.json"),
  network = buildNetwork(source),
  context = placementContext(data, network);
const example = read("../public/plans/waterfront-example.json");
const waterfront: PublicSpace = example.physical.proposals[0];
const rect = (x: number, z: number, w: number, h: number): Point[] => [
  [x, z],
  [x + w, z],
  [x + w, z + h],
  [x, z + h],
];
const space = (vertices: Point[]): PublicSpace => ({ ...waterfront, vertices });
// Deliberately synthetic planar fixtures test the maths, never enter the shipped city.
function fixture(grade = 0) {
  const d: CityData = {
    ...data,
    buildings: [],
    coastline: [],
    water: [],
    terrain: {
      positions: [
        -100,
        0,
        -300,
        0,
        100 * grade,
        -300,
        0,
        100 * grade,
        -200,
        -100,
        0,
        -200,
      ],
      indices: [0, 1, 2, 0, 2, 3],
    },
  };
  return placementContext(d, network);
}
const run = (plan: Plan) => {
  const s = new TrafficSimulation(network, plan);
  for (let i = 0; i < TOTAL_TICKS; i++) s.step();
  return s.snapshot();
};
const baseline = run(emptyPlan(network));
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}
afterEach(() => {
  usePhysical.getState().clear();
  useScenario.getState().close();
});

it("fits a traceable 315 m² hypothetical footprint on the unchanged real waterfront", () => {
  const p = placement(waterfront, context);
  expect(p.errors).toEqual([]);
  expect(p.valid).toBe(true);
  expect(p.areaM2).toBe(315);
  expect(p.maxGrade).toBeLessThan(0.02);
  expect(p.connected).toBe(true);
  expect(p.conflicts.map((c) => c.segmentId)).toEqual([
    "way/9649862:645523:75457133",
  ]);
  expect(example.physical.geographyId).toBe(context.id);
  expect(p.triangles.length).toBeGreaterThan(2);
  expect(
    p.triangles.reduce((a, t) => a + area(t.map((v) => [v[0], v[2]])), 0),
  ).toBeCloseTo(315, 6);
});
it("triangulates concave and reversed polygons without filling a notch", () => {
  const p: Point[] = [
    [-80, -280],
    [-60, -280],
    [-60, -275],
    [-75, -275],
    [-75, -260],
    [-80, -260],
  ];
  for (const points of [p, [...p].reverse()]) {
    expect(simple(points)).toBe(true);
    expect(triangulate(points).reduce((a, t) => a + area(t), 0)).toBe(area(p));
    expect(placement(space(points), fixture()).valid).toBe(true);
  }
  expect(
    area(
      clip(rect(0, 0, 10, 10), [
        [0, 0],
        [10, 0],
        [0, 10],
      ]),
    ),
  ).toBeCloseTo(50);
});
it.each(
  [
    [
      [-80, -280],
      [-60, -260],
      [-80, -260],
      [-60, -280],
    ],
    [
      [-80, -280],
      [-60, -280],
      [-80, -280],
      [-70, -260],
    ],
    [
      [-80, -280],
      [-70, -280],
      [-60, -280],
    ],
  ].map((vertices) => ({ vertices })),
)(
  "rejects crossings, repeated vertices and zero-area polygons",
  ({ vertices }) =>
    expect(placement(space(vertices as Point[]), fixture()).valid).toBe(false),
);
it("enforces inclusive numeric area, edge, span and authoring bounds", () => {
  const c = fixture();
  expect(placement(space(rect(-90, -290, 5, 5)), c).valid).toBe(true);
  expect(placement(space(rect(-100, -290, 100, 25)), c).valid).toBe(true);
  for (const p of [
    rect(-90, -290, 4.999, 5),
    rect(-100, -290, 100, 25.01),
    rect(-100, -290, 100.01, 10),
    rect(-146, -290, 10, 10),
    rect(-80, -280, 0.99, 30),
  ])
    expect(placement(space(p), c).valid).toBe(false);
  expect(LIMITS.maxProposals).toBe(4);
  expect(LIMITS.maxVertices).toBe(8);
});
it("tests the exact terrain grade boundary and drapes every clipped vertex to its TIN plane", () => {
  const p = space(rect(-80, -280, 20, 20)),
    c = fixture(0.15),
    r = placement(p, c);
  expect(r.valid).toBe(true);
  expect(r.maxGrade).toBeCloseTo(0.15, 8);
  for (const t of r.triangles)
    for (const [x, y] of t) expect(y).toBeCloseTo((x + 100) * 0.15, 8);
  expect(placement(p, fixture(0.15001)).errors.join()).toContain("steeper");
});
it("rejects a terrain gap even when all corners stand on land", () => {
  const c = fixture();
  const template = c.triangles[0];
  c.triangles = [];
  for (const ring of [
    rect(-100, -300, 100, 30),
    rect(-100, -250, 100, 50),
    rect(-100, -270, 30, 20),
    rect(-50, -270, 50, 20),
  ])
    for (const points of triangulate(ring))
      c.triangles.push({
        ...template,
        points,
        xyz: points.map(([x, z]) => [x, 0, z]),
        box: [-100, -300, 0, -200],
      });
  const r = placement(space(rect(-80, -280, 40, 40)), c);
  expect(r.errors.join()).toContain("entire footprint");
});
it("rejects contained buildings, courtyard boundary collisions, mapped water and coast crossings", () => {
  const c = fixture(),
    p = space(rect(-80, -280, 40, 40));
  c.buildings = [
    {
      id: "math-fixture",
      box: [-70, -270, -60, -260],
      rings: [rect(-70, -270, 10, 10)],
    },
  ];
  expect(placement(p, c).errors.join()).toContain("building");
  c.buildings = [
    {
      id: "math-courtyard",
      box: [-90, -290, -30, -230],
      rings: [rect(-90, -290, 60, 60), rect(-80, -280, 40, 40)],
    },
  ];
  expect(placement(space(rect(-70, -270, 10, 10)), c).valid).toBe(true);
  expect(
    placement(space(rect(-79.9, -270, 10, 10)), c).errors.join(),
  ).toContain("0.25");
  c.buildings = [];
  c.water = [[rect(-70, -270, 10, 10)]];
  expect(placement(p, c).errors.join()).toContain("inland water");
  c.water = [];
  c.coastline = [
    [
      [-90, -260],
      [-30, -260],
    ],
  ];
  expect(placement(p, c).errors.join()).toContain("coastline");
});
it("rejects touching or overlapping proposals and binds designs to the exact snapshot", () => {
  const c = fixture(),
    a = space(rect(-80, -280, 20, 20)),
    b = { ...space(rect(-60, -280, 20, 20)), id: "other" };
  expect(placement(b, c, [a]).errors.join()).toContain("another proposed");
  for (const input of [
    { ...emptyPhysical(c), geographyId: "another-city" },
    { ...emptyPhysical(c), proposals: [a, a] },
    { ...emptyPhysical(c), proposals: Array(5).fill(a) },
  ])
    expect(() => validatePhysical(input, c)).toThrow();
});
it("strictly rejects nonfinite, oversized, extra-field and arbitrary imported geometry", () => {
  for (const change of [
    {
      vertices: [
        [NaN, -250],
        [-30, -250],
        [-30, -230],
      ],
    },
    {
      vertices: [
        [1e100, -250],
        [-30, -250],
        [-30, -230],
      ],
    },
    { vertices: Array(9).fill([-30, -250]) },
    { kind: "demolition" },
    { elevation: 100 },
    {
      vertices: [
        [0, -250, 10],
        [-30, -250],
        [-30, -230],
      ],
    },
  ])
    expect(() =>
      validatePhysical(
        {
          ...emptyPhysical(context),
          proposals: [{ ...waterfront, ...change }],
        },
        context,
      ),
    ).toThrow();
  const invalid = {
    ...example,
    physical: {
      ...example.physical,
      proposals: [{ ...waterfront, vertices: rect(-140, -160, 10, 10) }],
    },
  };
  expect(() =>
    parseScenario(JSON.stringify(invalid), network, context),
  ).toThrow();
  expect(() => parseScenario(JSON.stringify(example), network)).toThrow(
    "matching geographic",
  );
});
it("preserves all original geographic and network records through validation, edits and simulation", () => {
  const original = JSON.stringify([data, network]);
  const frozen = freeze(structuredClone(data)),
    n = freeze(structuredClone(network)),
    c = placementContext(frozen, n);
  validatePhysical(example.physical, c);
  run(parseScenario(JSON.stringify(example), n, c).plan);
  expect(JSON.stringify([data, network])).toBe(original);
  expect(JSON.stringify(frozen)).toBe(JSON.stringify(data));
  const owned = validatePhysical(example.physical, c);
  owned.proposals[0].vertices[0][0] = 999;
  expect(waterfront.vertices[0][0]).toBe(-53);
});
it("uses explicit road edits only and proves a feasible waterfront challenge without lost trips", () => {
  expect(run(emptyPlan(network))).toEqual(baseline);
  const plan = parseScenario(JSON.stringify(example), network, context),
    r = run(plan.plan);
  expect(r).toEqual(run(plan.plan));
  expect(r.served + r.unrouted).toBe(r.requested);
  expect(r.unrouted).toBe(0);
  expect(r.unroutedByAccess.local + r.unroutedByAccess.service).toBe(0);

  expect(
    waterfrontChallenge(plan.physical!, plan.plan, context, baseline, r).passed,
  ).toBe(true);
  expect(
    waterfrontChallenge(
      plan.physical!,
      emptyPlan(network),
      context,
      baseline,
      baseline,
    ).passed,
  ).toBe(false); // unresolved physical conflict
  const closed = {
      ...emptyPlan(network),
      interventions: segments(network).map((e) => ({
        segmentId: segmentId(e),
        access: "closed" as const,
        capacityFactor: 1,
      })),
    },
    lost = run(closed);
  expect(lost.unrouted).toBe(960);
  expect(
    waterfrontChallenge(plan.physical!, closed, context, baseline, lost).passed,
  ).toBe(false);
  const tooLarge = {
    ...plan.physical!,
    proposals: [{ ...waterfront, vertices: rect(-75, -280, 30, 30) }],
  };
  expect(
    waterfrontChallenge(tooLarge, plan.plan, fixture(), baseline, r).passed,
  ).toBe(false);
});
it("keeps placement calculations bounded and repeatable", () => {
  const start = performance.now();
  let maxTriangles = 0;
  for (let i = 0; i < 200; i++) {
    const r = placement(waterfront, context);
    expect(r.valid).toBe(true);
    maxTriangles = Math.max(maxTriangles, r.triangles.length);
  }
  expect(maxTriangles).toBeLessThan(100);
  expect(performance.now() - start).toBeLessThan(5000); // runaway guard, not a device benchmark
});
it("undoes and redoes physical and traffic edits in a single bounded history", () => {
  const s = useScenario.getState();
  s.open(source, data);
  expect(s.putSpace(waterfront)).toBe(true);
  const physical = structuredClone(useScenario.getState().physical);
  s.edit(example.plan.interventions[0]);
  s.undo();
  expect(useScenario.getState().plan?.interventions).toHaveLength(0);
  expect(useScenario.getState().physical).toEqual(physical);
  s.undo();
  expect(useScenario.getState().physical?.proposals).toHaveLength(0);
  s.redo();
  expect(useScenario.getState().physical).toEqual(physical);
  s.putSpace({ ...waterfront, kind: "landscaped" });
  expect(useScenario.getState().cursor).toBe(
    useScenario.getState().history.length - 1,
  );
  for (let i = 0; i < 80; i++)
    s.putSpace({ ...waterfront, kind: i % 2 ? "landscaped" : "pedestrian" });
  expect(useScenario.getState().history).toHaveLength(51);
  s.reset();
  expect(useScenario.getState().physical?.proposals).toHaveLength(0);
  expect(useScenario.getState().plan).toEqual(emptyPlan(network));
});
it("saves/reopens combined plans and reads legacy 3B records without rewriting them on load", () => {
  const storage = memory(),
    legacy = read("../public/plans/rethinking-example.json"),
    record = {
      id: "legacy-3b",
      savedAt: "2026-10-16T00:00:00Z",
      scenario: legacy,
    };
  const raw = JSON.stringify({ version: 1, plans: [record] });
  storage.setItem(STORAGE_KEY, raw);
  const s = useScenario.getState();
  s.open(source, data);
  s.loadLibrary(storage);
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  s.reopen(record.id);
  expect(useScenario.getState().plan).toEqual(legacy.plan);
  expect(useScenario.getState().physical?.proposals).toEqual([]);
  s.importPlan(JSON.stringify(example));
  s.setName("Combined saved study");
  expect(s.save(storage)).toBe(true);
  const id = useScenario.getState().currentId!;
  expect(readLibrary(storage, network, context).plans[0]).toEqual(record);
  s.close();
  s.open(source, data);
  s.loadLibrary(storage);
  s.reopen(id);
  expect(useScenario.getState().physical).toEqual(example.physical);
  const exported = scenarioFile(
    "Combined saved study",
    useScenario.getState().plan!,
    network,
    context,
    useScenario.getState().physical,
  );
  expect(parseScenario(JSON.stringify(exported), network, context)).toEqual(
    exported,
  );
  expect(s.save(storage, true)).toBe(true);
  expect(readLibrary(storage, network, context).plans).toHaveLength(3);
});
it("invalid late imports and stored geometry preserve the active city and the original library atomically", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  s.importPlan(JSON.stringify(example));
  s.save(storage);
  const previous = JSON.stringify([
    useScenario.getState().plan,
    useScenario.getState().physical,
  ]);
  useScenario.setState({ phase: "complete", baseline, intervention: baseline });
  const bad = {
    ...example,
    physical: {
      ...example.physical,
      proposals: [{ ...waterfront, vertices: rect(-140, -160, 10, 10) }],
    },
  };
  expect(s.importPlan(JSON.stringify(bad))).toBe(false);
  expect(
    JSON.stringify([
      useScenario.getState().plan,
      useScenario.getState().physical,
    ]),
  ).toBe(previous);
  expect(useScenario.getState().phase).toBe("complete");
  const library = readLibrary(storage, network, context);
  const raw = storage.getItem(STORAGE_KEY);
  library.plans[0].scenario = bad;
  expect(() => writeLibrary(storage, library, network, context)).toThrow();
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  storage.setItem(STORAGE_KEY, JSON.stringify(library));
  s.loadLibrary(storage);
  expect(useScenario.getState().storageBlocked).toBe(true);
  expect(s.save(storage)).toBe(false);
});
it("supports bounded pointer/keyboard drafts without mutating confirmed proposals", () => {
  const s = useScenario.getState(),
    p = usePhysical.getState();
  s.open(source, data);
  p.start();
  waterfront.vertices.forEach(p.add);
  p.patch({ name: "Touch draft" });
  p.confirm();
  const id = usePhysical.getState().selectedId!;
  expect(useScenario.getState().physical?.proposals).toHaveLength(1);
  p.reshape();
  p.move(0, [-52, -256]);
  p.cancel();
  expect(useScenario.getState().physical?.proposals[0].vertices).toEqual(
    waterfront.vertices,
  );
  p.select(id);
  p.reshape();
  for (let i = 0; i < 20; i++) p.add([-30, -240]);
  expect(usePhysical.getState().draft?.vertices).toHaveLength(8);
  p.clear();
});

it("undoes unapplied corner additions and moves without altering committed city history", () => {
  const p = usePhysical.getState();
  p.start();
  waterfront.vertices.forEach(p.add);
  const drawn = structuredClone(usePhysical.getState().draft);
  p.undoDraft();
  expect(usePhysical.getState().draft?.vertices).toHaveLength(3);
  p.redoDraft();
  expect(usePhysical.getState().draft).toEqual(drawn);
  p.move(0, [-52, -256]);
  p.undoDraft();
  expect(usePhysical.getState().draft).toEqual(drawn);
  p.add([-32, -230]);
  expect(usePhysical.getState().future).toHaveLength(0);
  for (let i = 0; i < 90; i++) p.move(0, [-52 - i * 0.01, -256]);
  expect(usePhysical.getState().past.length).toBeLessThanOrEqual(51);
});

it("keeps multiple real-snapshot spaces separate and validates every one in a combined file", () => {
  const [a, b, c, d] = waterfront.vertices;
  const lerp = (p: Point, q: Point, t: number): Point => [
    p[0] + t * (q[0] - p[0]),
    p[1] + t * (q[1] - p[1]),
  ];
  const proposals: PublicSpace[] = [
    {
      ...waterfront,
      id: "north",
      vertices: [a, lerp(a, b, 0.45), lerp(d, c, 0.45), d],
    },
    {
      ...waterfront,
      id: "south",
      kind: "landscaped",
      vertices: [lerp(a, b, 0.55), b, c, lerp(d, c, 0.55)],
    },
  ];
  const physical = validatePhysical(
    { ...emptyPhysical(context), proposals },
    context,
  );
  expect(physical.proposals).toHaveLength(2);
  const s = useScenario.getState();
  s.open(source, data);
  for (const p of proposals) expect(s.putSpace(p)).toBe(true);
  const before = JSON.stringify(useScenario.getState().physical);
  expect(s.putSpace({ ...waterfront, id: "overlap" })).toBe(false);
  expect(JSON.stringify(useScenario.getState().physical)).toBe(before);
  s.removeSpace("north");
  s.undo();
  expect(useScenario.getState().physical).toEqual(physical);
});
