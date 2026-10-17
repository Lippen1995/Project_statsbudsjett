import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { runDistrict, DistrictSimulation } from "../src/district/engine";
import {
  districtInput,
  capacities,
  validateHistory,
  defaultLiving,
} from "../src/district/model";
import {
  defaultManagement,
  validateManagement,
  syncManagement,
  BUDGET_RULES,
} from "../src/management/model";
import { ConstructionSimulation } from "../src/management/construction";
import {
  fundOperations,
  installment,
  capitalIdentity,
  operatingIdentity,
} from "../src/management/finance";
import { validateManagementMonth } from "../src/management/validation";
import {
  parseScenario,
  scenarioFile,
  STORAGE_KEY,
  readLibrary,
} from "../src/planning/scenarios";
import { buildNetwork } from "../src/simulation/network";
import { placementContext } from "../src/physical/model";
import { useScenario } from "../src/state/scenario";
import { useDistrict } from "../src/state/district";
import { DistrictRunner, type DistrictCommand } from "../src/district/protocol";
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const example = read("../public/plans/sustainable-quarter-example.json");
const source = read("../public/data/bryggen-transport.json"),
  city = read("../public/data/bergen.json"),
  network = buildNetwork(source),
  context = placementContext(city, network);
const clone = <T>(v: T): T => structuredClone(v);
const input = (f = example) =>
  districtInput(f.living, f.development.proposals, f.management);
