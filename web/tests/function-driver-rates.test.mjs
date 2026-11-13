import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { functionDriverRows } from "../src/sider/function-driver-model.js";

const indicators = JSON.parse(readFileSync(
  new URL("../src/sider/driver-indicators.json", import.meta.url),
));

const municipality = (code) => ({ entity: { code } });

test("school volumes are divided by the relevant group in each municipality before taking the median", () => {
  const dataset = {
    columns: ["population", "ageSchool", "pupils", "schoolFte", "schoolSupport"],
    rows: {
      target: [1000, 100, 80, 12, 7.5],
      small: [80, 10, 5, 1, 3],
      large: [10000, 2000, 2000, 300, 5],
      noPupils: [100, 10, 0, 0, null],
      noAgeData: [100, null, 3, null, 4],
      noAgeGroup: [100, 0, 0, 0, null],
    },
  };
  const { activity } = functionDriverRows({
    target: municipality("target"),
    peers: Object.keys(dataset.rows).filter((code) => code !== "target").map(municipality),
    year: 2025, fn: "202", dataset, indicators,
  });
  const rows = Object.fromEntries(activity.map((row) => [row.key, row]));

  assert.equal(rows.pupils.own, 80);
  assert.equal(rows.pupils.rawOwn, 80);
  assert.equal(rows.pupils.denominatorTable, "11805");
  assert.deepEqual(rows.pupils.reference, { value: 50, count: 3 });
  assert.equal(rows.schoolFte.own, 15);
  assert.equal(rows.schoolFte.rawOwn, 12);
  assert.deepEqual(rows.schoolFte.reference, { value: 17.5, count: 2 });
  assert.equal(rows.ageSchool.own, 10);
  assert.equal(rows.schoolSupport.own, 7.5);
  assert.equal(rows.schoolSupport.rawOwn, undefined);
  assert.deepEqual(rows.schoolSupport.reference, { value: 4, count: 3 });
});

test("raw local count remains visible when there is no valid denominator", () => {
  const { activity } = functionDriverRows({
    target: municipality("target"), peers: [], year: 2025, fn: "120", indicators,
    dataset: { columns: ["adminFte", "population"], rows: { target: [12, 0] } },
  });
  assert.deepEqual(activity.map(({ key, own, rawOwn, reference }) => (
    { key, own, rawOwn, reference }
  )), [{ key: "adminFte", own: null, rawOwn: 12, reference: { value: null, count: 0 } }]);
});
