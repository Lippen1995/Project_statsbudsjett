import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  comparisonRow,
  peerRows,
  observation,
  chartDomain,
} from "../src/sider/workspace-model.js";
import {
  defaultPeers,
  benchmark,
  point,
  population,
} from "../src/sider/comparison.js";
import {
  ACCOUNT_SECTIONS, OWN_PURCHASES, PURCHASE_REMAINDER, accountingComparison, accountingObservation,
} from "../src/sider/accounting-drill.js";
const read = (code) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../public/data/kostra/entities/municipality-${code}.json`,
        import.meta.url,
      ),
    ),
  );
const index = JSON.parse(
  readFileSync(new URL("../public/data/kostra/index.json", import.meta.url)),
);
const target = read("1103"),
  peers = defaultPeers(index.entities, "1103").map(read);
test("own production purchases drill into published arts and a reconciled remainder", () => {
  const data = JSON.parse(readFileSync(
    new URL("../public/data/kostra/purchase-arts/120.json", import.meta.url),
  ));
  const attach = (detail) => ({ ...detail, purchaseArts: { functionCode: "120", data } });
  const [post] = ACCOUNT_SECTIONS[0][1].filter(([code]) => code === OWN_PURCHASES);
  const rows = post[2].map((code) => accountingComparison(
    attach(target), peers.map(attach), 2025, "120", code, "median",
  ));
  assert.deepEqual(rows.map(({ own }) => own.amount), [33, 50328, 179143]);
  assert.equal(rows.reduce((sum, { own }) => sum + own.amount, 0), 229504);
  assert.deepEqual(rows.map(({ count }) => count), [10, 10, 10]);
  assert.equal(rows[1].reference.toFixed(1), "133.3");
  assert.equal(rows[2].reference.toFixed(1), "891.8");
  assert.equal(accountingObservation(attach(target), 2024, "120", "A270").amount, 52262);
  assert.equal(accountingObservation(attach(target), 2025, "121", "A270").amount, null);
  assert.equal(accountingObservation(target, 2025, "120", PURCHASE_REMAINDER).amount, null);
});
test("administration accounting drill uses published gross groups and keeps subaccounts separate", () => {
  const amount = (code) => accountingComparison(target, peers, 2025, "120", code, "median").own.amount;
  const [, grossPosts] = ACCOUNT_SECTIONS[0];
  assert.equal(grossPosts.reduce((sum, [code]) => sum + amount(code), 0), 698787);
  assert.equal(amount("AGD10"), 699246);
  assert.equal(amount("AG16"), 452233);
  assert.deepEqual(grossPosts[0][2].map(amount), [78049, 57245, 13973]);
  assert.equal(amount("A600"), 0);
  const missing = accountingComparison(target, [], 2025, "190", "AG16", "median");
  assert.equal(missing.own.amount, null);
  assert.equal(missing.reported, false);
});
test("account references compare the same year, function and art across municipalities", () => {
  const other = read("1108");
  const art = other.accountingArts["120"].find(({ code }) => code === "A090");
  const value = art.values[2024].amount * 1000 / population(other, 2024);
  const row = accountingComparison(target, peers, 2024, "120", "A090", "weighted", other);
  assert.equal(row.reference, value);
  assert.equal(row.count, 1);
});
test("aggregate and sector drilldowns use the actual exports rather than summing overlapping services", () => {
  const all = comparisonRow(target, peers, 2025);
  assert.equal(all.own.amount, target.overview.net_expenses[2025].amount);
  assert.equal(
    Object.hasOwn(all, "ref"),
    false,
    "chart data must not leak a React reserved ref prop onto SVG marks",
  );
  const admin = comparisonRow(target, peers, 2025, "FGK1b");
  assert.equal(admin.own.perCapita, 5414);
  assert.equal(admin.reference.perCapita, 4817.5);
  assert.ok(Math.abs(admin.percent - 12.381941) < 0.00001);
  assert.equal(
    admin.reference.amount,
    (4817.5 * population(target, 2025)) / 1000,
  );
  assert.equal(admin.reference.calculated, true);
});
test("historical function comparisons retain the selected function for both municipalities and preserve nominal units", () => {
  const other = read("1108");
  const row = comparisonRow(
    target,
    peers,
    2024,
    "FGK1b",
    "120",
    "median",
    other,
    "amount",
  );
  assert.equal(row.a, point(target, 2024, "", "120").amount / 1000);
  assert.equal(row.b, point(other, 2024, "", "120").amount / 1000);
  assert.equal(row.reference.population, population(other, 2024));
  assert.equal(row.reference.calculated, undefined);
  const perPerson = comparisonRow(
    target,
    peers,
    2024,
    "FGK1b",
    "120",
    "median",
    other,
  );
  assert.equal(row.percent, perPerson.percent);
  assert.equal(
    row.own.growth,
    (point(target, 2024, "", "120").amount /
      point(target, 2023, "", "120").amount -
      1) *
      100,
  );
});
test("peer plots sort descending and keep one fixed peer benchmark for every municipality", () => {
  const rows = peerRows(
    target,
    peers,
    2025,
    "FGK1b",
    "120",
    "median",
    null,
    "perCapita",
  );
  assert.equal(rows.length, peers.length + 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].a >= rows[i].a);
  const ref = benchmark(peers, 2025, "", "120").value;
  assert.ok(rows.every((r) => r.reference.perCapita === ref));
  assert.equal(rows.filter((r) => r.selected).length, 1);
  assert.equal(
    peerRows(target, peers, 2025, "", "120", "median", peers[0], "amount")
      .length,
    2,
  );
});
test("missing calendar years are never bridged and unavailable values never become zero", () => {
  const incomplete = {
    entity: { name: "Test" },
    overview: {
      net_expenses: {
        2020: { amount: 100, perCapita: 100 },
        2022: { amount: 200, perCapita: 200 },
      },
    },
  };
  assert.equal(observation(incomplete, 2022).growth, null);
  assert.equal(observation(incomplete, 2021).perCapita, null);
  const row = comparisonRow(incomplete, [], 2021);
  assert.equal(row.a, null);
  assert.equal(row.b, null);
  assert.equal(row.percent, null);
  assert.equal(row.reference.amount, null);
});
test("axes fit the actual data and produce ticks on the same finite domain, including cropped and negative ranges", () => {
  const fit = chartDomain([80, 90, 100, null]);
  assert.ok(fit.domain[0] > 0);
  assert.ok(fit.domain[1] >= 100);
  for (const values of [
    [-100, -80],
    [0, 0],
    [null],
    [10, 10000],
    [45.4, 45.5],
  ]) {
    const { domain, ticks } = chartDomain(values);
    assert.ok(domain[0] < domain[1]);
    assert.ok(
      ticks.every(
        (t) => Number.isFinite(t) && t >= domain[0] && t <= domain[1],
      ),
    );
  }
  assert.deepEqual(
    chartDomain([80, 90], { min: 75, max: 100 }).domain,
    [75, 100],
  );
  assert.ok(chartDomain([80, 90], { min: 100, max: null }).domain[0] < 100);
});

test("art drill keeps the same account in the ranking and historical comparison", () => {
  const other = read("1108");
  const [, [payroll]] = ACCOUNT_SECTIONS[0];
  const [post, , [pension]] = payroll;
  const row = comparisonRow(target, peers, 2025, "FGK1b", "120", "median", null, "perCapita", pension);
  const postRow = comparisonRow(target, peers, 2025, "FGK1b", "120", "median", null, "perCapita", post);
  assert.equal(postRow.own.amount, 452233);
  assert.equal(row.own.amount, 78049);
  assert.equal(row.b, accountingComparison(target, peers, 2025, "120", pension, "median").reference);

  const comparison = comparisonRow(target, peers, 2024, "FGK1b", "120", "median", other, "amount", pension);
  const amount = (detail, year) => detail.accountingArts["120"].find((art) => art.code === pension).values[year].amount;
  assert.equal(comparison.b, amount(other, 2024) / 1000);
  assert.equal(comparison.own.growth, (amount(target, 2024) / amount(target, 2023) - 1) * 100);
  assert.equal(comparison.reference.growth, (amount(other, 2024) / amount(other, 2023) - 1) * 100);
});
