import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { placementContext } from "../src/physical/model";
import { buildNetwork } from "../src/simulation/network";
import { balancedQuarter } from "../src/district/challenge";
import {
  DistrictRunner,
  type DistrictCommand,
  type DistrictReply,
} from "../src/district/protocol";
import { useScenario } from "../src/state/scenario";
import { useDistrict } from "../src/state/district";
import {
  parseScenario,
  scenarioFile,
  STORAGE_KEY,
  readLibrary,
  writeLibrary,
} from "../src/planning/scenarios";
import {
  developmentGeometry,
  applyDevelopmentActivity,
} from "../src/geo/development";
import { runDistrict, DistrictSimulation } from "../src/district/engine";
import {
  defaultLiving,
  validateLiving,
  districtInput,
  validateDistrictInput,
  validateHistory,
  validateMonth,
  HORIZON,
  ASSUMPTIONS,
} from "../src/district/model";
const example = JSON.parse(
  readFileSync(
    new URL("../public/plans/urban-quarter-example.json", import.meta.url),
    "utf8",
  ),
);
it("evolves monthly stocks from reproducible empty initial conditions", () => {
  const input = districtInput(defaultLiving(), example.development.proposals),
    a = runDistrict(input);
  expect(a).toEqual(runDistrict(input));
  expect(a).toHaveLength(25);
  expect(a[0].occupiedHouseholds).toBe(0);
  expect(a[6].occupiedHouseholds).toBeGreaterThan(0);
  expect(a[6].filledJobs).toBeGreaterThan(0);
  expect(a[6].occupiedHouseholds).toBeLessThan(a[24].occupiedHouseholds);
  expect(validateHistory(a, input)).toEqual(a);
});
it("changing the same residential building changes later uptake and employment", () => {
  const original = districtInput(
      defaultLiving(),
      example.development.proposals,
    ),
    changed = districtInput(
      defaultLiving(),
      example.development.proposals.map(
        (b: { purpose: string; storeys: number }) =>
          b.purpose === "residential" ? { ...b, storeys: 3 } : b,
      ),
    ),
    a = runDistrict(original),
    b = runDistrict(changed);
  expect(b[6].occupiedHouseholds).toBeGreaterThan(a[6].occupiedHouseholds);
  expect(b[6].filledJobs).toBeGreaterThan(a[6].filledJobs);
  expect(b[24].usedService).toBeGreaterThan(a[24].usedService);

  if (process.env.BERGEN_EVIDENCE === "1") {
    mkdirSync("artifacts/milestone-5a", { recursive: true });
    writeFileSync(
      "artifacts/milestone-5a/sample-24-months.json",
      JSON.stringify(
        {
          interpretation:
            "Synthetic game simulation for proposed Bryggen district only; not actual Bergen population, jobs or services.",
          input: changed,
          months: b,
        },
        null,
        2,
      ) + "\n",
    );
  }
});
it("zero demand remains zero, capacity alone never creates occupants or jobs", () => {
  const a = defaultLiving();
  a.householdArrivals = 0;
  a.jobDemandArrivals = 0;
  const r = runDistrict(districtInput(a, example.development.proposals));
  expect(r[24].occupiedHouseholds).toBe(0);
  expect(r[24].filledJobs).toBe(0);
  expect(r[24].constraint).toBe("household-demand");
});
it("reset and time bounds cannot run away", () => {
  const s = new DistrictSimulation(
      districtInput(defaultLiving(), example.development.proposals),
    ),
    zero = s.snapshot();
  s.advanceTo(24);
  expect(() => s.step()).toThrow("24-month");
  expect(s.history()).toHaveLength(25);
  expect(s.reset()).toEqual(zero);
  for (const value of [-1, 25, Infinity, 1.5])
    expect(() => s.advanceTo(value)).toThrow();
  expect(HORIZON).toBe(24);
});
it("validates every assumption bound", () => {
  for (const [key, r] of Object.entries(ASSUMPTIONS)) {
    expect(() =>
      districtInput({ ...defaultLiving(), [key]: r.min - 0.001 }, []),
    ).toThrow();
    expect(() =>
      districtInput({ ...defaultLiving(), [key]: r.max + 0.001 }, []),
    ).toThrow();
  }
});
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const data = read("../public/data/bergen.json"),
  source = read("../public/data/bryggen-transport.json"),
  network = buildNetwork(source),
  context = placementContext(data, network),
  winning = read("../public/plans/living-quarter-example.json");
