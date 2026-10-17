import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { buildNetwork, type TransportSource } from "../src/simulation/network";
import {
  TrafficSimulation,
  DEMAND,
  TOTAL_TICKS,
} from "../src/simulation/engine";
import { emptyPlan } from "../src/simulation/interventions";
import { districtTransportBoundary } from "../src/transport/boundary";
import { project } from "../src/geo/projection";
const source = JSON.parse(
  readFileSync("public/data/bryggen-transport.json", "utf8"),
) as TransportSource;
const network = buildNetwork(source);
const candidate = JSON.parse(
  readFileSync(
    "../../docs/bergen-simulator/milestone-5c-evidence/transport-candidate-source.json",
    "utf8",
  ),
) as TransportSource;
const audit = JSON.parse(
  readFileSync(
    "../../docs/bergen-simulator/milestone-5c-evidence/transport-audit.json",
    "utf8",
  ),
);
const proposal = JSON.parse(
  readFileSync("public/plans/sustainable-quarter-example.json", "utf8"),
);
describe("5C source-supported connectivity boundary", () => {
  it("pins the unchanged source and all 30 cache checksums, without a runtime source revision", () => {
    const p = "public/data/source-manifest.json";
    const m = JSON.parse(readFileSync(p, "utf8"));
    expect(audit.sourceManifestSha256).toBe(
      createHash("sha256").update(readFileSync(p)).digest("hex"),
    );
    expect(
      audit.sources.map((s: { sha256: string }) => s.sha256).sort(),
    ).toEqual(m.osm.map((s: { sha256: string }) => s.sha256).sort());
    expect(audit.sources).toHaveLength(30);
    expect(audit.totals.currentMotorWays).toBe(27);
    expect(audit.totals.verifiedProposedSiteConnections).toBe(0);
  });
  it("builds the bounded offline candidate union from retained original IDs and legal directions", () => {
    const n = buildNetwork(candidate);
    expect(candidate.ways.length).toBeGreaterThan(27);
    expect(candidate.ways.length).toBeLessThanOrEqual(60);
    for (const way of source.ways)
      expect(candidate.ways.find((w) => w.id === way.id)).toEqual(way);
    for (const e of n.edges) {
      const w = candidate.ways.find((w) => w.id === e.wayId)!;
      expect(e.nodeIds.every((id) => w.nodeIds.includes(id))).toBe(true);
      if (w.tags.oneway === "yes")
        expect(w.nodeIds.indexOf(e.from)).toBeLessThan(w.nodeIds.indexOf(e.to));
      if (w.tags.oneway === "-1")
        expect(w.nodeIds.indexOf(e.from)).toBeGreaterThan(
          w.nodeIds.indexOf(e.to),
        );
    }
  });
  it("conserves all synthetic traffic on the candidate graph and remains reproducible", () => {
    const n = buildNetwork(candidate);
    const run = () => {
      const sim = new TrafficSimulation(n, emptyPlan(n), DEMAND);
      for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
      return sim.snapshot();
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.served + a.unrouted).toBe(a.requested);
    expect(a.requested).toBe(960);
    expect(buildNetwork(source)).toEqual(network);
    if (process.env.BERGEN_EVIDENCE) {
      const sim = new TrafficSimulation(network, emptyPlan(network));
      for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
      const small = (r: ReturnType<typeof sim.snapshot>) => ({
        requested: r.requested,
        served: r.served,
        unrouted: r.unrouted,
        vehicleMinutes: r.vehicleMinutes,
        corridorTrips: r.corridorTrips,
      });
      mkdirSync("artifacts/milestone-5c", { recursive: true });
      writeFileSync(
        "artifacts/milestone-5c/candidate-network-report.json",
        JSON.stringify(
          {
            interpretation:
              "Offline graph review only, unchanged synthetic 30-minute demonstration demand. Not an enabled network, district coupling, legal route assurance or Bergen forecast.",
            active: {
              ways: source.ways.length,
              nodes: network.nodeIds.length,
              edges: network.edges.length,
              result: small(sim.snapshot()),
            },
            candidate: {
              ways: candidate.ways.length,
              nodes: n.nodeIds.length,
              edges: n.edges.length,
              result: small(a),
            },
            addedDistrictTrips: 0,
          },
          null,
          2,
        ) + "\n",
      );
    }
  });
  it("rejects missing/fabricated node references rather than repairing geometry", () => {
    const bad = structuredClone(candidate);
    bad.ways[0].nodeIds[1] = "999999999999999";
    expect(() => buildNetwork(bad)).toThrow(/node/i);
  });
  it.each(["yes", "-1"])(
    "preserves explicit one-way %s direction",
    (direction) => {
      const one = {
        ...structuredClone(source),
        ways: [structuredClone(source.ways[0])],
      };
      one.ways[0].tags.oneway = direction;
      const n = buildNetwork(one);
      expect(n.edges).toHaveLength(1);
      expect(n.edges[0].from).toBe(
        direction === "yes"
          ? one.ways[0].nodeIds[0]
          : one.ways[0].nodeIds.at(-1),
      );
    },
  );
  it.each(["relations", "restrictions"] as const)(
    "rejects %s instead of silently ignoring a turn restriction",
    (key) => {
      const bad = structuredClone(source);
      bad[key] = [
        {
          id: "relation/1",
          tags: { type: "restriction", restriction: "no_left_turn" },
        },
      ];
      expect(() => buildNetwork(bad)).toThrow(/review/i);
    },
  );
  it.each([
    { layer: "1" },
    { junction: "roundabout" },
    { "access:conditional": "no @ (Mo-Fr)" },
    { motorcar: "destination" },
    { "oneway:motor_vehicle": "-1" },
    { tunnel: "yes" },
    { bridge: "yes" },
  ])("rejects unreviewed access, grade or direction %j", (tags) => {
    const bad = structuredClone(source);
    Object.assign(bad.ways[0].tags, tags);
    expect(() => buildNetwork(bad)).toThrow(/review/i);
  });
  it("rejects source-node barriers and retains two distinct IDs at the same coordinate", () => {
    const bad = structuredClone(source);
    bad.nodeTags = { [bad.ways[0].nodeIds[0]]: { barrier: "bollard" } };
    expect(() => buildNetwork(bad)).toThrow(/barrier/i);
    // Synthetic duplicate-ID fixture uses copied observed coordinates, not new geography.
    const twin = structuredClone(source);
    const w = structuredClone(twin.ways[0]);
    w.id = "way/999999999";
    w.nodeIds = w.nodeIds.map((id, i) => {
      const next = String(990000000000 + i);
      twin.nodes[next] = [...twin.nodes[id]];
      return next;
    });
    twin.ways = [twin.ways[0], w];
    const n = buildNetwork(twin);
    expect(n.nodeIds).toContain(w.nodeIds[0]);
    expect(
      n.edges.some(
        (e) => e.from === w.nodeIds[0] && source.ways[0].nodeIds.includes(e.to),
      ),
    ).toBe(false);
  });
  it("never infers proposed-site access, even at an existing graph node", () => {
    const buildings = structuredClone(proposal.development.proposals);
    buildings[0].center = project(
      source.nodes[network.nodeIds[0]],
      source.origin,
    );
    const frozen = JSON.stringify({ buildings, network });
    const r = districtTransportBoundary(buildings, network);
    expect(r.status).toBe("unverified-access");
    expect(r.addedRequestedTrips).toBe(0);
    expect(r.sites.every((s) => s.verifiedEntranceNodeId === null)).toBe(true);
    expect(JSON.stringify({ buildings, network })).toBe(frozen);
    expect(districtTransportBoundary([], network).status).toBe(
      "no-development",
    );
    expect(districtTransportBoundary(buildings, null).addedRequestedTrips).toBe(
      0,
    );
  });
});

