import { afterEach, beforeEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildNetwork } from "../src/simulation/network";
import {
  applyPlan,
  editPlan,
  emptyPlan,
  networkId,
  nearestSegment,
  segmentId,
  segments,
  validatePlan,
  type Plan,
} from "../src/simulation/interventions";
import {
  TrafficSimulation,
  TOTAL_TICKS,
  type Result,
} from "../src/simulation/engine";
import { evaluateChallenge, OBJECTIVES } from "../src/simulation/challenge";
import {
  STORAGE_KEY,
  parseScenario,
  readLibrary,
  scenarioFile,
  validateLibrary,
  writeLibrary,
} from "../src/planning/scenarios";
import { useScenario } from "../src/state/scenario";
const source = JSON.parse(
  readFileSync(
    new URL("../public/data/bryggen-transport.json", import.meta.url),
    "utf8",
  ),
);
const network = buildNetwork(source),
  sections = segments(network),
  id = segmentId(sections.find((e) => e.corridor)!);
const example = parseScenario(
  readFileSync(
    new URL("../public/plans/rethinking-example.json", import.meta.url),
    "utf8",
  ),
  network,
);
const edit = { segmentId: id, access: "local" as const, capacityFactor: 1 };
const run = (plan: Plan) => {
  const s = new TrafficSimulation(network, plan);
  for (let i = 0; i < TOTAL_TICKS; i++) s.step();
  return s.snapshot();
};
const baseline = run(emptyPlan(network));
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
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
beforeEach(() => useScenario.getState().open(source));
afterEach(() => useScenario.getState().close());