const input = () =>
  districtInput(winning.living, winning.development.proposals);
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
}
afterEach(() => {
  useDistrict.getState().close();
  useScenario.getState().close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("has a documented fixed update order and a one-month recruitment lag", () => {
  const h = runDistrict(input(), 2);
  expect(h[1].occupiedHouseholds).toBe(2);
  expect(h[1].filledJobs).toBe(2);
  expect(h[1].waitingJobs).toBe(1);
  expect(h[2].occupiedHouseholds).toBeCloseTo(3.96);
  expect(h[2].recruitmentLabour).toBeCloseTo(1.96 * 1.1 + 2);
  expect(h[2].filledJobs).toBeCloseTo(4.156);
  expect(h[2].filledJobs).toBeLessThan(h[2].occupiedHouseholds * 1.1 + 2);
});
it("keeps household demand, exits, business requests and per-building allocations conserved every month", () => {
  const a = input();
  for (const r of runDistrict(a)) {
    expect(
      r.occupiedHouseholds + r.waitingHouseholds + r.departedHouseholds,
    ).toBeCloseTo(r.month * a.living.householdArrivals, 8);
    expect(r.filledJobs + r.waitingJobs).toBeCloseTo(
      r.month * a.living.jobDemandArrivals,
      8,
    );
    expect(r.residents).toBeCloseTo(
      r.occupiedHouseholds * a.living.householdSize,
    );
    expect(r.usedService + r.unmetService).toBeCloseTo(r.residents);
    expect(r.filledJobs).toBeLessThanOrEqual(r.recruitmentLabour + 1e-8);
    for (const b of r.buildings) {
      expect(b.used).toBeGreaterThanOrEqual(0);
      expect(b.used).toBeLessThanOrEqual(b.capacity + 1e-8);
    }
  }
});
it("civic supply affects subsequent household and job uptake, not only a static service statistic", () => {
  const a = input(),
    limited = runDistrict({
      ...a,
      buildings: a.buildings.filter((b) => b.purpose !== "civic"),
    }),
    supported = runDistrict(a);
  expect(limited[6].unmetService).toBeGreaterThan(0);
  expect(limited[6].constraint).toBe("services");
  expect(supported[6].occupiedHouseholds).toBeGreaterThan(
    limited[6].occupiedHouseholds,
  );
  expect(supported[12].filledJobs).toBeGreaterThan(limited[12].filledJobs);
});
it("respects weak demand and does not invent a workforce to bootstrap an isolated district", () => {
  const a = input();
  const weak = runDistrict({
    ...a,
    living: { ...a.living, householdArrivals: 0.1 },
  });
  expect(weak[6].occupiedHouseholds).toBeLessThanOrEqual(0.6);
  expect(weak[6].constraint).toBe("household-demand");
  const isolated = runDistrict({
    ...a,
    living: { ...a.living, externalJobOpportunities: 0, externalWorkforce: 0 },
  });
  expect(isolated[24].occupiedHouseholds).toBe(0);
  expect(isolated[24].filledJobs).toBe(0);
  expect(isolated[24].waitingHouseholds).toBe(48);
});
it("retains immutable inputs and frozen results without touching geographic records", () => {
  const a = freeze(input()),
    original = JSON.stringify([a, data, source]),
    sim = new DistrictSimulation(a),
    h = sim.advanceTo(24);
  expect(() => {
    h[6].occupiedHouseholds = 999;
  }).toThrow();
  expect(() => sim.input.buildings.push(a.buildings[0])).toThrow();
  h.pop();
  expect(sim.history()).toHaveLength(25);
  expect(JSON.stringify([a, data, source])).toBe(original);
});
it.each([
  { version: 2 },
  { householdSize: NaN },
  { workersPerHousehold: 3 },
  { result: {} },
  { complete: true },
  { horizon: Infinity },
])("rejects malformed or trusted derived inputs: %j", (p) =>
  expect(() => validateLiving({ ...defaultLiving(), ...p })).toThrow(),
);
it("rejects arbitrary meshes, unknown contracts, duplicate identities and oversize districts before stepping", () => {
  for (const a of [
    { ...input(), version: 2 },
    { ...input(), buildings: Array(9).fill(input().buildings[0]) },
    { ...input(), buildings: [input().buildings[0], input().buildings[0]] },
    { ...input(), buildings: [{ ...input().buildings[0], mesh: [] }] },
    { ...input(), results: [] },
  ])
    expect(() => validateDistrictInput(a)).toThrow();
});
it("validates units, capacities, shares, flow histories and identity on every output", () => {
  const a = input(),
    h = runDistrict(a, 6);
  for (const patch of [
    { residents: 999 },
    { occupiedHouseholds: -0.01 },
    { balance: NaN },
    { filledJobs: Infinity },
    { serviceCoverage: 2 },
    { month: 25 },
    { completed: true },
    { buildings: [{ ...h[6].buildings[0], utilization: NaN }] },
  ])
    expect(() => validateMonth({ ...h[6], ...patch }, a)).toThrow();
  const changed = h.map((r) => ({
    ...r,
    buildings: r.buildings.map((b) => ({ ...b })),
  }));
  changed[6].admittedHouseholds += 1;
  expect(() => validateHistory(changed, a)).toThrow("conservation");
  expect(() => validateHistory(Array(26).fill(h[0]), a)).toThrow();
});
it("bounds a worst-case eight-building, 24-month district over repeated resets and varied assumptions", () => {
  const a = input();
  a.buildings = Array.from({ length: 8 }, (_, i) => ({
    ...a.buildings[i % 3],
    id: `bound-${i}`,
    width: 20,
    depth: 30,
    storeys: 6,
  }));
  const start = performance.now();
  for (let i = 0; i < 40; i++) {
    const sim = new DistrictSimulation({
      ...a,
      living: {
        ...a.living,
        householdArrivals: i % 2 ? 8 : 0,
        jobDemandArrivals: i % 3 ? 12 : 0,
        householdTurnover: i % 2 ? 0.2 : 0,
        jobSeparation: i % 3 ? 0.2 : 0,
      },
    });
    for (let k = 0; k < 3; k++) {
      const h = sim.advanceTo(24);
      expect(h).toHaveLength(25);
      expect(JSON.stringify(h).length).toBeLessThan(200000);
      expect(
        h.every((r) =>
          Object.values(r)
            .filter((v) => typeof v === "number")
            .every((v) => Number.isFinite(v) && v >= 0),
        ),
      ).toBe(true);
      sim.reset();
    }
  }
  expect(performance.now() - start).toBeLessThan(5000);
});
it("proves a real-snapshot Balanced New Quarter solution and rejects single-type, vacancy and source-mismatch exploits", () => {
  const h = runDistrict(input());
  expect(
    balancedQuarter(
      winning.development,
      winning.physical,
      context,
      winning.living,
      h[24],
    ).passed,
  ).toBe(true);
  expect(
    balancedQuarter(
      winning.development,
      winning.physical,
      context,
      winning.living,
      h[6],
    ).passed,
  ).toBe(false);
  for (const purpose of ["residential", "commercial", "civic"] as const) {
    const development = {
        ...winning.development,
        proposals: winning.development.proposals.map(
          (
            b: typeof input extends never
              ? never
              : ReturnType<typeof input>["buildings"][number],
          ) => ({ ...b, purpose, storeys: 6 }),
        ),
      },
      r = runDistrict(districtInput(winning.living, development.proposals))[24];
    expect(
      balancedQuarter(development, winning.physical, context, winning.living, r)
        .passed,
    ).toBe(false);
  }
  expect(
    balancedQuarter(
      winning.development,
      { ...winning.physical, proposals: [] },
      context,
      winning.living,
      h[24],
    ).passed,
  ).toBe(false);
  expect(
    balancedQuarter(
      winning.development,
      winning.physical,
      context,
      { ...winning.living, areaPerHousehold: 40 },
      h[24],
    ).passed,
  ).toBe(false);
  const noDemand = {
    ...winning.living,
    householdArrivals: 0,
    jobDemandArrivals: 0,
  };
  expect(
    balancedQuarter(
      winning.development,
      winning.physical,
      context,
      noDemand,
      runDistrict(districtInput(noDemand, winning.development.proposals))[24],
    ).passed,
  ).toBe(false);
});
it("performs incremental worker calculations and rejects bad commands and stale generations", () => {
  const r = new DistrictRunner();
  expect(
    r.handle({
      type: "configure",
      generation: 2,
      input: input(),
      reference: input(),
    })?.current,
  ).toHaveLength(1);
  expect(r.handle({ type: "advance", generation: 1, month: 24 })).toBeNull();
  const b = r.handle({ type: "advance", generation: 2, month: 6 });
  expect(b?.current).toEqual(runDistrict(input(), 6));
  expect(b?.reference).toEqual(b?.current);
  expect(
    r.handle({ type: "advance", generation: 2, month: 24 })?.current,
  ).toHaveLength(25);
  expect(() =>
    r.handle({ type: "advance", generation: 2, month: 25 }),
  ).toThrow();
  expect(() =>
    r.handle({ type: "advance", generation: 2, month: 1.5 }),
  ).toThrow();
  expect(() => r.handle({ type: "unknown", generation: 2 })).toThrow();
});
it("migrates 3B, 4A and 4B inputs in memory without rewriting saved bytes or source geometry", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  for (const name of [
    "rethinking-example.json",
    "waterfront-example.json",
    "urban-quarter-example.json",
  ]) {
    const old = read(`../public/plans/${name}`),
      record = { id: "legacy", savedAt: "2026-10-17T00:00:00Z", scenario: old },
      raw = JSON.stringify({ version: 1, plans: [record] });
    storage.setItem(STORAGE_KEY, raw);
    s.loadLibrary(storage);
    s.reopen(record.id);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(useScenario.getState().living).toEqual(defaultLiving());
    expect(useScenario.getState().development?.proposals).toEqual(
      old.development?.proposals ?? [],
    );
    expect(useScenario.getState().plan).toEqual(old.plan);
  }
});
it("saves and replays only versioned inputs, never trusted results or completion flags", () => {
  const s = useScenario.getState(),
    storage = memory();
  s.open(source, data);
  expect(s.importPlan(JSON.stringify(winning))).toBe(true);
  expect(s.save(storage)).toBe(true);
  const id = useScenario.getState().currentId!,
    before = runDistrict(input());
  s.close();
  s.open(source, data);
  s.loadLibrary(storage);
  s.reopen(id);
  const state = useScenario.getState(),
    file = scenarioFile(
      state.name,
      state.plan!,
      network,
      context,
      state.physical,
      state.development,
      state.living,
    );
  expect(file).toEqual(winning);
  expect(
    runDistrict(districtInput(state.living, state.development!.proposals)),
  ).toEqual(before);
  const raw = storage.getItem(STORAGE_KEY),
    city = JSON.stringify([
      state.plan,
      state.physical,
      state.development,
      state.living,
    ]);
  for (const bad of [
    { ...winning, results: before },
    { ...winning, living: { ...winning.living, complete: true } },
    { ...winning, living: { ...winning.living, version: 2 } },
    { ...winning, version: 99 },
  ]) {
    expect(s.importPlan(JSON.stringify(bad))).toBe(false);
    expect(
      JSON.stringify([
        useScenario.getState().plan,
        useScenario.getState().physical,
        useScenario.getState().development,
        useScenario.getState().living,
      ]),
    ).toBe(city);
  }
  const library = readLibrary(storage, network, context);
  library.plans[0].scenario = {
    ...winning,
    living: { ...winning.living, householdSize: 999 },
  };
  expect(() => writeLibrary(storage, library, network, context)).toThrow();
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  expect(parseScenario(JSON.stringify(file), network, context)).toEqual(file);
});
it("shares assumption and construction undo/redo while retaining independent traffic inputs", () => {
  const s = useScenario.getState();
  s.open(source, data);
  s.importPlan(JSON.stringify(winning));
  const original = useScenario.getState().plan;
  expect(s.editLiving({ ...winning.living, householdArrivals: 0 })).toBe(true);
  expect(
    s.putBuilding({ ...winning.development.proposals[0], storeys: 4 }),
  ).toBe(true);
  s.undo();
  expect(
    useScenario
      .getState()
      .development?.proposals.find((b) => b.purpose === "residential")?.storeys,
  ).toBe(3);
  s.undo();
  expect(useScenario.getState().living).toEqual(winning.living);
  s.redo();
  expect(useScenario.getState().living.householdArrivals).toBe(0);
  expect(useScenario.getState().plan).toEqual(original);
  s.reset();
  expect(useScenario.getState().living).toEqual(defaultLiving());
});
class FakeWorker {
  static all: FakeWorker[] = [];
  messages: DistrictCommand[] = [];
  terminated = false;
  runner = new DistrictRunner();
  onmessage: ((e: MessageEvent<DistrictReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(c: DistrictCommand) {
    this.messages.push(JSON.parse(JSON.stringify(c)));
  }
  terminate() {
    this.terminated = true;
  }
  flush() {
    const c = this.messages[this.messages.length - 1],
      r = this.runner.handle(c);
    if (r) this.emit({ ...r, computeMs: 1 });
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<DistrictReply>);
  }
}
function activeDistrict() {
  vi.stubGlobal("Worker", FakeWorker);
  FakeWorker.all = [];
  const s = useScenario.getState();
  s.open(source, data);
  s.importPlan(JSON.stringify(winning));
  useDistrict.getState().open();
  const w = FakeWorker.all.at(-1)!;
  w.flush();
  return w;
}
it("rejects late worker messages after a building edit, reset and successful same-plan import", () => {
  const old = activeDistrict(),
    d = useDistrict.getState(),
    s = useScenario.getState();
  d.advance(6);
  old.flush();
  expect(useDistrict.getState().month).toBe(6);
  const stale = {
    type: "history",
    generation: old.messages[0].generation,
    current: runDistrict(input(), 6),
    reference: null,
    computeMs: 1,
  };
  s.putBuilding({ ...winning.development.proposals[0], storeys: 4 });
  expect(old.terminated).toBe(true);
  expect(useDistrict.getState().month).toBe(0);
  old.emit(stale);
  expect(useDistrict.getState().current).toHaveLength(0);
  FakeWorker.all.at(-1)!.flush();
  d.advance(6);
  FakeWorker.all.at(-1)!.flush();
  expect(useDistrict.getState().month).toBe(6);
  const same = scenarioFile(
    "Same inputs",
    useScenario.getState().plan!,
    network,
    context,
    useScenario.getState().physical,
    useScenario.getState().development,
    useScenario.getState().living,
  );
  s.importPlan(JSON.stringify(same));
  expect(useDistrict.getState().month).toBe(0);
  FakeWorker.all.at(-1)!.flush();
  d.reset();
  expect(useDistrict.getState().month).toBe(0);
  expect(useDistrict.getState().current).toHaveLength(0);
});
it("pauses automatic time without a continuous worker or render loop", () => {
  vi.useFakeTimers();
  const w = activeDistrict(),
    d = useDistrict.getState();
  d.playPause();
  vi.advanceTimersByTime(999);
  expect(w.messages).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(w.messages.at(-1)?.type).toBe("advance");
  w.flush();
  expect(useDistrict.getState().month).toBe(1);
  d.pause();
  const n = w.messages.length;
  vi.advanceTimersByTime(60000);
  expect(w.messages).toHaveLength(n);
  d.inspect(0);
  expect(useDistrict.getState().month).toBe(0);
  expect(w.messages).toHaveLength(n);
});
it("fails safely on invalid worker outputs, preserves plans on failed imports, and bounds messages", () => {
  const w = activeDistrict(),
    d = useDistrict.getState(),
    s = useScenario.getState(),
    before = JSON.stringify(useScenario.getState().development);
  d.advance(6);
  w.flush();
  expect(
    s.importPlan(
      JSON.stringify({
        ...winning,
        living: { ...winning.living, householdSize: 99 },
      }),
    ),
  ).toBe(false);
  expect(useDistrict.getState().month).toBe(6);
  d.advance(1);
  w.emit({
    type: "history",
    generation: w.messages[0].generation,
    current: [{}],
    reference: null,
    computeMs: 1,
  });
  expect(useDistrict.getState().error).not.toBe("");
  expect(useDistrict.getState().current).toHaveLength(0);
  expect(JSON.stringify(useScenario.getState().development)).toBe(before);
});
it("updates activity colours without reallocating positions, topology, ranges or geometry", () => {
  const a = input(),
    g = developmentGeometry(
      a.buildings.map((building) => ({ building, baseY: 1 })),
      () => 1,
    ),
    position = g.body.getAttribute("position"),
    normals = g.body.getAttribute("normal"),
    initial = [...g.body.getAttribute("color").array],
    h = runDistrict(a);
  applyDevelopmentActivity(
    g,
    new Map(h[0].buildings.map((b) => [b.id, b.utilization])),
  );
  const empty = [...g.body.getAttribute("color").array];
  applyDevelopmentActivity(
    g,
    new Map(h[6].buildings.map((b) => [b.id, b.utilization])),
  );
  expect([...g.body.getAttribute("color").array]).not.toEqual(empty);
  expect(g.body.getAttribute("position")).toBe(position);
  expect(g.body.getAttribute("normal")).toBe(normals);
  applyDevelopmentActivity(g, null);
  expect([...g.body.getAttribute("color").array]).toEqual(initial);
  g.body.dispose();
  g.edges.dispose();
});
it("compares independently simulated development inputs over exactly the same month and caches past inspection", () => {
  const w = activeDistrict(),
    s = useScenario.getState(),
    storage = memory(),
    d = useDistrict.getState();
  s.save(storage);
  const id = useScenario.getState().currentId!;
  s.putBuilding({ ...winning.development.proposals[0], storeys: 2 });
  s.setReference(id);
  const current = FakeWorker.all.at(-1)!;
  expect(w.terminated).toBe(true);
  current.flush();
  d.advance(6);
  current.flush();
  const state = useDistrict.getState();
  expect(state.current).toHaveLength(7);
  expect(state.reference).toHaveLength(7);
  expect(state.current[6].occupiedHouseholds).toBeLessThan(
    state.reference![6].occupiedHouseholds,
  );
  const calls = current.messages.length;
  d.inspect(2);
  d.advance(1);
  expect(useDistrict.getState().month).toBe(3);
  expect(current.messages).toHaveLength(calls);
  d.advance(24);
  expect(current.messages.at(-1)).toMatchObject({ type: "advance", month: 24 });
  current.flush();
  expect(useDistrict.getState().month).toBe(24);
  d.advance(1);
  expect(current.messages.at(-1)).toMatchObject({ month: 24 });
});
