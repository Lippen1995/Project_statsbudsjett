import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { expect, it } from "vitest";
import { placementContext } from "../src/physical/model";
import { footprint } from "../src/physical/buildings";
import { buildNetwork } from "../src/simulation/network";
import {
  accessPlacement,
  attachmentPoints,
  type AccessConnection,
} from "../src/access/model";
const city = JSON.parse(readFileSync("public/data/bergen.json", "utf8")),
  source = JSON.parse(
    readFileSync("public/data/bryggen-transport.json", "utf8"),
  ),
  example = JSON.parse(
    readFileSync("public/plans/sustainable-quarter-example.json", "utf8"),
  ),
  c = placementContext(city, buildNetwork(source));
it("audits real proposed portals against unchanged source geometry", () => {
  const valid: unknown[] = [];
  const near: unknown[] = [];
  for (const b of example.development.proposals) {
    const ring = footprint(b);
    for (const target of attachmentPoints(c.network))
      for (let side = 0; side < 4; side++)
        for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const a = ring[side],
            end = ring[(side + 1) % 4],
            start: [number, number] = [
              a[0] + (end[0] - a[0]) * f,
              a[1] + (end[1] - a[1]) * f,
            ];
          if (
            Math.hypot(start[0] - target.point[0], start[1] - target.point[1]) >
            80
          )
            continue;
          const access: AccessConnection = {
            id: "audit-" + b.id,
            buildingId: b.id,
            mode: "vehicle",
            nodeId: target.id,
            points: [start, target.point],
          };
          const r = accessPlacement(
            access,
            c,
            example.development,
            example.physical,
          );
          if (r.valid) valid.push({ access, ...r });
          else if (r.errors.length < 3) near.push({ access, ...r });
        }
  }
  mkdirSync("artifacts/milestone-5d", { recursive: true });
  writeFileSync(
    "artifacts/milestone-5d/access-audit.json",
    JSON.stringify({ valid, near }, null, 2),
  );
  expect(valid.length).toBeGreaterThan(0);
});
import { emptyAccess, validateAccess } from "../src/access/model";
import { defaultMobility } from "../src/access/demand";
import { defaultManagement } from "../src/management/model";
import { runConnected } from "../src/access/run";
import { emptyPlan } from "../src/simulation/interventions";
it("proves a connected playable quarter through common district and traffic engines", () => {
  const plan = structuredClone(example);
  plan.name = "Connected New Quarter";
  plan.version = 6;
  plan.development.proposals[1].purpose = "civic";
  plan.development.proposals[1].name = "Community pavilion";
  plan.development.proposals[1].storeys = 2;
  plan.development.proposals[2].purpose = "commercial";
  plan.development.proposals[2].name = "Quay workspace";
  plan.development.proposals[2].storeys = 3;
  plan.management = defaultManagement(plan.development.proposals);
  plan.plan = emptyPlan(c.network);
  const nodes = attachmentPoints(c.network);
  plan.access = {
    ...emptyAccess(c),
    connections: [
      {
        id: "homes-access",
        buildingId: "study-0",
        mode: "vehicle",
        nodeId: "4933873322",
        points: [[-101, -317], nodes.find((n) => n.id === "4933873322")!.point],
      },
      {
        id: "work-access",
        buildingId: "study-2",
        mode: "vehicle",
        nodeId: "645523",
        points: [[15, -213], nodes.find((n) => n.id === "645523")!.point],
      },
    ],
  };
  plan.mobility = { ...defaultMobility(), enabled: true, month: 24 };
  validateAccess(plan.access, c, plan.development, plan.physical);
  const result = runConnected({ ...plan, version: 1, context: c });
  mkdirSync("artifacts/milestone-5d", { recursive: true });
  writeFileSync(
    "artifacts/milestone-5d/connected-example-results.json",
    JSON.stringify(result, null, 2),
  );
  expect(result.challenge.passed).toBe(true);
  expect(plan).toEqual(connected());
  if (process.env.BERGEN_EVIDENCE)
    writeFileSync(
      "public/plans/connected-quarter-example.json",
      JSON.stringify(plan, null, 2) + "\n",
    );
});
import { afterEach, vi } from "vitest";
import { parseScenario, scenarioFile } from "../src/planning/scenarios";
import { generateTrips, validateMobility } from "../src/access/demand";
import { runDistrict } from "../src/district/engine";
import { districtInput } from "../src/district/model";
import {
  TrafficSimulation,
  TOTAL_TICKS,
  DEMAND,
} from "../src/simulation/engine";
import { clipSegment, corridor, heightAt } from "../src/access/model";
import { startConnected } from "../src/access/client";
import { useScenario } from "../src/state/scenario";
const connected = () =>
  JSON.parse(
    readFileSync("public/plans/connected-quarter-example.json", "utf8"),
  );
