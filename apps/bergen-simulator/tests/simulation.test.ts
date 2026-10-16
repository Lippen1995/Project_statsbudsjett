import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildNetwork, type TransportSource } from "../src/simulation/network";
import {
  DEMAND,
  TrafficSimulation as ModelSimulation,
  TOTAL_TICKS,
  permitted as modelPermitted,
  route as modelRoute,
  type Demand,
  type Access,
} from "../src/simulation/engine";
import {
  applyPlan,
  emptyPlan,
  segmentId,
  segments,
  type AccessRule,
} from "../src/simulation/interventions";
import type { Network, Edge } from "../src/simulation/network";
import { useScenario } from "../src/state/scenario";
import { trafficGeometry, trafficColor } from "../src/geo/traffic";
import { terrainSampler } from "../src/geo/surface";
import { parseCityData } from "../src/geo/types";
const source = JSON.parse(
  readFileSync(
    new URL("../public/data/bryggen-transport.json", import.meta.url),
    "utf8",
  ),
) as TransportSource;
const network = buildNetwork(source);
// Preserve all 3A regression cases by translating historical choices to data.
// The production engine has no global policies or corridor-specific access logic.
type Policy = "baseline" | "restricted" | "pedestrian";
const rule = (p: Policy): AccessRule =>
  p === "restricted" ? "local" : p === "pedestrian" ? "service" : "all";
const historicalPlan = (n: Network, p: Policy) => ({
  ...emptyPlan(n),
  interventions:
    p === "baseline"
      ? []
      : segments(n)
          .filter((e) => e.corridor)
          .map((e) => ({
            segmentId: segmentId(e),
            access: rule(p),
            capacityFactor: 1,
          })),
});
class TrafficSimulation extends ModelSimulation {
  constructor(n: Network, p: Policy, demand: readonly Demand[] = DEMAND) {
    super(n, historicalPlan(n, p), demand);
  }
}
const route = (
  n: Network,
  from: string,
  to: string,
  p: Policy,
  access: Access,
  loads: readonly number[],
) => modelRoute(applyPlan(n, historicalPlan(n, p)), from, to, access, loads);
const permitted = (e: Edge, p: Policy, access: Access) =>
  modelPermitted({ ...e, modelAccess: e.corridor ? rule(p) : "all" }, access);