const run = (f = example) => runDistrict(input(f));
it("commissions only after full work duration, before that month's uptake", () => {
  const h = run();
  expect(h[0].management!.projects.every((p) => p.phase === "planned")).toBe(
    true,
  );
  expect(
    h[1].management!.projects.every((p) => p.phase === "under-construction"),
  ).toBe(true);
  expect(h[2].employmentCapacity).toBe(0);
  expect(h[3].employmentCapacity).toBe(19);
  expect(h[3].householdCapacity).toBe(0);
  expect(h[4].householdCapacity).toBe(7);
  expect(h[4].occupiedHouseholds).toBeGreaterThan(0);
  expect(h[4].serviceCapacity).toBe(0);
  expect(h[5].serviceCapacity).toBe(19);
  expect(
    h[5].management!.projects.every((p) => p.phase === "operational"),
  ).toBe(true);
  expect(validateHistory(h, input())).toEqual(h);
});
it("preserves every historical 5A output exactly, including explicit legacy migration", () => {
  const sample = read(
    "../../../docs/bergen-simulator/milestone-5a-evidence/sample-24-months.json",
  );
  expect(runDistrict(sample.input)).toEqual(sample.months);
  const m = defaultManagement(sample.input.buildings, true);
  expect(
    runDistrict(districtInput(sample.input.living, sample.input.buildings, m)),
  ).toEqual(sample.months);
  expect(
    m.projects.every((p) => p.startMonth === 0 && p.durationMonths === 0),
  ).toBe(true);
});
it("is deterministic across incremental advances, reset and copied inputs", () => {
  const a = new DistrictSimulation(input());
  a.advanceTo(6);
  a.advanceTo(12);
  expect(a.advanceTo(24)).toEqual(run());
  expect(a.reset()).toEqual(run()[0]);
  expect(a.advanceTo(24)).toEqual(run());
  expect(() => a.step()).toThrow("24-month");
});
it("reserves full civic cost and reconciles installments to integer subunits", () => {
  const h = run(),
    m = h[1].management!;
  expect([
    m.capitalCommittedCents,
    m.capitalSpentCents,
    m.capitalReservedCents,
    m.capitalBalanceCents,
    m.capitalFreeCents,
  ]).toEqual([76800, 19200, 57600, 80800, 23200]);
  expect(h[4].management!.capitalReservedCents).toBe(0);
  expect(h[4].management!.totalCapitalSpentCents).toBe(76800);
  for (const cost of [0, 1, 10001, 123457])
    for (const d of [1, 3, 7, 12])
      expect(
        Array.from({ length: d }, (_, i) => installment(cost, d, i + 1)).reduce(
          (a, b) => a + b,
          0,
        ),
      ).toBe(cost);
});
it("conserves separate funds, reservations and requirements every month", () => {
  for (const r of run()) {
    const m = r.management!,
      b = example.management.budget;
    expect(
      capitalIdentity(
        b,
        r.month,
        m.capitalBalanceCents,
        m.totalCapitalSpentCents,
      ),
    ).toBe(true);
    expect(
      operatingIdentity(
        b,
        r.month,
        m.operatingBalanceCents,
        m.totalOperatingSpentCents,
      ),
    ).toBe(true);
    expect(m.capitalBalanceCents).toBeGreaterThanOrEqual(
      m.capitalReservedCents,
    );
    expect(m.operatingBalanceCents).toBeGreaterThanOrEqual(0);
    expect(m.totalCapitalCommittedCents).toBe(
      m.totalCapitalSpentCents +
        m.totalCapitalReleasedCents +
        m.capitalReservedCents,
    );
    expect(m.operatingSpentCents + m.operatingShortfallCents).toBe(
      m.operatingRequiredCents,
    );
  }
});
it("defers unfunded civic work until full funding exists and shifts actual commissioning", () => {
  const f = clone(example);
  f.management.budget.startingCapital = 0;
  f.management.budget.monthlyCapital = 100;
  const h = run(f);
  expect(h[7].management!.projects[2].phase).toBe("planned");
  expect(h[7].management!.projects[2].deferred).toBe(true);
  expect(h[7].management!.capitalFundingGapCents).toBe(6800);
  expect(h[8].management!.projects[2].actualStart).toBe(8);
  expect(h[8].management!.projects[2].commissionMonth).toBe(12);
  expect(h[11].serviceCapacity).toBe(0);
  expect(h[12].serviceCapacity).toBe(19);
  expect(validateHistory(h, input(f))).toEqual(h);
});
it("does not charge private construction to public accounts", () => {
  const f = clone(example);
  f.management.budget.startingCapital = 0;
  f.management.budget.monthlyOperating = 0;
  const h = run(f);
  expect(h[24].householdCapacity).toBe(7);
  expect(h[24].employmentCapacity).toBe(19);
  expect(h[24].management!.totalCapitalSpentCents).toBe(0);
  expect(h[24].management!.projects[2].deferred).toBe(true);
});
it("cancels before completion, releasing reserves without refunding sunk expenditure", () => {
  const f = clone(example);
  f.management.projects[2].cancelMonth = 3;
  const h = run(f);
  expect(h[3].management!.capitalReleasedCents).toBe(38400);
  expect(h[3].management!.totalCapitalSpentCents).toBe(38400);
  expect(h[3].management!.capitalBalanceCents).toBe(61600);
  expect(h[24].serviceCapacity).toBe(0);
  expect(h[3].management!.projects[2].phase).toBe("cancelled");
  expect(validateHistory(h, input(f))).toEqual(h);
  f.management.projects[2].cancelMonth = 1;
  expect(run(f)[24].management!.totalCapitalSpentCents).toBe(0);
});
it("respects investment priority and a stable ID tie-break without altering geometry", () => {
  const f = clone(example);
  f.development.proposals.forEach(
    (b: { purpose: string }) => (b.purpose = "civic"),
  );
  f.management.budget.startingCapital = 1200;
  f.management.projects[2].priority = 1;
  expect(run(f)[1].management!.projects.map((p) => p.phase)).toEqual([
    "planned",
    "planned",
    "under-construction",
  ]);
  f.management.projects[2].priority = 8;
  f.management.projects[0].priority = 1;
  const b = run(f);
  expect(b[1].management!.projects.map((p) => p.phase)).toEqual([
    "under-construction",
    "planned",
    "planned",
  ]);
  f.management.projects.reverse();
  expect(run(f)).toEqual(b);
});
it("distinguishes physical potential, funded capacity, utilization and unmet services", () => {
  const f = clone(example);
  f.management.budget.monthlyOperating = 0;
  const h = run(f),
    healthy = run();
  expect(h[5].management!.potentialServiceCapacity).toBe(19);
  expect(h[5].serviceCapacity).toBe(0);
  expect(h[5].management!.operatingRequiredCents).toBe(3800);
  expect(h[5].management!.operatingShortfallCents).toBe(3800);
  expect(h[12].unmetService).toBeGreaterThan(0);
  expect(h[12].occupiedHouseholds).toBeLessThan(healthy[12].occupiedHouseholds);
  expect(h[12].filledJobs).toBeLessThan(healthy[12].filledJobs);
});
it("carries operating balances and funds partial capacity when reserves run down", () => {
  const f = clone(example);
  f.management.budget.monthlyOperating = 10;
  const h = run(f);
  expect(h[4].management!.operatingBalanceCents).toBe(4000);
  expect([
    h[5].serviceCapacity,
    h[6].serviceCapacity,
    h[7].serviceCapacity,
  ]).toEqual([19, 11, 5]);
  expect(h[7].management!.operatingShortfallCents).toBe(2800);
  expect(h[7].management!.operatingBalanceCents).toBe(0);
  expect(validateHistory(h, input(f))).toEqual(h);
});
it("pays for commissioned readiness even when demand uses no services", () => {
  const f = clone(example);
  f.living.householdArrivals = 0;
  const r = run(f)[5];
  expect(r.usedService).toBe(0);
  expect(r.management!.operatingSpentCents).toBe(3800);
});
it("different schedules produce different month-12/24 outcomes through the common recurrence", () => {
  const f = clone(example);
  f.management.projects[0].startMonth = 15;
  f.management.projects[0].durationMonths = 5;
  f.management.projects[2].startMonth = 12;
  const a = run(),
    b = run(f);
  expect(a[12].occupiedHouseholds).toBeGreaterThan(b[12].occupiedHouseholds);
  expect(a[24].occupiedHouseholds).toBeGreaterThan(b[24].occupiedHouseholds);
  expect(a[24].filledJobs).toBeGreaterThan(b[24].filledJobs);
  if (process.env.BERGEN_EVIDENCE === "1") {
    const u = clone(example);
    u.management.budget.monthlyOperating = 0;
    mkdirSync("artifacts/milestone-5b", { recursive: true });
    writeFileSync(
      "artifacts/milestone-5b/strategies-24-months.json",
      JSON.stringify(
        {
          interpretation:
            "Fictional PMU and synthetic expected-value district only, not Bergen finances or forecasts.",
          early: { input: input(), months: a },
          late: { input: input(f), months: b },
          underfunded: { input: input(u), months: run(u) },
        },
        null,
        2,
      ) + "\n",
    );
  }
});
it("bounds unfinished construction beyond month 24 without granting capacity", () => {
  const f = clone(example);
  f.management.projects.forEach(
    (p: { startMonth: number; durationMonths: number }) => {
      p.startMonth = 24;
      p.durationMonths = 12;
    },
  );
  const h = run(f);
  expect(h).toHaveLength(25);
  expect(h[24].occupiedHouseholds).toBe(0);
  expect(
    h[24].management!.projects.every((p) => p.phase === "under-construction"),
  ).toBe(true);
});
it("rejects invalid schedules, derived flags, fractional budgets and unsupported costs", () => {
  for (const [key, r] of Object.entries(BUDGET_RULES))
    for (const v of [NaN, Infinity, -1, r.max + 1, 0.5]) {
      const m = clone(example.management);
      m.budget[key] = v;
      expect(() =>
        validateManagement(m, example.development.proposals),
      ).toThrow();
    }
  for (const patch of [
    { startMonth: 0 },
    { durationMonths: 0 },
    { durationMonths: 13 },
    { priority: 0 },
    { cancelMonth: 5 },
    { startMonth: 1.5 },
    { ready: true },
  ]) {
    const m = clone(example.management);
    Object.assign(m.projects[2], patch);
    expect(() =>
      validateManagement(m, example.development.proposals),
    ).toThrow();
  }
  const m = clone(example.management);
  m.projects.pop();
  expect(() => validateManagement(m, example.development.proposals)).toThrow();
  expect(() =>
    validateManagement(
      { ...example.management, completed: true },
      example.development.proposals,
    ),
  ).toThrow();
  expect(() => fundOperations(-1, 1, 1, 1)).toThrow();
  expect(() => fundOperations(0, 1, 1, 0)).toThrow();
  expect(() => installment(100, 0, 1)).toThrow();
});
it("owns and freezes inputs/results without mutating geographic sources", () => {
  const f = clone(example),
    a = input(f),
    before = JSON.stringify([city, source, f]);
  const s = new ConstructionSimulation(
    f.management,
    f.development.proposals,
    capacities(a),
  );
  f.development.proposals[2].storeys = 6;
  f.management.budget.startingCapital = 0;
  const m = s.step();
  expect(m.capitalCommittedCents).toBe(76800);
  expect(Object.isFrozen(m.projects[0])).toBe(true);
  expect(() => {
    m.projects[0].phase = "operational";
  }).toThrow();
  f.development.proposals[2].storeys = 2;
  f.management.budget.startingCapital = 1000;
  expect(JSON.stringify([city, source, f])).toBe(before);
});
it("rejects malformed financial worker outputs and broken history reconciliation", () => {
  const h = run(),
    a = input(),
    bad = clone(h);
  bad[6].management!.operatingBalanceCents++;
  expect(() => validateHistory(bad, a)).toThrow();
  const forged = clone(h[1].management!);
  forged.projects[0].phase = "operational";
  expect(() =>
    validateManagementMonth(
      forged,
      example.management,
      example.development.proposals,
      capacities(a),
      1,
    ),
  ).toThrow();
  const broken = clone(h);
  broken[5].management!.capitalSpentCents++;
  expect(() => validateHistory(broken, a)).toThrow();
});
it("bounds repeated eight-building runs, histories and computation", () => {
  const start = performance.now(),
    buildings = Array.from({ length: 8 }, (_, i) => ({
      ...example.development.proposals[i % 3],
      id: `bounded-${i}`,
    }));
  for (let i = 0; i < 30; i++) {
    const m = defaultManagement(buildings);
    m.budget.startingCapital = i % 2 ? 100000 : 0;
    m.budget.monthlyOperating = i % 3 ? 10000 : 0;
    const a = districtInput(defaultLiving(), buildings, m),
      s = new DistrictSimulation(a);
    expect(validateHistory(s.advanceTo(24), a)).toHaveLength(25);
    s.reset();
    expect(s.history()).toHaveLength(1);
  }
  expect(performance.now() - start).toBeLessThan(5000);
});
it("imports version 5 and atomically rejects forged outcomes and bad schedules", () => {
  expect(parseScenario(JSON.stringify(example), network, context).version).toBe(
    5,
  );
  const s = useScenario.getState();
  s.open(source, city);
  expect(s.importPlan(JSON.stringify(example))).toBe(true);
  const before = JSON.stringify(useScenario.getState().management);
  for (const bad of [
    { ...example, balances: {} },
    { ...example, management: { ...example.management, completed: true } },
    { ...example, management: { ...example.management, projects: [] } },
  ])
    expect(s.importPlan(JSON.stringify(bad))).toBe(false);
  expect(JSON.stringify(useScenario.getState().management)).toBe(before);
});
it("preserves all legacy designs/storage and exports explicit zero-month commissioning", () => {
  for (const name of [
    "rethinking",
    "waterfront",
    "urban-quarter",
    "living-quarter",
  ]) {
    const file = read(`../public/plans/${name}-example.json`),
      raw = JSON.stringify({
        version: 1,
        plans: [{ id: "old", savedAt: "2026-10-17T00:00:00Z", scenario: file }],
      }),
      storage = { getItem: () => raw, setItem: vi.fn() };
    expect(readLibrary(storage, network, context).plans[0].scenario).toEqual(
      file,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    const s = useScenario.getState();
    s.open(source, city);
    expect(s.importPlan(JSON.stringify(file))).toBe(true);
    const state = useScenario.getState(),
      out = scenarioFile(
        state.name,
        state.plan!,
        network,
        context,
        state.physical,
        state.development,
        state.living,
        state.management,
      );
    expect(out.version).toBe(5);
    expect(out.development?.proposals ?? []).toEqual(
      file.development?.proposals ?? [],
    );
    expect(out.management!.mode).toBe("legacy-immediate");
    expect(
      out.management!.projects.every(
        (p) => p.startMonth === 0 && p.durationMonths === 0,
      ),
    ).toBe(true);
  }
});
it("synchronizes schedules with building edits, shared undo/redo and local replay", () => {
  const s = useScenario.getState();
  s.open(source, city);
  s.importPlan(JSON.stringify(example));
  const m = clone(example.management);
  m.projects[0].startMonth = 5;
  expect(s.editManagement(m)).toBe(true);
  s.undo();
  expect(useScenario.getState().management.projects[0].startMonth).toBe(1);
  s.redo();
  expect(useScenario.getState().management.projects[0].startMonth).toBe(5);
  s.removeBuilding("study-1");
  expect(useScenario.getState().management.projects).toHaveLength(2);
  s.undo();
  expect(useScenario.getState().management.projects).toHaveLength(3);
  let data: string | null = null;
  const storage = {
    getItem: () => data,
    setItem: (k: string, v: string) => {
      expect(k).toBe(STORAGE_KEY);
      data = v;
    },
  };
  expect(s.save(storage)).toBe(true);
  const saved = JSON.parse(data!).plans[0];
  expect(saved.scenario.version).toBe(5);
  expect(saved.scenario.management.projects[0].startMonth).toBe(5);
  expect(run(saved.scenario)).toEqual(run({ ...example, management: m }));
  expect(syncManagement(m, example.development.proposals).projects).toEqual(
    m.projects,
  );
});
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: DistrictCommand[] = [];
  runner = new DistrictRunner();
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: DistrictCommand) {
    this.messages.push(clone(m));
  }
  terminate() {
    this.terminated = true;
  }
  flush() {
    const r = this.runner.handle(this.messages.at(-1));
    if (r) this.onmessage?.({ data: { ...r, computeMs: 1 } });
  }
}
afterEach(() => {
  useDistrict.getState().close();
  useScenario.getState().close();
  vi.unstubAllGlobals();
  FakeWorker.all = [];
});
it("rejects stale worker generations after budget edits and preserves time on invalid import", () => {
  vi.stubGlobal("Worker", FakeWorker);
  const s = useScenario.getState();
  s.open(source, city);
  s.importPlan(JSON.stringify(example));
  const d = useDistrict.getState();
  d.open();
  const w = FakeWorker.all.at(-1)!;
  w.flush();
  d.advance(6);
  w.flush();
  expect(useDistrict.getState().month).toBe(6);
  expect(
    s.importPlan(
      JSON.stringify({
        ...example,
        management: {
          ...example.management,
          budget: { ...example.management.budget, monthlyOperating: -1 },
        },
      }),
    ),
  ).toBe(false);
  expect(useDistrict.getState().month).toBe(6);
  const old = clone(useDistrict.getState().current),
    m = clone(example.management);
  m.budget.monthlyOperating = 0;
  s.editManagement(m);
  expect(w.terminated).toBe(true);
  w.onmessage?.({
    data: {
      type: "history",
      generation: w.messages[0].generation,
      current: old,
      reference: null,
      computeMs: 1,
    },
  });
  expect(useDistrict.getState().current).toHaveLength(0);
  FakeWorker.all.at(-1)!.flush();
  expect(useDistrict.getState().month).toBe(0);
});