const input = () => ({ ...connected(), version: 1 as const, context: c });
afterEach(() => {
  useScenario.getState().close();
  vi.useRealTimers();
});
it("is deterministic, input-only and cannot mutate observed or proposed records", () => {
  const original = JSON.stringify([city, source, c]);
  const i = input(),
    copy = JSON.stringify(i);
  expect(runConnected(i)).toEqual(runConnected(i));
  expect(JSON.stringify(i)).toBe(copy);
  expect(JSON.stringify([city, source, c])).toBe(original);
  const parsed = parseScenario(JSON.stringify(connected()), c.network, c);
  expect(parsed.version).toBe(6);
  expect(parsed).not.toHaveProperty("result");
});
it("has exact old traffic outcomes when disabled and keeps versions 1–5 unchanged", () => {
  const sim = new TrafficSimulation(c.network);
  for (let t = 0; t < TOTAL_TICKS; t++) sim.step();
  const i = input();
  i.mobility.enabled = false;
  const r = runConnected(i);
  expect(r.combined).toEqual(sim.snapshot());
  expect(r.ledger.generated).toBe(0);
  for (const name of [
    "rethinking-example.json",
    "waterfront-example.json",
    "urban-quarter-example.json",
    "living-quarter-example.json",
    "sustainable-quarter-example.json",
  ]) {
    const raw = readFileSync("public/plans/" + name, "utf8");
    const p = parseScenario(raw, c.network, c);
    expect(JSON.stringify(p)).toBe(JSON.stringify(JSON.parse(raw)));
    expect(p.access).toBeUndefined();
  }
});
it("samples actual operational stock; monthly stocks are not monthly trip volumes", () => {
  const i = input();
  i.mobility.month = 0;
  expect(runConnected(i).ledger.generated).toBe(0);
  i.mobility.month = 3;
  const early = runConnected(i);
  expect(early.ledger.sites.find((b) => b.id === "study-0")!.generated).toBe(0);
  i.mobility.month = 24;
  const late = runConnected(i);
  expect(late.ledger.generated).toBeGreaterThan(early.ledger.generated);
  const state = runDistrict(
    districtInput(i.living, i.development.proposals, i.management),
    24,
  ).at(-1)!;
  const { ledger, demand } = generateTrips(
    i.mobility,
    state,
    i.development,
    i.access,
    c.network,
  );
  expect(ledger.continuousTripEnds).toBeCloseTo(
    state.occupiedHouseholds * i.mobility.householdTripEnds +
      state.filledJobs * i.mobility.jobTripEnds,
  );
  expect(
    demand.reduce((n, d) => n + d.tickVehicles!.reduce((a, b) => a + b, 0), 0),
  ).toBe(ledger.assigned);
});
it("reports pedestrian-only and missing access as blocked, never disappearing traffic or challenge credit", () => {
  const i = input();
  i.access.connections[0].mode = "pedestrian";
  let r = runConnected(i);
  expect(r.ledger.blocked).toBe(7);
  expect(r.ledger.unrouted).toBe(7);
  expect(r.challenge.passed).toBe(false);
  i.access.connections = [];
  r = runConnected(i);
  expect(r.ledger.unrouted).toBe(r.ledger.generated);
  expect(r.ledger.assigned).toBe(0);
  expect(r.combined.requested).toBe(960);
});
it("accounts for capping, deterministic rounding and all requested/routed/unrouted trips", () => {
  const i = input();
  i.mobility.cap = 5;
  const a = runConnected(i);
  expect(a.ledger.capped).toBe(8);
  expect(a.ledger.generated).toBe(a.ledger.requested + a.ledger.capped);
  expect(a.ledger.requested).toBe(a.ledger.routed + a.ledger.unrouted);
  expect(a.challenge.passed).toBe(false);
  expect(a.ledger.sites).toEqual(runConnected(i).ledger.sites);
});
it("lets changed construction/activity produce actual common-engine road demand changes", () => {
  const i = input(),
    a = runConnected(i);
  i.development.proposals[0].storeys = 2;
  const b = runConnected(i);
  expect(b.occupiedHouseholds).toBeLessThan(a.occupiedHouseholds);
  expect(b.ledger.generated).toBeLessThan(a.ledger.generated);
  expect(b.combined.edgeVehicles).not.toEqual(a.combined.edgeVehicles);
  i.management.projects.forEach(
    (p: { startMonth: number }) => (p.startMonth = 24),
  );
  expect(runConnected(i).ledger.generated).toBe(0);
});
it("respects closed/local/service road rules and accounts for unavailable routes", () => {
  const i = input();
  i.plan.interventions = c.network.edges
    .map((e) => ({
      segmentId: [e.wayId, ...[e.from, e.to].sort()].join(":"),
      access: "closed",
      capacityFactor: 1,
    }))
    .filter(
      (e, index, list) =>
        list.findIndex((v) => v.segmentId === e.segmentId) === index,
    );
  const r = runConnected(i);
  expect(r.ledger.unrouted).toBe(r.ledger.generated);
  expect(r.combined.unrouted).toBe(960 + r.ledger.generated);
  expect(r.challenge.passed).toBe(false);
});
it("rejects source-node spoofing, interior source nodes and the inactive candidate graph", () => {
  const i = input();
  for (const id of ["fake-junction", "645522", "999999999999"]) {
    const a = structuredClone(i.access);
    a.connections[0].nodeId = id;
    expect(() => validateAccess(a, c, i.development, i.physical)).toThrow();
  }
  const a = structuredClone(i.access);
  a.connections[0].points.at(-1)![0] += 0.01;
  expect(() => validateAccess(a, c, i.development, i.physical)).toThrow(
    /final point/,
  );
});
it("rejects water, missing terrain, observed/proposed buildings, coast and other access collisions", () => {
  const i = input(),
    a = i.access.connections[0],
    check = (
      ctx = c,
      d = i.development,
      p = i.physical,
      o: AccessConnection[] = [],
    ) => accessPlacement(a, ctx, d, p, o);
  expect(check({ ...c, triangles: [] }).valid).toBe(false);
  const strip = corridor(a.points[0], a.points[1], 3);
  expect(check({ ...c, water: [[strip]] }).valid).toBe(false);
  expect(check({ ...c, coastline: [a.points] }).valid).toBe(false);
  expect(
    check({
      ...c,
      buildings: [
        {
          id: "observed-fixture",
          rings: [strip],
          box: [-150, -330, -90, -300],
        },
      ],
    }).errors.join(" "),
  ).toMatch(/Observed building/);
  expect(
    check(c, i.development, i.physical, [
      { ...a, id: "duplicate-corridor", buildingId: "study-2" },
    ]).valid,
  ).toBe(false);
});
it("checks exact short road crossings and full corridor width, slope and continuity", () => {
  const rect = corridor([0, 0], [5, 0], 3);
  expect(clipSegment([2, -2], [2, 2], rect)).toHaveLength(2);
  expect(clipSegment([7, -2], [7, 2], rect)).toEqual([]);
  const i = input(),
    a = i.access.connections[0];
  expect(
    accessPlacement(
      a,
      { ...c, triangles: c.triangles.map((t) => ({ ...t, grade: 0.5 })) },
      i.development,
      i.physical,
    ).valid,
  ).toBe(false);
  expect(heightAt(c, [-1000, -1000])).toBeNull();
});
it("bounds geometry, duplicate modes, access count, schema fields and mobility inputs before calculation", () => {
  const i = input();
  for (const bad of [
    { ...i.access, valid: true },
    { ...i.access, connections: Array(9).fill(i.access.connections[0]) },
    {
      ...i.access,
      connections: [
        {
          ...i.access.connections[0],
          points: [
            [1e200, 0],
            [0, 0],
          ],
        },
      ],
    },
    {
      ...i.access,
      connections: [
        i.access.connections[0],
        { ...i.access.connections[0], id: "duplicate-mode" },
      ],
    },
  ])
    expect(() => validateAccess(bad, c, i.development, i.physical)).toThrow();
  for (const bad of [
    { ...i.mobility, month: 25 },
    { ...i.mobility, cap: 241 },
    { ...i.mobility, gatewayId: "645523" },
    { ...i.mobility, jobTripEnds: NaN },
    { ...i.mobility, derivedTrips: 13 },
  ])
    expect(() => validateMobility(bad, c.network)).toThrow();
});
it("shared undo/redo, persistence and invalid imports are atomic across access and buildings", () => {
  const s = useScenario.getState();
  s.open(source, city);
  expect(s.importPlan(JSON.stringify(connected()))).toBe(true);
  const old = JSON.stringify(useScenario.getState().access);
  s.editAccess({ ...useScenario.getState().access, connections: [] });
  expect(useScenario.getState().access!.connections).toHaveLength(0);
  s.undo();
  expect(JSON.stringify(useScenario.getState().access)).toBe(old);
  s.redo();
  expect(useScenario.getState().access!.connections).toHaveLength(0);
  s.undo();
  const b = useScenario.getState().development!.proposals[0];
  expect(s.putBuilding({ ...b, center: [-80, -317] })).toBe(false);
  s.removeBuilding(b.id);
  expect(useScenario.getState().development!.proposals).toHaveLength(3);
  const bad = connected();
  bad.access.connections[1].valid = true;
  expect(s.importPlan(JSON.stringify(bad))).toBe(false);
  expect(JSON.stringify(useScenario.getState().access)).toBe(old);
  let bytes: string | null = null;
  const storage = {
    getItem: () => bytes,
    setItem: (_k: string, v: string) => {
      bytes = v;
    },
  };
  expect(s.save(storage)).toBe(true);
  const id = useScenario.getState().currentId!;
  s.reset();
  s.reopen(id);
  expect(JSON.stringify(useScenario.getState().access)).toBe(old);
  const now = useScenario.getState();
  expect(
    scenarioFile(
      now.name,
      now.plan!,
      c.network,
      c,
      now.physical,
      now.development,
      now.living,
      now.management,
      now.access,
      now.mobility,
    ).version,
  ).toBe(6);
});
it("bounds tick schedules without changing legacy pulse assignment", () => {
  expect(
    () =>
      new TrafficSimulation(c.network, emptyPlan(c.network), [
        ...DEMAND,
        {
          from: "645523",
          to: "645599",
          access: "local",
          vehiclesPerTick: 0,
          tickVehicles: Array(61).fill(0),
        },
      ]),
  ).toThrow();
  const sim = new TrafficSimulation(c.network);
  for (let i = 0; i < 100; i++) sim.step();
  expect(sim.snapshot().tick).toBe(60);
  expect(sim.snapshot().requested).toBe(960);
});
it("cancels workers, ignores stale messages and releases its bounded deadline", () => {
  vi.useFakeTimers();
  let terminated = 0;
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null,
    postMessage: () => {},
    terminate: () => terminated++,
  };
  const done = vi.fn(),
    fail = vi.fn(),
    command = {
      version: 1 as const,
      generation: 4,
      input: input(),
      reference: null,
    };
  const cancel = startConnected(command, done, fail, () => port);
  port.onmessage!({
    data: { version: 1, generation: 3, type: "error", message: "stale" },
  } as MessageEvent);
  expect(fail).not.toHaveBeenCalled();
  cancel();
  port.onmessage!({
    data: { version: 1, generation: 4, type: "error", message: "late" },
  } as MessageEvent);
  vi.runAllTimers();
  expect(fail).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  expect(terminated).toBe(1);
});
import { useAccess } from "../src/state/access";
it("edits an unapplied access preview with bounded undo/redo, fixed source endpoints and no implicit confirmation", () => {
  const s = useScenario.getState();
  s.open(source, city);
  s.importPlan(JSON.stringify(connected()));
  s.editAccess({ ...useScenario.getState().access, connections: [] });
  const t = useAccess.getState();
  t.selectBuilding("study-0");
  t.start();
  expect(useScenario.getState().access!.connections).toHaveLength(0);
  t.chooseNode("4933873322");
  t.move(0, [-101, -317]);
  const points = structuredClone(useAccess.getState().draft!.points);
  t.addBend();
  expect(useAccess.getState().draft!.points).toHaveLength(3);
  t.undo();
  expect(useAccess.getState().draft!.points).toEqual(points);
  t.redo();
  expect(useAccess.getState().draft!.points).toHaveLength(3);
  t.undo();
  t.confirm();
  expect(useScenario.getState().access!.connections).toHaveLength(1);
  t.clear();
});
it("rejects self-intersection, reversals, public-space overlap and malformed worker results safely", () => {
  const i = input(),
    a = i.access.connections[0],
    p = a.points[0],
    q = a.points[1];
  const reversed = { ...a, points: [p, q, p, q] };
  expect(accessPlacement(reversed, c, i.development, i.physical).valid).toBe(
    false,
  );
  const obstruction = {
    ...i.physical,
    proposals: [
      {
        id: "space",
        name: "Fixture only",
        kind: "pedestrian" as const,
        vertices: corridor(p, q, 3),
      },
    ],
  };
  expect(
    accessPlacement(a, c, i.development, obstruction).errors.join(" "),
  ).toMatch(/public space/);
  let terminated = 0;
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null,
    postMessage: () => {},
    terminate: () => terminated++,
  };
  const fail = vi.fn(),
    done = vi.fn();
  startConnected(
    { version: 1, generation: 1, input: i, reference: null },
    done,
    fail,
    () => port,
  );
  port.onmessage!({
    data: {
      version: 1,
      generation: 1,
      type: "ready",
      computeMs: 1,
      result: {},
    },
  } as MessageEvent);
  expect(fail).toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  expect(terminated).toBe(1);
});
import { useConnected } from "../src/state/connected";
import { useDistrict } from "../src/state/district";
import { DistrictRunner } from "../src/district/protocol";
import type { ConnectedCommand } from "../src/access/worker";
class ConnectedFakeWorker {
  static all: ConnectedFakeWorker[] = [];
  messages: unknown[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  runner = new DistrictRunner();
  district: boolean;
  constructor(url: URL) {
    this.district = String(url).includes("/district/");
    ConnectedFakeWorker.all.push(this);
  }
  postMessage(c: unknown) {
    this.messages.push(structuredClone(c));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  flush() {
    const c = this.messages.at(-1)!;
    if (this.district) {
      const r = this.runner.handle(c);
      if (r) this.emit({ ...r, computeMs: 1 });
    } else {
      const cmd = c as ConnectedCommand;
      this.emit({
        version: 1,
        generation: cmd.generation,
        type: "ready",
        result: runConnected(cmd.input),
        reference: cmd.reference ? runConnected(cmd.reference) : null,
        computeMs: 1,
      });
    }
  }
}
it("synchronizes visible construction/activity to the transport month and cancels obsolete connected generations", () => {
  vi.stubGlobal("Worker", ConnectedFakeWorker);
  ConnectedFakeWorker.all = [];
  try {
    const s = useScenario.getState();
    s.open(source, city);
    s.importPlan(JSON.stringify(connected()));
    useConnected.getState().run();
    const district = ConnectedFakeWorker.all.at(-1)!;
    expect(district.district).toBe(true);
    district.flush();
    district.flush();
    let transport = ConnectedFakeWorker.all.at(-1)!;
    expect(transport.district).toBe(false);
    expect(useDistrict.getState().month).toBe(24);
    transport.flush();
    expect(useConnected.getState().result!.ledger.routed).toBe(13);
    expect(transport.terminated).toBe(true);
    useConnected.getState().run();
    transport = ConnectedFakeWorker.all.at(-1)!;
    s.editMobility({
      ...useScenario.getState().mobility,
      householdTripEnds: 0.5,
    });
    expect(transport.terminated).toBe(true);
    transport.flush();
    expect(useConnected.getState().result).toBeNull();
    expect(useConnected.getState().busy).toBe(false);
    s.reset();
    expect(useDistrict.getState().month).toBe(0);
  } finally {
    useConnected.getState().cancel();
    useDistrict.getState().close();
    vi.unstubAllGlobals();
  }
});
import { terrainPortal } from "../src/access/model";
it("snaps only a nearby terrain-picked hypothetical portal, never distant ground or observed road nodes", () => {
  const b = connected().development.proposals[0];
  const close = terrainPortal(b, [-101.08, -314]);
  expect(close).toEqual([-101, -314]);
  expect(terrainPortal(b, [-80, -314])).toEqual([-80, -314]);
  expect(
    attachmentPoints(c.network).find((n) => n.id === "4933873322")!.point,
  ).toEqual(connected().access.connections[0].points.at(-1));
});
it("cannot win by lowering declared demand rates even when some trips remain", () => {
  const i = input();
  i.mobility.householdTripEnds = 0;
  const r = runConnected(i);
  expect(r.ledger.generated).toBeGreaterThanOrEqual(4);
  expect(r.challenge.passed).toBe(false);
  expect(r.challenge.checks.at(-1)).toBe(false);
});