it("normalizes versioned multi-section plans and binds them to the exact baseline model", () => {
  const p = validatePlan(example.plan, network);
  expect(p.interventions).toHaveLength(5);
  expect(validatePlan(p, network)).toEqual(p);
  expect(
    validatePlan(
      {
        ...emptyPlan(network),
        interventions: [{ ...edit, access: "all", capacityFactor: 1 }],
      },
      network,
    ).interventions,
  ).toEqual([]);
  expect(segments(network)).toHaveLength(31);
  expect(new Set(network.edges.map(segmentId)).size).toBe(31);
  const changed = structuredClone(network);
  changed.edges[0].points[0][0] += 0.1;
  expect(networkId(changed)).not.toBe(networkId(network));
});
it.each([0, 0.2, 2.25, NaN, Infinity, -1])(
  "rejects capacity factor %s",
  (capacityFactor) => {
    expect(() =>
      validatePlan(
        { ...emptyPlan(network), interventions: [{ ...edit, capacityFactor }] },
        network,
      ),
    ).toThrow();
  },
);
it("rejects duplicate, unsupported, contradictory and geography-editing payloads", () => {
  for (const interventions of [
    [edit, edit],
    [{ ...edit, segmentId: "invented-road" }],
    [{ ...edit, access: "closed", capacityFactor: 2 }],
    [{ ...edit, access: "bus" }],
    [{ ...edit, oneway: "no" }],
    [
      {
        ...edit,
        points: [
          [0, 0],
          [1, 1],
        ],
      },
    ],
  ])
    expect(() =>
      validatePlan({ ...emptyPlan(network), interventions }, network),
    ).toThrow();
  expect(() =>
    validatePlan(
      { ...emptyPlan(network), networkId: "other-network" },
      network,
    ),
  ).toThrow();
  expect(() =>
    validatePlan({ ...emptyPlan(network), version: 2 }, network),
  ).toThrow();
  expect(() =>
    editPlan(emptyPlan(network), { segmentId: "unknown" }, network),
  ).toThrow();
});
it("changes access/capacity without changing directions, source nodes, geometry or source records", () => {
  const original = JSON.stringify(network),
    p = editPlan(emptyPlan(network), { ...edit, capacityFactor: 0.5 }, network),
    n = applyPlan(freeze(structuredClone(network)), freeze(p));
  expect(n.edges.map((e) => [e.id, e.from, e.to, e.nodeIds, e.points])).toEqual(
    network.edges.map((e) => [e.id, e.from, e.to, e.nodeIds, e.points]),
  );
  n.edges.forEach((e, i) => {
    expect(e.capacityVph).toBe(
      network.edges[i].capacityVph * (segmentId(e) === id ? 0.5 : 1),
    );
    expect(e.modelAccess).toBe(segmentId(e) === id ? "local" : "all");
  });
  expect(JSON.stringify(network)).toBe(original);
  n.edges[0].points[0][0] = 999;
  expect(JSON.stringify(network)).toBe(original);
});
it("reproduces multi-edit outcomes and conserves every requested trip and node flow", () => {
  const a = run(example.plan),
    b = run(example.plan);
  expect(a).toEqual(b);
  expect(a.requested).toBe(960);
  for (const r of [a, baseline]) {
    expect(r.served + r.unrouted).toBe(r.requested);
    expect(r.edgeVehicles.every((x) => Number.isFinite(x) && x >= 0)).toBe(
      true,
    );
    for (const n of network.nodeIds)
      expect(r.nodeBalance[n] ?? 0).toBe(r.endpointBalance[n] ?? 0);
    expect(Object.values(r.unroutedByAccess).reduce((x, y) => x + y, 0)).toBe(
      r.unrouted,
    );
  }
  expect(a.corridorThroughTrips).toBeLessThan(baseline.corridorThroughTrips);
  expect(a).not.toEqual(baseline);
});
it("tests the numerical challenge thresholds against an achievable five-edit plan", () => {
  const r = run(example.plan),
    game = evaluateChallenge(baseline, r);
  expect(game.passed).toBe(true);
  expect(game.checks).toEqual([true, true, true, true]);
  expect(game.throughReduction).toBeGreaterThanOrEqual(
    OBJECTIVES.throughReduction,
  );
  expect(game.distanceRatio).toBeLessThanOrEqual(OBJECTIVES.maxDistanceRatio);
  expect(game.vc).toBeLessThanOrEqual(OBJECTIVES.maxVc);
  expect(r.unrouted).toBe(0);
  expect(evaluateChallenge(baseline, baseline).passed).toBe(false);
});
it("never rewards disappearing demand, even if routed travel and emissions fall to zero", () => {
  const closed = {
    ...emptyPlan(network),
    interventions: sections.map((e) => ({
      segmentId: segmentId(e),
      access: "closed" as const,
      capacityFactor: 1,
    })),
  };
  const r = run(closed);
  expect(r.unrouted).toBe(960);
  expect(r.served).toBe(0);
  expect(r.vehicleMinutes).toBe(0);
  expect(r.emissionBurden).toBe(0);
  const game = evaluateChallenge(freeze(baseline), freeze(r));
  expect(game.passed).toBe(false);
  expect(game.score).toBe(-1960);
  expect(game.score!).toBeLessThan(
    evaluateChallenge(baseline, baseline).score!,
  );
  const partial = structuredClone(r);
  partial.tick = 30;
  expect(evaluateChallenge(baseline, partial).score).toBeNull();
});
it("uses real section geometry for pointer selection and returns null for unmodelled roads", () => {
  const e = sections[3],
    p = e.points[Math.floor(e.points.length / 2)];
  expect(nearestSegment(network, e.wayId, p)).toBe(segmentId(e));
  expect(nearestSegment(network, "way/not-modelled", p)).toBeNull();
});
it("supports undo/redo, clears redo on branching, invalidates results and bounds history", () => {
  const s = useScenario.getState();
  s.edit(edit);
  const first = structuredClone(useScenario.getState().plan);
  s.edit({ ...edit, capacityFactor: 0.5 });
  s.undo();
  expect(useScenario.getState().plan).toEqual(first);
  s.redo();
  expect(useScenario.getState().plan?.interventions[0].capacityFactor).toBe(
    0.5,
  );
  s.undo();
  s.edit({ ...edit, capacityFactor: 0.75 });
  expect(useScenario.getState().cursor).toBe(
    useScenario.getState().history.length - 1,
  );
  useScenario.setState({
    phase: "complete",
    baseline,
    intervention: run(example.plan),
    mapView: "baseline",
  });
  s.undo();
  expect(useScenario.getState()).toMatchObject({
    phase: "ready",
    baseline: null,
    intervention: null,
    mapView: "plan",
  });
  for (let i = 0; i < 120; i++)
    s.edit({ ...edit, capacityFactor: i % 2 ? 0.5 : 0.75 });
  expect(useScenario.getState().history).toHaveLength(51);
  const before = JSON.stringify(useScenario.getState().plan);
  s.edit({ ...edit, capacityFactor: 9 });
  expect(JSON.stringify(useScenario.getState().plan)).toBe(before);
});
it("saves, reloads, names, reopens and duplicates plans without changing the original", () => {
  const storage = memoryStorage(),
    s = useScenario.getState();
  storage.data.set("unrelated-app-key", "leave me");
  s.edit(edit);
  s.setName("Vågen access trial");
  expect(s.save(storage)).toBe(true);
  const original = readLibrary(storage, network).plans[0];
  s.reset();
  expect(useScenario.getState().plan).toEqual(emptyPlan(network));
  expect(storage.data.get("unrelated-app-key")).toBe("leave me");
  s.close();
  s.open(source);
  s.loadLibrary(storage);
  s.reopen(original.id);
  expect(useScenario.getState()).toMatchObject({
    name: "Vågen access trial",
    plan: original.scenario.plan,
  });
  expect(s.save(storage, true)).toBe(true);
  expect(readLibrary(storage, network).plans).toHaveLength(2);
  expect(readLibrary(storage, network).plans[0]).toEqual(original);
  expect(useScenario.getState().name).toBe("Vågen access trial (copy)");
});
it("roundtrips exports and rejects incompatible JSON without corrupting the active plan or results", () => {
  const s = useScenario.getState();
  s.edit(edit);
  const exportFile = scenarioFile(
    "Test plan",
    useScenario.getState().plan!,
    network,
  );
  const text = JSON.stringify(exportFile);
  expect(parseScenario(text, network)).toEqual(exportFile);
  expect(s.importPlan(text)).toBe(true);
  const initial = structuredClone(useScenario.getState().plan);
  useScenario.setState({ phase: "complete", baseline, intervention: baseline });
  for (const invalid of [
    "{",
    JSON.stringify({ ...exportFile, version: 2 }),
    JSON.stringify({ ...exportFile, results: { score: 999 } }),
    JSON.stringify({
      ...exportFile,
      plan: { ...exportFile.plan, networkId: "elsewhere" },
    }),
    " ".repeat(32769),
  ]) {
    expect(s.importPlan(invalid)).toBe(false);
    expect(useScenario.getState().plan).toEqual(initial);
    expect(useScenario.getState().phase).toBe("complete");
    expect(useScenario.getState().baseline).toEqual(baseline);
  }
});
it("preserves corrupt and future-version storage rather than silently overwriting it", () => {
  const storage = memoryStorage();
  storage.data.set(STORAGE_KEY, '{"version":2,"plans":[]}');
  const s = useScenario.getState();
  s.edit(edit);
  const draft = structuredClone(useScenario.getState().plan);
  s.loadLibrary(storage);
  expect(useScenario.getState().storageBlocked).toBe(true);
  expect(s.save(storage)).toBe(false);
  expect(storage.data.get(STORAGE_KEY)).toBe('{"version":2,"plans":[]}');
  expect(useScenario.getState().plan).toEqual(draft);
  expect(() =>
    readLibrary(
      { getItem: () => " ".repeat(200001), setItem: () => {} },
      network,
    ),
  ).toThrow();
});
it("handles blocked/quota storage and validates library limits atomically", () => {
  const storage = memoryStorage(),
    s = useScenario.getState();
  s.edit(edit);
  s.save(storage);
  const raw = storage.data.get(STORAGE_KEY);
  const broken = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error("quota");
    },
  };
  expect(s.save(broken, true)).toBe(false);
  expect(storage.data.get(STORAGE_KEY)).toBe(raw);
  const lib = readLibrary(storage, network);
  expect(() =>
    writeLibrary(
      storage,
      { version: 1, plans: Array.from({ length: 21 }, () => lib.plans[0]) },
      network,
    ),
  ).toThrow();
  expect(storage.data.get(STORAGE_KEY)).toBe(raw);
  expect(() =>
    validateLibrary({ ...lib, unexpected: true }, network),
  ).toThrow();
  expect(() =>
    parseScenario(JSON.stringify({ ...example, name: "\n" }), network),
  ).toThrow();
});
it("merges other-tab additions and refuses conflicting or corrupt late storage writes", () => {
  const storage = memoryStorage(),
    s = useScenario.getState();
  s.save(storage);
  const first = useScenario.getState().currentId!;
  const external = readLibrary(storage, network);
  external.plans.push({
    ...external.plans[0],
    id: "another-tab",
    scenario: { ...external.plans[0].scenario, name: "Other tab" },
  });
  writeLibrary(storage, external, network);
  expect(s.save(storage)).toBe(true);
  expect(readLibrary(storage, network).plans).toHaveLength(2);
  const changed = readLibrary(storage, network);
  changed.plans.find((p) => p.id === first)!.scenario.name =
    "Changed elsewhere";
  writeLibrary(storage, changed, network);
  const raw = storage.data.get(STORAGE_KEY);
  expect(s.save(storage)).toBe(false);
  expect(storage.data.get(STORAGE_KEY)).toBe(raw);
  storage.data.set(STORAGE_KEY, "broken");
  expect(s.save(storage, true)).toBe(false);
  expect(storage.data.get(STORAGE_KEY)).toBe("broken");
});
it("prepares baseline/current/saved comparisons without sharing mutable scenario data", () => {
  const storage = memoryStorage(),
    s = useScenario.getState();
  s.edit(edit);
  s.setName("A");
  s.save(storage);
  const a = useScenario.getState().currentId!;
  s.edit({ ...edit, capacityFactor: 0.5 });
  s.setName("B");
  s.save(storage, true);
  const b = useScenario.getState().currentId!;
  s.reopen(b);
  s.setReference(a);
  expect(useScenario.getState().referenceId).toBe(a);
  expect(useScenario.getState().phase).toBe("ready");
  const before = JSON.stringify(useScenario.getState().plan);
  s.setReference("missing");
  expect(JSON.stringify(useScenario.getState().plan)).toBe(before);
  expect(useScenario.getState().referenceId).toBe(a);
  const refs = readLibrary(storage, network).plans;
  const outputs = refs.map((p) => run(p.scenario.plan));
  expect(outputs[0]).not.toEqual(outputs[1]);
  expect(outputs.every((r: Result) => r.requested === baseline.requested)).toBe(
    true,
  );
});
