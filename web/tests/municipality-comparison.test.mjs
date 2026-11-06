import test from "node:test";
import {
  autoFitAxis,
  municipalityHistory,
  validateAxisBounds,
} from "../src/sider/comparison.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  benchmark,
  comparison,
  defaultPeers,
  readComparisonRoute,
  scenarioTotal,
  svenFindings,
  validateScenario,
} from "../src/sider/comparison.js";
const detail = (cost, people) => ({
  overview: {
    revenues: { 2025: { amount: people * 10, perCapita: 10000 } },
    net_expenses: { 2025: { amount: (cost * people) / 1000, perCapita: cost } },
  },
});
test("median excludes missing data, includes zero and averages even middle values", () => {
  assert.deepEqual(
    benchmark([detail(0, 100), detail(100, 100), detail(300, 100), {}], 2025),
    { value: 100, count: 3 },
  );
  assert.equal(
    benchmark([detail(100, 100), detail(300, 100)], 2025).value,
    200,
  );
  assert.deepEqual(benchmark([{}], 2025), { value: null, count: 0 });
});
test("weighted reference uses summed expenses and population rather than mean ratios", () => {
  assert.deepEqual(
    benchmark([detail(100, 100), detail(300, 900)], 2025, "", "", "weighted"),
    { value: 280, count: 2 },
  );
});
test("cost difference converts kroner per inhabitant to NOK thousand exactly once", () => {
  const result = comparison(detail(300, 10000), [detail(200, 1000)], 2025);
  assert.equal(result.percent, 50);
  assert.equal(result.gapAmount, 1000);
  assert.equal(comparison({}, [detail(200, 1000)], 2025).gapAmount, null);
});
test("scenario accounts for start year, ramp-up, one-off cost and disabled candidates", () => {
  const items = [
    { annual: 20, start: 2027, firstYearShare: 50, oneOff: 3, enabled: true },
    {
      annual: 900,
      start: 2027,
      firstYearShare: 100,
      oneOff: 0,
      enabled: false,
    },
  ];
  assert.equal(scenarioTotal(items, 2026), 0);
  assert.equal(scenarioTotal(items, 2027), 7);
  assert.equal(scenarioTotal(items, 2028), 20);
});
test("route parsing restricts codes and peer count, saved scenario rejects non-finite inputs", () => {
  assert.equal(readComparisonRoute("#sider?kommune=xxx").code, "1103");
  assert.deepEqual(readComparisonRoute("#sider?mot=").peers, []);
  assert.equal(
    readComparisonRoute("#sider?mot=" + Array(20).fill("1108").join(",")).peers
      .length,
    12,
  );
  assert.equal(
    validateScenario({
      id: "1",
      name: "Test",
      annual: Infinity,
      oneOff: 0,
      start: 2027,
      firstYearShare: 100,
      enabled: true,
    }),
    false,
  );
});
test("real Stavanger fixture uses its current peer group and finds traceable sector differences", () => {
  const index = JSON.parse(
    readFileSync(new URL("../public/data/kostra/index.json", import.meta.url)),
  );
  const read = (code) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../public/data/kostra/entities/municipality-${code}.json`,
          import.meta.url,
        ),
      ),
    );
  const codes = defaultPeers(index.entities, "1103");
  assert.ok(codes.length >= 3);
  assert.ok(!codes.includes("1103"));
  assert.ok(!codes.includes("0301"));
  const target = read("1103"),
    peers = codes.map(read),
    results = svenFindings(target, peers, 2025, "median");
  assert.ok(results.length > 0);
  for (const finding of results) {
    assert.ok(finding.gapAmount > 0);
    assert.ok(finding.reference.count >= 3);
    assert.equal(
      finding.own,
      target.services.find((s) => s.code === finding.code).metrics
        .net_expenses[2025],
    );
  }
  assert.deepEqual(svenFindings(target, peers.slice(0, 2), 2025, "median"), []);
});

test("municipality history preserves units, calendar-year growth and missing observations", () => {
  const d = {
    overview: {
      net_expenses: {
        2020: { amount: 100000, perCapita: 1000 },
        2021: { amount: 120000, perCapita: 1100 },
        2023: { amount: 150000, perCapita: 1300 },
      },
    },
  };
  const nominal = municipalityHistory(
    d,
    [2020, 2021, 2022, 2023],
    "",
    "",
    "amount",
  );
  assert.equal(nominal[0].cost, 100);
  assert.ok(Math.abs(nominal[1].growth - 20) < 1e-8);
  assert.equal(nominal[2].cost, null);
  assert.equal(nominal[3].growth, null);
  const perPerson = municipalityHistory(d, [2020, 2021], "", "", "perCapita");
  assert.equal(perPerson[1].cost, 1100);
  assert.ok(Math.abs(perPerson[1].growth - 10) < 1e-8);
});

test("axis bounds support cropped and automatic ranges and reject inverted/non-finite ranges", () => {
  assert.deepEqual(validateAxisBounds("75", "100"), { min: 75, max: 100 });
  assert.deepEqual(validateAxisBounds("", ""), { min: null, max: null });
  assert.deepEqual(validateAxisBounds("-5", "10"), { min: -5, max: 10 });
  assert.ok(validateAxisBounds("100", "75").error);
  assert.ok(validateAxisBounds("75", "75").error);
  assert.ok(validateAxisBounds("Infinity", "100").error);
});

test("automatic axis fits positive, negative, constant and missing observations without forcing zero", () => {
  const positive = autoFitAxis([80, 90, 100, null]);
  assert.ok(positive[0] > 0 && positive[0] < 80);
  assert.ok(positive[1] > 100);
  const negative = autoFitAxis([-10, -8, -5]);
  assert.ok(negative[0] < -10 && negative[1] < 0 && negative[1] > -5);
  const constant = autoFitAxis([50, 50]);
  assert.ok(constant[0] < 50 && constant[1] > 50);
  assert.deepEqual(autoFitAxis([0, 0]), [-1, 1]);
  assert.deepEqual(autoFitAxis([null, undefined]), [0, 1]);
});
