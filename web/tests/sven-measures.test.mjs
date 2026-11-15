import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultPeers } from "../src/sider/comparison.js";
import { svenMeasures } from "../src/sider/sven-measures.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../public/data/kostra/${path}`, import.meta.url)));
const purchaseArts = { functionCode: "120", data: read("purchase-arts/120.json") };
const municipality = (code) => ({ ...read(`entities/municipality-${code}.json`), purchaseArts });
const target = municipality("1103");
const peers = defaultPeers(read("index.json").entities, "1103").map(municipality);
const params = { target, peers, year: 2025, method: "median", occupations: read("occupations/2025.json"), inputs: read("sven/2025.json") };

test("Sven distinguishes investigation from keeping the current service", () => {
  const [management, purchases, offices, schools] = svenMeasures(params);
  assert.equal(management.status, "review");
  assert.deepEqual(management.saving.map(Math.round), [980352, 2509380]);
  assert.deepEqual(management.setup, [72000, 198000]);
  assert.equal(purchases.status, "review");
  assert.equal(purchases.reference.count, 10);
  assert.equal(purchases.reference.value.toFixed(1), "133.3");
  assert.deepEqual(purchases.saving.map(Math.round), [1505172, 4515515]);
  assert.equal(offices.status, "hold");
  assert.equal(schools.status, "hold");
  assert.equal(schools.saving, null);
});

test("Sven suppresses estimates with insufficient coverage and incomplete wage inputs", () => {
  const limited = svenMeasures({ ...params, peers: [target, peers[0], peers[0]] });
  assert.ok(limited.every(({ status, saving }) => status === "missing" && saving === null));
  const [management] = svenMeasures({ ...params, inputs: { ...params.inputs, wages: {} } });
  assert.equal(management.status, "unpriced");
  assert.equal(management.saving, null);
});

test("energy scenario uses the reported energy bill and keeps the energy benchmark a median", () => {
  const inputs = structuredClone(params.inputs);
  inputs.energy["130"]["1103"] = [10000, 260];
  const [,, offices] = svenMeasures({ ...params, inputs, method: "weighted" });
  assert.equal(offices.status, "review");
  assert.equal(offices.reference.value, 183);
  assert.deepEqual(offices.saving, [200000, 500000]);
});