it("proves Sustainable Quarter feasible through geometry and the common engine, without rewarding budget hoarding", async () => {
  const { sustainableQuarter } = await import("../src/management/challenge");
  const evaluate = (f = example) =>
    sustainableQuarter(
      f.development,
      f.physical,
      context,
      f.living,
      f.management,
      run(f),
    );
  const verdict = evaluate();
  expect(verdict.passed).toBe(true);
  expect(verdict.checks.every(Boolean)).toBe(true);
  expect(verdict.householdMonths).toBeGreaterThan(90);
  for (const purpose of ["residential", "commercial", "civic"]) {
    const f = clone(example);
    f.development.proposals.forEach(
      (b: { purpose: string }) => (b.purpose = purpose),
    );
    expect(evaluate(f).passed).toBe(false);
  }
  const late = clone(example);
  late.management.projects.forEach(
    (p: { startMonth: number; durationMonths: number }) => {
      p.startMonth = 24;
      p.durationMonths = 12;
    },
  );
  expect(evaluate(late).passed).toBe(false);
  const oversized = clone(example);
  oversized.development.proposals[2].storeys = 6;
  expect(evaluate(oversized).passed).toBe(false);
  const unfunded = clone(example);
  unfunded.management.budget.startingCapital = 0;
  expect(evaluate(unfunded).passed).toBe(false);
  expect(run(unfunded)[24].management!.totalCapitalSpentCents).toBe(0);
  const operating = clone(example);
  operating.management.budget.monthlyOperating = 0;
  expect(evaluate(operating).passed).toBe(false);
  const rich = clone(example);
  rich.management.budget.startingCapital = 100000;
  expect(evaluate(rich).passed).toBe(false);
  const cheap = clone(example);
  cheap.management.budget.civicCapitalPerM2 = 1;
  expect(evaluate(cheap).passed).toBe(false);
  const legacy = clone(example);
  legacy.management = defaultManagement(legacy.development.proposals, true);
  expect(evaluate(legacy).passed).toBe(false);
});
it("uses a reusable bounded index/colour batch for stages and preserves original triangle selection identities", async () => {
  const { developmentGeometry, applyDevelopmentActivity } =
    await import("../src/geo/development");
  const g = developmentGeometry(
    example.development.proposals.map(
      (building: (typeof example.development.proposals)[number]) => ({
        building,
        baseY: 1,
      }),
    ),
    () => 1,
  );
  const positions = g.body.getAttribute("position"),
    normals = g.body.getAttribute("normal"),
    index = g.body.getIndex()!,
    edge = g.edges.getAttribute("color"),
    count = index.count,
    colors = [...g.body.getAttribute("color").array];
  const phase = (
    v: "planned" | "under-construction" | "operational" | "cancelled",
  ) =>
    new Map<string, typeof v>(
      example.development.proposals.map((b: { id: string }) => [b.id, v]),
    );
  applyDevelopmentActivity(g, null, undefined, phase("planned"));
  expect(g.body.drawRange.count).toBe(0);
  applyDevelopmentActivity(g, null, undefined, phase("under-construction"));
  expect(g.body.drawRange.count).toBe(count);
  const construction = [...g.body.getAttribute("color").array];
  applyDevelopmentActivity(
    g,
    new Map([["study-0", 0.9]]),
    undefined,
    phase("operational"),
  );
  expect([...g.body.getAttribute("color").array]).not.toEqual(construction);
  const selective = phase("planned");
  selective.set("study-1", "operational");
  applyDevelopmentActivity(g, null, undefined, selective);
  const originalTriangle = index.getX(0) / 3;
  expect(g.ranges.find((r) => originalTriangle < r.end)!.id).toBe("study-1");
  for (let i = 0; i < 30; i++) {
    applyDevelopmentActivity(
      g,
      null,
      undefined,
      phase(i % 2 ? "planned" : "operational"),
    );
    expect(g.body.getIndex()).toBe(index);
    expect(g.body.getAttribute("position")).toBe(positions);
    expect(g.body.getAttribute("normal")).toBe(normals);
    expect(g.edges.getAttribute("color")).toBe(edge);
  }
  applyDevelopmentActivity(g, null);
  expect(g.body.drawRange.count).toBe(count);
  expect([...g.body.getAttribute("color").array]).toEqual(colors);
  g.body.dispose();
  g.edges.dispose();
});
it("starts fresh plans with scheduled projects and preserves an explicit legacy plan when adding buildings", () => {
  const s = useScenario.getState();
  s.open(source, city);
  expect(useScenario.getState().management.mode).toBe("scheduled");
  expect(s.putBuilding(example.development.proposals[0])).toBe(true);
  expect(useScenario.getState().management.projects[0].durationMonths).toBe(3);
  s.importPlan(
    JSON.stringify(read("../public/plans/living-quarter-example.json")),
  );
  s.putBuilding({ ...example.development.proposals[0], storeys: 2 });
  expect(
    useScenario
      .getState()
      .management.projects.every((p) => p.durationMonths === 0),
  ).toBe(true);
});
it("rejects management replies with valid stock totals but forged budget balances", () => {
  vi.stubGlobal("Worker", FakeWorker);
  const s = useScenario.getState();
  s.open(source, city);
  s.importPlan(JSON.stringify(example));
  const d = useDistrict.getState();
  d.open();
  const w = FakeWorker.all.at(-1)!;
  w.flush();
  d.advance(6);
  const response = w.runner.handle(w.messages.at(-1))!;
  response.current[6] = clone(response.current[6]);
  response.current[6].management!.operatingBalanceCents++;
  w.onmessage?.({ data: { ...response, computeMs: 1 } });
  expect(useDistrict.getState().error).not.toBe("");
  expect(useDistrict.getState().current).toHaveLength(0);
  expect(useScenario.getState().management).toEqual(example.management);
});