it("keeps changed district activity separate from the exact legacy traffic demand", async () => {
  const { DistrictSimulation } = await import("../src/district/engine");
  const { districtInput } = await import("../src/district/model");
  const runDistrict = (buildings: typeof proposal.development.proposals) => {
    const sim = new DistrictSimulation(
      districtInput(proposal.living, buildings, proposal.management),
    );
    for (let i = 0; i < 24; i++) sim.step();
    return sim.snapshot();
  };
  const runTraffic = () => {
    const sim = new TrafficSimulation(network, emptyPlan(network));
    for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
    return sim.snapshot();
  };
  const before = runTraffic(),
    original = runDistrict(proposal.development.proposals);
  const changed = structuredClone(proposal.development.proposals);
  changed[0].storeys++;
  const revised = runDistrict(changed);
  expect(revised.occupiedHouseholds).toBeGreaterThan(
    original.occupiedHouseholds,
  );
  expect(districtTransportBoundary(changed, network).addedRequestedTrips).toBe(
    0,
  );
  expect(runTraffic()).toEqual(before);
  expect(before.requested).toBe(960);
});

it("rejects imported trusted access, connectors or derived transport outputs", async () => {
  const { validateScenario } = await import("../src/planning/scenarios");
  const { placementContext } = await import("../src/physical/model");
  const { parseCityData } = await import("../src/geo/types");
  const context = placementContext(
    parseCityData(JSON.parse(readFileSync("public/data/bergen.json", "utf8"))),
    network,
  );
  expect(validateScenario(proposal, network, context).version).toBe(5);
  for (const field of ["transport", "verifiedSiteAccess", "trafficOutcomes"])
    expect(() =>
      validateScenario(
        { ...proposal, [field]: { verified: true } },
        network,
        context,
      ),
    ).toThrow();
});
