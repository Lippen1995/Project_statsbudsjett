import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-3b");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [],
  requests = new Set();
const report = {
  browserVersion: browser.version(),
  renderer:
    "Chromium / ANGLE SwiftShader; software only, not physical-device performance",
  checks: [],
  desktop: {},
  mobile: {},
};
const deploymentHeaders = Object.fromEntries(
  JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url)),
  ).headers[0].headers.map(({ key, value }) => [key, value]),
);
async function setup(viewport, mobile = false) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => requests.add(r.url()));
  // Preview omits hosting headers. Apply the unchanged Vercel headers to the
  // document so module-worker loading is tested under the actual project CSP.
  await page.route(base + "/?capture=1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), ...deploymentHeaders },
    });
  });
  await page.goto(base + "/?capture=1");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  return page;
}
const metrics = (page) =>
  page.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
async function settle(page) {
  await page.waitForTimeout(1200);
  const a = (await metrics(page)).frames;
  await page.waitForTimeout(700);
  assert.equal(
    (await metrics(page)).frames,
    a,
    "Paused/static scenario must not render continuously",
  );
}
async function frame(page) {
  const count = (await metrics(page)).frames;
  await page.locator("canvas").evaluate((c) =>
    c.dispatchEvent(
      new CustomEvent("bergen:capture", {
        detail: { position: [-450, 620, 600], target: [30, 0, -200] },
      }),
    ),
  );
  await page.waitForFunction(
    (n) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
    count,
  );
}
async function profile(page) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await settle(page);
  const samples = [];
  for (let i = 0; i < 14; i++) {
    const count = (await metrics(page)).frames;
    await page.locator("canvas").evaluate(
      (c, i) =>
        c.dispatchEvent(
          new CustomEvent("bergen:capture", {
            detail: {
              position: [-450 + (i % 2) * 30, 620, 600],
              target: [30, 0, -200],
            },
          }),
        ),
      i,
    );
    await page.waitForFunction(
      (n) =>
        JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
      count,
    );
    if (i >= 2) samples.push(await metrics(page));
  }
  const quantile = (key, fraction) =>
    samples.map((v) => v[key]).sort((a, b) => a - b)[
      Math.floor(samples.length * fraction)
    ];
  await settle(page);
  return {
    calls: samples.at(-1).calls,
    triangles: samples.at(-1).triangles,
    geometries: samples.at(-1).geometries,
    sampleCount: samples.length,
    medianCameraLatencyMs: quantile("cameraLatencyMs", 0.5),
    p95CameraLatencyMs: quantile("cameraLatencyMs", 0.95),
    medianCpuFrameMs: quantile("cpuFrameMs", 0.5),
    idleFrames: 0,
  };
}
const city = JSON.parse(
  readFileSync(new URL("../public/data/bergen.json", import.meta.url)),
);
const networkWayIds = new Set(
  JSON.parse(
    readFileSync(
      new URL("../public/data/bryggen-transport.json", import.meta.url),
    ),
  ).ways.map((w) => w.id),
);
async function enter(page) {
  await page
    .getByRole("button", { name: "Enter Planning Mode →", exact: true })
    .click();
  await page.getByLabel("Urban planning sandbox", { exact: true }).waitFor();
  await frame(page);
}
async function clickStreet(page, wayId, editable = true, touch = false) {
  assert.equal(
    networkWayIds.has(wayId),
    editable,
    "Street fixture must match the audited editable network",
  );
  const road = city.roads.find((r) => r.id === wayId);
  assert(road);
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(),
    view = await metrics(page);
  const camera = new PerspectiveCamera(43, box.width / box.height, 2, 14000);
  camera.position.fromArray(view.position);
  camera.lookAt(new Vector3(...view.target));
  camera.updateMatrixWorld();
  for (const fraction of [0.25, 0.5, 0.75, 0.1, 0.9]) {
    const p = road.points[Math.floor((road.points.length - 1) * fraction)];
    const ndc = new Vector3(p[0], p[1] + 0.6, p[2]).project(camera);
    const x = box.x + ((ndc.x + 1) * box.width) / 2,
      y = box.y + ((1 - ndc.y) * box.height) / 2;
    if (
      x < box.x ||
      x > box.x + box.width ||
      y < box.y ||
      y > box.y + box.height
    )
      continue;
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    const identity = page.locator(
      editable ? ".street-identity" : ".outside-model",
    );
    if (
      (await identity.count()) &&
      (await identity.innerText()).includes(wayId)
    )
      return;
  }
  throw new Error("Could not select actual source road " + wayId);
}
async function runPlan(page, pause = false) {
  const start = Date.now();
  await page.getByRole("button", { name: "▶ Run plan", exact: true }).click();
  if (pause) {
    await page.waitForFunction(
      () => document.querySelector("progress").value >= 5,
    );
    await page
      .getByRole("button", { name: "Pause simulation", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Simulation paused" })
      .waitFor();
    const tick = await page.getByRole("progressbar").getAttribute("value");
    await settle(page);
    assert.equal(
      await page.getByRole("progressbar").getAttribute("value"),
      tick,
    );
    assert(
      await page.getByLabel("Proposed access", { exact: true }).isDisabled(),
    );
    await page
      .getByRole("button", { name: "Resume simulation", exact: true })
      .click();
  }
  await page
    .getByRole("status")
    .filter({ hasText: "Simulation complete" })
    .waitFor({ timeout: 30000 });
  await settle(page);
  return {
    wallMs: Date.now() - start,
    workerComputeMs: Number(
      await page
        .locator(".simulation-progress")
        .getAttribute("data-compute-ms"),
    ),
    table: await page.getByRole("table").innerText(),
    metrics: await metrics(page),
  };
}
async function library(page) {
  const details = page.locator(".plan-library");
  if (!(await details.evaluate((e) => e.open)))
    await details.locator("summary").click();
}
async function importFile(page, text) {
  await library(page);
  await page.getByLabel("Import scenario JSON", { exact: true }).setInputFiles({
    name: "test-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
}
try {
  const page = await setup({ width: 1440, height: 1000 });
  report.desktop.explorerProfile = await profile(page);
  await enter(page);
  await clickStreet(page, "way/9649862");
  await page
    .getByLabel("Proposed access", { exact: true })
    .selectOption("local");
  await clickStreet(page, "way/488690111");
  await page
    .getByLabel("Assumed capacity", { exact: true })
    .selectOption("0.5");
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /2 proposed section edits/,
  );
  await page.screenshot({
    path: resolve(output, "01-street-editing.jpg"),
    type: "jpeg",
    quality: 90,
  });
  report.desktop.twoEdits = await runPlan(page, true);
  report.desktop.activeProfile = await profile(page);
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const image = await page.locator("canvas").screenshot(),
    camera = await metrics(page);
  await page.screenshot({
    path: resolve(output, "02-plan-results.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page
    .getByRole("button", { name: "Initial baseline", exact: true })
    .click();
  await settle(page);
  assert(!image.equals(await page.locator("canvas").screenshot()));
  assert.deepEqual((await metrics(page)).position, camera.position);
  assert.deepEqual((await metrics(page)).target, camera.target);
  await page.screenshot({
    path: resolve(output, "03-baseline-comparison.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  assert.equal(await page.getByRole("table").count(), 0);
  report.desktop.oneEdit = await runPlan(page);
  assert.notEqual(report.desktop.oneEdit.table, report.desktop.twoEdits.table);
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /2 proposed section edits/,
  );
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await library(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Harbour access trial");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page
    .getByRole("note")
    .filter({ hasText: "Plan saved in this browser" })
    .waitFor();
  const storedA = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans[0],
  );
  await page
    .getByRole("button", { name: "Duplicate plan", exact: true })
    .click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Harbour capacity alternative");
  await frame(page);
  await clickStreet(page, "way/488690111");
  await page
    .getByLabel("Assumed capacity", { exact: true })
    .selectOption("0.5");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page
    .getByLabel("Compare with saved plan", { exact: true })
    .selectOption({ label: "Harbour access trial" });
  report.desktop.savedComparison = await runPlan(page);
  await page
    .getByRole("button", { name: "Saved reference", exact: true })
    .click();
  assert.match(
    await page.getByRole("table").innerText(),
    /Harbour access trial/,
  );
  await frame(page);
  await page.screenshot({
    path: resolve(output, "04-saved-comparison.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  await enter(page);
  await library(page);
  await page
    .getByLabel("Saved plans", { exact: true })
    .selectOption({ label: "Harbour access trial" });
  await page
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /Harbour access trial/,
  );
  const restored = await runPlan(page);
  assert.equal(restored.table, report.desktop.oneEdit.table);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(resolve(output, "harbour-access-plan.json"));
  const exported = readFileSync(
    resolve(output, "harbour-access-plan.json"),
    "utf8",
  );
  assert.deepEqual(JSON.parse(exported), storedA.scenario);
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  assert.equal(await page.getByRole("table").count(), 0);
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /0 proposed section edits/,
  );
  await importFile(page, exported);
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /1 proposed section edits/,
  );
  const imported = await runPlan(page);
  assert.equal(imported.table, report.desktop.oneEdit.table);
  await importFile(
    page,
    JSON.stringify({ ...JSON.parse(exported), version: 99 }),
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Import rejected" })
    .waitFor();
  assert.equal(await page.getByRole("table").innerText(), imported.table);
  const example = readFileSync(
    new URL("../public/plans/rethinking-example.json", import.meta.url),
    "utf8",
  );
  await importFile(page, example);
  await page
    .getByRole("button", {
      name: "Take the challenge · Rethinking Bryggen",
      exact: true,
    })
    .click();
  report.desktop.challenge = await runPlan(page);
  await page.getByText("Challenge achieved", { exact: true }).waitFor();
  await frame(page);
  await page.screenshot({
    path: resolve(output, "05-challenge-achieved.jpg"),
    type: "jpeg",
    quality: 90,
  });
  const closed = JSON.parse(exported);
  closed.name = "Access loss experiment";
  closed.plan.interventions = await page
    .getByLabel("Select modelled section", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((o) => o.value)
        .filter(Boolean)
        .map((segmentId) => ({
          segmentId,
          access: "closed",
          capacityFactor: 1,
        })),
    );
  await importFile(page, JSON.stringify(closed));
  report.desktop.accessLoss = await runPlan(page);
  await page
    .getByRole("alert")
    .filter({ hasText: "ACCESSIBILITY LOSS" })
    .waitFor();
  assert.match(await page.locator(".game-score").innerText(), /-1960/);
  assert.match(report.desktop.accessLoss.table, /— m\/trip/);
  assert(
    !report.desktop.accessLoss.table.includes("—%"),
    "Unavailable percentage must be a dash without a numerical claim",
  );
  assert.match(report.desktop.accessLoss.table, /960 \/ 960/);
  await page.screenshot({
    path: resolve(output, "06-accessibility-loss.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page.getByLabel("Traffic intensity on map", { exact: true }).uncheck();
  await settle(page);
  assert.equal((await metrics(page)).calls, 6);
  await frame(page);
  await clickStreet(page, "way/165401815", false);
  await page.getByText(/Outside the verified transport model/).waitFor();
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /0 proposed section edits/,
  );
  await page
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await settle(page);
  assert.equal((await metrics(page)).calls, 5);
  await page.close();
  const mobile = await setup({ width: 390, height: 844 }, true);
  await mobile.getByLabel("Rendering", { exact: true }).selectOption("low");
  report.mobile.explorerProfile = await profile(mobile);
  await enter(mobile);
  await clickStreet(mobile, "way/9649862", true, true);
  await mobile
    .getByLabel("Proposed access", { exact: true })
    .selectOption("local");
  await mobile.locator("canvas").scrollIntoViewIfNeeded();
  await clickStreet(mobile, "way/488690111", true, true);
  await mobile
    .getByLabel("Assumed capacity", { exact: true })
    .selectOption("0.5");
  report.mobile.twoEdits = await runPlan(mobile);
  assert.equal(report.mobile.twoEdits.table, report.desktop.twoEdits.table);
  report.mobile.activeProfile = await profile(mobile);
  await mobile.locator("canvas").scrollIntoViewIfNeeded();
  await mobile.screenshot({
    path: resolve(output, "07-mobile-plan.jpg"),
    type: "jpeg",
    quality: 90,
  });
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await library(mobile);
  await mobile.getByLabel("Plan name", { exact: true }).fill("Mobile proposal");
  await mobile.getByRole("button", { name: "Save plan", exact: true }).click();
  await mobile.reload();
  await mobile.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  await enter(mobile);
  await library(mobile);
  await mobile
    .getByLabel("Saved plans", { exact: true })
    .selectOption({ label: "Mobile proposal" });
  await mobile
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  assert.match(
    await mobile.locator(".plan-heading").innerText(),
    /2 proposed section edits/,
  );
  await mobile.getByRole("button", { name: "Reset city", exact: true }).click();
  await mobile
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await mobile.route("**/data/bryggen-transport.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  mobile.removeAllListeners("console");
  await mobile
    .getByRole("button", { name: "Enter Planning Mode →", exact: true })
    .click();
  await mobile
    .getByRole("alert")
    .filter({ hasText: "Transport snapshot unavailable (503)" })
    .waitFor();
  assert.equal(
    await mobile.getByLabel("Proposed access", { exact: true }).count(),
    0,
  );
  await mobile.close();
  assert(
    [...requests].every(
      (url) =>
        new URL(url).origin === new URL(base).origin || url.startsWith("blob:"),
    ),
  );
  assert.deepEqual(errors, []);
  report.checks = [
    "direct 3D selection of two connected mapped sections",
    "hypothetical access and capacity edits",
    "worker pause/resume and deterministic outcomes",
    "changed intensity at fixed camera",
    "baseline comparison",
    "undo and rerun",
    "save/name/duplicate",
    "two saved configurations recalculated in worker",
    "reload and reopen",
    "actual JSON download/import roundtrip",
    "incompatible import preserves current results",
    "challenge solution calculated by common engine",
    "accessibility loss is prominent and penalized",
    "non-editable street explicitly identified",
    "heatmap toggle and overlay disposal",
    "zero idle frames",
    "390px touch editing and local restore",
    "missing transport data fails explicitly",
    "same-origin static runtime under unchanged Vercel CSP",
  ];
  report.passed = true;
  report.errors = errors;
  report.baselineCommit = "54c65318a3a82af51d36e196c2cc313148703efc";
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