const run = (policy: Policy) => {
  const sim = new TrafficSimulation(network, policy);
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  return sim.snapshot();
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

it("uses original source geometry, shared node IDs and mapped directions only", () => {
  expect(source.ways).toHaveLength(27);
  expect(network.edges.length).toBeLessThan(100);
  for (const edge of network.edges) {
    const way = source.ways.find((w) => w.id === edge.wayId)!;
    const start = way.nodeIds.indexOf(edge.from),
      end = way.nodeIds.indexOf(edge.to);
    expect(edge.nodeIds).toEqual(
      start < end
        ? way.nodeIds.slice(start, end + 1)
        : way.nodeIds.slice(end, start + 1).reverse(),
    );
    if (way.tags.oneway === "yes") expect(start).toBeLessThan(end);
    expect(edge.lengthM).toBeGreaterThan(0);
  }
  for (const access of ["through", "local", "service"] as const)
    for (const od of DEMAND)
      expect(
        route(network, od.from, od.to, "baseline", access, []),
      ).not.toBeNull();
});

it("is reproducible without randomness and resets to identical initial conditions", () => {
  const sim = new TrafficSimulation(network, "restricted");
  const initial = sim.snapshot();
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const result = sim.snapshot();
  expect(result).toEqual(run("restricted"));
  expect(sim.reset()).toEqual(initial);
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  expect(sim.snapshot()).toEqual(result);
});

it("routes all policies with the same model and exposes meaningful detours and access trade-offs", () => {
  const b = run("baseline"),
    r = run("restricted"),
    p = run("pedestrian");
  expect(b.requested).toBe(960);
  expect(r.requested).toBe(b.requested);
  expect(p.requested).toBe(b.requested);
  expect(r.corridorTrips).toBeLessThan(b.corridorTrips);
  expect(p.corridorTrips).toBeLessThan(r.corridorTrips);
  expect(r.throughMetres / r.throughServed).toBeGreaterThan(
    b.throughMetres / b.throughServed,
  );
  expect(r.vehicleMinutes).toBeGreaterThan(b.vehicleMinutes);
  expect(r.emissionBurden).toBeGreaterThan(b.emissionBurden);
  expect(p.unrouted).toBeGreaterThan(0); // The small directed access branch has no permitted outbound path.
  expect(b.unrouted).toBe(0);
  network.edges.forEach((edge, i) => {
    if (edge.corridor)
      expect(p.edgeVehicles[i]).toBeLessThanOrEqual(r.edgeVehicles[i]);
  });
  console.log(
    "Synthetic model results",
    [b, r, p].map((x) => ({
      served: x.served,
      unrouted: x.unrouted,
      vehicleMinutes: x.vehicleMinutes,
      corridorTrips: x.corridorTrips,
      throughM: x.throughMetres / x.throughServed,
      emissionIndex: (x.emissionBurden / b.emissionBurden) * 100,
    })),
  );
});

it("conserves flow at every node and accounts for every nonnegative trip", () => {
  for (const policy of ["baseline", "restricted", "pedestrian"] as const) {
    const sim = new TrafficSimulation(network, policy);
    for (let i = 0; i < TOTAL_TICKS; i++) {
      const r = sim.step();
      expect(r.served + r.unrouted).toBe(r.requested);
      for (const n of network.nodeIds)
        expect(r.nodeBalance[n] ?? 0).toBe(r.endpointBalance[n] ?? 0);
      expect(Object.values(r.nodeBalance).reduce((a, b) => a + b, 0)).toBe(0);
      expect(
        r.edgeVehicles.every(
          (v) => Number.isFinite(v) && v >= 0 && v <= r.served,
        ),
      ).toBe(true);
      expect(r.edgeVc.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    }
  }
});

it("rejects unbounded demand and handles disconnected segments without invented links", () => {
  const cut = { edges: [], nodeIds: [...network.nodeIds] };
  const sim = new TrafficSimulation(cut, "baseline");
  expect(sim.step()).toMatchObject({ requested: 12, served: 0, unrouted: 12 });
  expect(
    route(network, "missing-node", "645599", "baseline", "through", []),
  ).toBeNull();
  for (const count of [-1, 0.2, NaN, Infinity, 101])
    expect(
      () =>
        new TrafficSimulation(network, "baseline", [
          { ...DEMAND[0], vehiclesPerTick: count },
        ]),
    ).toThrow();
  const bad = structuredClone(source);
  bad.ways[0].nodeIds[0] = "missing-node";
  expect(() => buildNetwork(bad)).toThrow();
  const duplicate = structuredClone(source);
  duplicate.ways.push(duplicate.ways[0]);
  expect(() => buildNetwork(duplicate)).toThrow();
  const crossing = structuredClone(source);
  const way = crossing.ways.find((w) => w.tags.oneway === "yes")!;
  way.tags.oneway = "reversible";
  expect(() => buildNetwork(crossing)).toThrow();
});

it("only grants assumed policy access to the specified categories", () => {
  const corridor = network.edges.find((e) => e.corridor)!;
  expect(permitted(corridor, "restricted", "through")).toBe(false);
  expect(permitted(corridor, "restricted", "local")).toBe(true);
  expect(permitted(corridor, "pedestrian", "local")).toBe(false);
  expect(permitted(corridor, "pedestrian", "service")).toBe(true);
});

it("cannot mutate source geography, network inputs or exported snapshots", () => {
  const frozen = freeze(structuredClone(source));
  const before = JSON.stringify(frozen);
  const n = freeze(buildNetwork(frozen));
  const sim = new TrafficSimulation(
    n,
    "restricted",
    freeze(structuredClone(DEMAND)),
  );
  const out = sim.step();
  out.edgeVehicles.fill(-1);
  out.nodeBalance.bad = 9;
  expect(sim.snapshot().edgeVehicles.every((v) => v >= 0)).toBe(true);
  expect(sim.snapshot().nodeBalance.bad).toBeUndefined();
  sim.reset();
  expect(JSON.stringify(frozen)).toBe(before);
});

it("terminates after exactly 60 ticks and retains bounded snapshot memory", () => {
  const sim = new TrafficSimulation(network, "pedestrian");
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const final = sim.snapshot();
  for (let i = 0; i < 1000; i++) sim.step();
  expect(sim.snapshot()).toEqual(final);
  expect(JSON.stringify(final).length).toBeLessThan(15000);
  expect(final.edgeVehicles).toHaveLength(network.edges.length);
});

it("reset clears comparisons, policy, progress and results; policies invalidate stale results", () => {
  const s = useScenario.getState();
  s.open(source);
  s.edit({
    segmentId: segmentId(network.edges.find((e) => e.corridor)!),
    access: "service",
    capacityFactor: 1,
  });
  useScenario.setState({
    intervention: run("pedestrian"),
    baseline: run("baseline"),
    phase: "complete",
    mapView: "baseline",
    heatmap: false,
  });
  s.reset();
  expect(useScenario.getState()).toMatchObject({
    plan: { interventions: [] },
    phase: "ready",
    baseline: null,
    intervention: null,
    mapView: "plan",
    heatmap: true,
    computeMs: 0,
  });
  expect(useScenario.getState().network).toEqual(network);
  useScenario.setState({ intervention: run("baseline"), phase: "complete" });
  s.edit({
    segmentId: segmentId(network.edges.find((e) => e.corridor)!),
    access: "local",
    capacityFactor: 1,
  });
  expect(useScenario.getState()).toMatchObject({
    plan: { interventions: [{ access: "local" }] },
    phase: "ready",
    intervention: null,
  });
  s.close();
  expect(useScenario.getState().network).toBeNull();
});

it("generates finite, draped, bounded batched geometry whose colours change with results", () => {
  const data = parseCityData(
    JSON.parse(
      readFileSync(
        new URL("../public/data/bergen.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const original = JSON.stringify(data),
    sample = terrainSampler(data.terrain);
  const b = trafficGeometry(network, run("baseline"), sample, false, true);
  const r = trafficGeometry(network, run("restricted"), sample, false, false);
  const c = trafficGeometry(network, null, sample, true, false);
  expect(
    Array.from(b.geometry.getAttribute("position").array).every(
      Number.isFinite,
    ),
  ).toBe(true);
  expect(b.geometry.getAttribute("position").array).toEqual(
    r.geometry.getAttribute("position").array,
  );
  expect(b.geometry.getAttribute("color").array).not.toEqual(
    r.geometry.getAttribute("color").array,
  );
  expect(b.geometry.getAttribute("position").count).toBeLessThan(6000);
  expect(
    c.ranges.every((v) => ["way/9649862", "way/488690111"].includes(v.wayId)),
  ).toBe(true);
  expect(JSON.stringify(data)).toBe(original);
  expect(trafficColor(10).getHexString()).toBe(
    trafficColor(1.5).getHexString(),
  );
  b.geometry.dispose();
  r.geometry.dispose();
  c.geometry.dispose();
});

it("pins transport extraction to the existing manifest and preserves pure engine boundaries", () => {
  const raw = readFileSync(
    new URL("../public/data/bryggen-transport.json", import.meta.url),
    "utf8",
  );
  const provenance = JSON.parse(raw).provenance;
  expect(provenance.sourceManifestSha256).toBe(
    createHash("sha256")
      .update(
        readFileSync(
          new URL("../public/data/source-manifest.json", import.meta.url),
        ),
      )
      .digest("hex"),
  );
  expect(provenance.sources).toHaveLength(30);
  for (const file of readdirSync(
    new URL("../src/simulation/", import.meta.url),
  ).filter((f) => f.endsWith(".ts"))) {
    expect(
      readFileSync(
        new URL(`../src/simulation/${file}`, import.meta.url),
        "utf8",
      ),
    ).not.toMatch(/from ["'](?:react|three|zustand)|Math\.random|fetch\(/);
  }
});

it("does not join crossing or coincident geometry without shared node identities", () => {
  const fixture: TransportSource = {
    version: 1,
    origin: [5.3235, 60.395],
    provenance: source.provenance,
    nodes: {
      "1": [5.323, 60.395],
      "2": [5.324, 60.395],
      "3": [5.324, 60.395],
      "4": [5.324, 60.396],
    },
    ways: [
      {
        id: "way/1",
        nodeIds: ["1", "2"],
        tags: { highway: "unclassified", oneway: "yes" },
      },
      { id: "way/2", nodeIds: ["3", "4"], tags: { highway: "unclassified" } },
    ],
  };
  const graph = buildNetwork(fixture);
  expect(route(graph, "1", "4", "baseline", "through", [])).toBeNull();
  expect(route(graph, "2", "1", "baseline", "through", [])).toBeNull();
  expect(route(graph, "1", "2", "baseline", "through", [])).toHaveLength(1);
});

it("terminates cancelled workers and ignores late results after reset", async () => {
  const { vi } = await import("vitest");
  class WorkerFixture {
    static instances: WorkerFixture[] = [];
    onmessage: ((message: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    messages: unknown[] = [];
    constructor() {
      WorkerFixture.instances.push(this);
    }
    postMessage(message: unknown) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", WorkerFixture);
  try {
    const s = useScenario.getState();
    s.open(source);
    s.edit({
      segmentId: segmentId(network.edges.find((e) => e.corridor)!),
      access: "local",
      capacityFactor: 1,
    });
    s.run();
    const worker = WorkerFixture.instances[0];
    expect(useScenario.getState().phase).toBe("running");
    expect(worker.messages).toHaveLength(1);
    s.pauseResume();
    expect(worker.messages.at(-1)).toEqual({ type: "pause" });
    s.reset();
    expect(worker.terminated).toBe(true);
    worker.onmessage?.({
      data: {
        type: "progress",
        baseline: run("baseline"),
        intervention: run("restricted"),
        computeMs: 10,
        paused: false,
      },
    });
    expect(useScenario.getState()).toMatchObject({
      phase: "ready",
      plan: { interventions: [] },
      intervention: null,
      baseline: null,
    });
    s.run();
    expect(WorkerFixture.instances).toHaveLength(2);
    s.close();
    expect(WorkerFixture.instances[1].terminated).toBe(true);
  } finally {
    useScenario.getState().close();
    vi.unstubAllGlobals();
  }
});
