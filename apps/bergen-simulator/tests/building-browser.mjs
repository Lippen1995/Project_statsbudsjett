import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-4b/after");
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
  requests = new Set(),
  report = {
    browserVersion: browser.version(),
    renderer:
      "ANGLE SwiftShader software renderer; physical-device GPU performance unverified",
    checks: [],
    desktop: {},
    mobile: {},
  };
const headers = Object.fromEntries(
  JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url)),
  ).headers[0].headers.map(({ key, value }) => [key, value]),
);
const example = JSON.parse(
    readFileSync(
      new URL("../public/plans/urban-quarter-example.json", import.meta.url),
    ),
  ),
  legacy = readFileSync(
    new URL("../public/plans/rethinking-example.json", import.meta.url),
  );
const city = JSON.parse(
  readFileSync(new URL("../public/data/bergen.json", import.meta.url)),
);
function height(x, z) {
  const p = city.terrain.positions,
    ids = city.terrain.indices;
  for (let i = 0; i < ids.length; i += 3) {
    const [a, b, c] = ids.slice(i, i + 3).map((v) => p.slice(v * 3, v * 3 + 3));
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-8) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den,
      v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      return u * a[1] + v * b[1] + (1 - u - v) * c[1];
  }
  throw Error("Test point outside terrain");
}
async function setup(mobile = false) {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => requests.add(r.url()));
  await page.route(base + "/?capture=1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), ...headers },
    });
  });
  const start = performance.now();
  await page.goto(base + "/?capture=1");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  return { page, loadMs: performance.now() - start };
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
    "Static city must have zero idle frames",
  );
}
async function camera(
  page,
  position = [-90, 115, -120],
  target = [-40, 1, -240],
) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const count = (await metrics(page)).frames;
  await page
    .locator("canvas")
    .evaluate(
      (c, detail) =>
        c.dispatchEvent(new CustomEvent("bergen:capture", { detail })),
      { position, target },
    );
  await page.waitForFunction(
    (n) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
    count,
  );
  await settle(page);
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
  const q = (key, f) =>
    samples.map((v) => v[key]).sort((a, b) => a - b)[
      Math.floor(samples.length * f)
    ];
  await settle(page);
  return {
    calls: samples.at(-1).calls,
    triangles: samples.at(-1).triangles,
    lines: samples.at(-1).lines,
    geometries: samples.at(-1).geometries,
    sampleCount: samples.length,
    medianCameraLatencyMs: q("cameraLatencyMs", 0.5),
    p95CameraLatencyMs: q("cameraLatencyMs", 0.95),
    medianCpuFrameMs: q("cpuFrameMs", 0.5),
    idleFrames: 0,
  };
}
async function enter(page) {
  await page.getByRole("button", { name: "Enter Planning Mode →" }).click();
  await page.getByRole("button", { name: "Buildings", exact: true }).waitFor();
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
}
async function screen(page, x, z, handle = false, above = 0) {
  const rect = await page.locator("canvas").boundingBox(),
    m = await metrics(page);
  const c = new PerspectiveCamera(43, rect.width / rect.height, 2, 14000);
  c.position.fromArray(m.position);
  c.lookAt(new Vector3(...m.target));
  c.updateMatrixWorld();
  const v = new Vector3(
    x,
    height(x, z) + (handle ? 1.2 : 0) + above,
    z,
  ).project(c);
  return {
    x: rect.x + ((v.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - v.y) * rect.height) / 2,
  };
}
async function run(page) {
  await page.getByRole("button", { name: "▶ Run plan", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Simulation complete" })
    .waitFor({ timeout: 60000 });
  await settle(page);
  return {
    rows: await page.locator(".scenario-results tbody").innerText(),
    computeMs: Number(
      await page
        .locator(".simulation-progress")
        .getAttribute("data-compute-ms"),
    ),
  };
}
async function library(page) {
  const d = page.locator(".plan-library");
  if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click();
}
async function importJson(page, buffer, name = "study.json") {
  await library(page);
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(JSON.stringify(buffer));
  await page
    .getByLabel("Import scenario JSON")
    .setInputFiles({ name, mimeType: "application/json", buffer: bytes });
  if (name.startsWith("invalid"))
    await page
      .getByRole("alert")
      .filter({ hasText: "Import rejected" })
      .waitFor();
  else {
    const expected = JSON.parse(bytes).name;
    await page.waitForFunction(
      (name) =>
        document.querySelector(".plan-heading strong")?.textContent === name,
      expected,
    );
    await page.waitForFunction(
      () => !document.querySelector(".planning-error"),
    );
  }
}
async function precision(page) {
  const d = page.locator(".building-editor .precision-tools");
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
}
async function locate(page, center) {
  await precision(page);
  await page
    .getByLabel("Building east metres", { exact: true })
    .fill(String(center[0]));
  await page
    .getByLabel("Building south metres", { exact: true })
    .fill(String(center[1]));
  await page
    .getByRole("button", { name: "Locate at coordinates", exact: true })
    .click();
}
async function valid(page) {
  await page.locator('.building-editor [data-building-valid="true"]').waitFor();
}
async function confirm(page) {
  await valid(page);
  await page
    .getByRole("button", { name: "Confirm building", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .waitFor();
}
async function count(page, n) {
  await page
    .locator(`[aria-label="Development summary"][data-building-count="${n}"]`)
    .waitFor();
}
async function exportPlan(page) {
  await library(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  return JSON.parse(readFileSync(await (await pending).path()));
}
try {
  const { page, loadMs } = await setup();
  report.desktop.loadMs = loadMs;
  await enter(page);
  // Preserve this historical massing journey's immediate, pre-5B semantics.
  const legacyEmpty = JSON.parse(
    readFileSync(
      new URL("../public/plans/living-quarter-example.json", import.meta.url),
    ),
  );
  legacyEmpty.name = "Immediate construction regression";
  legacyEmpty.plan.interventions = [];
  legacyEmpty.physical.proposals = [];
  legacyEmpty.development.proposals = [];
  await importJson(page, legacyEmpty);

  await run(page);
  await camera(page);
  await page
    .locator("canvas")
    .screenshot({ path: resolve(output, "01-observed-bergen.jpg") });
  const initial = await metrics(page);
  // Direct terrain placement, followed by actual world-space rotation/resize gestures.
  await page.getByRole("button", { name: "Residential", exact: true }).click();
  await camera(page);
  const q = await screen(page, -95, -317);
  await page.mouse.click(q.x, q.y);
  await valid(page);
  await page
    .getByLabel("Building name", { exact: true })
    .fill("Waterfront homes");
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await camera(page);
  const a = await screen(page, -89, -309, true),
    z = await screen(page, -90, -310, true);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 5 });
  await page.mouse.up();
  assert(
    Number(
      await page.getByLabel("Width metres", { exact: true }).inputValue(),
    ) < 12,
    "Corner drag must actually resize",
  );
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await camera(page);
  const r = await screen(page, -95, -332, true),
    t = await screen(page, -92, -331, true);
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.mouse.up();
  assert(
    Number(
      await page.getByLabel("Rotation degrees", { exact: true }).inputValue(),
    ) > 0,
    "Rotation handle must change orientation",
  );
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await camera(page);
  const fromCentre = await screen(page, -95, -317, true),
    toCentre = await screen(page, -94, -317, true);
  await page.mouse.move(fromCentre.x, fromCentre.y);
  await page.mouse.down();
  await page.mouse.move(toCentre.x, toCentre.y, { steps: 4 });
  await page.mouse.up();
  assert(
    Number(
      await page
        .getByLabel("Building east metres", { exact: true })
        .inputValue(),
    ) > -94.8,
    "Centre drag must move the proposal",
  );
  await locate(page, [-95, -317]);
  await page.getByLabel("Rotation degrees", { exact: true }).fill("5");
  await page.getByLabel("Width metres", { exact: true }).fill("10");
  await page.getByLabel("Depth metres", { exact: true }).fill("14");
  await page.getByLabel("Storeys", { exact: true }).fill("3");
  await page
    .getByLabel("Conceptual roof", { exact: true })
    .selectOption("gabled");
  await valid(page);
  await camera(page);
  await page.screenshot({ path: resolve(output, "02-building-preview.jpg") });
  await confirm(page);
  await count(page, 1);
  await camera(page);
  await page.getByLabel("Proposed buildings", { exact: true }).selectOption("");
  const pick = await screen(page, -95, -317, false, 8);
  await page.mouse.click(pick.x, pick.y);
  assert.notEqual(
    await page.getByLabel("Proposed buildings", { exact: true }).inputValue(),
    "",
    "Direct 3D selection must open the placed concept",
  );
  // Editing use does not require redrawing. Committed and draft histories are separate.
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await page
    .getByLabel("Building purpose", { exact: true })
    .selectOption("civic");
  await confirm(page);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await page
    .getByLabel("Building purpose", { exact: true })
    .selectOption("residential");
  await confirm(page);
  // Observed footprint collision and water/gap rejection preserve the first concept.
  await page.getByRole("button", { name: "Commercial", exact: true }).click();
  const observed = city.buildings.find(
    (b) =>
      b.center[0] > -100 &&
      b.center[0] < 60 &&
      b.center[1] > -300 &&
      b.center[1] < -160 &&
      Math.abs(
        b.rings[0].reduce((s, p, i) => {
          const q = b.rings[0][(i + 1) % b.rings[0].length];
          return s + p[0] * q[1] - q[0] * p[1];
        }, 0) / 2,
      ) > 150,
  );
  assert(observed);
  await locate(page, observed.center);
  await page
    .locator(".building-editor .placement-feedback")
    .filter({ hasText: "Observed building conflict" })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Confirm building", exact: true })
      .isDisabled(),
  );
  await locate(page, [-140, -160]);
  await page
    .locator('.building-editor [data-building-valid="false"]')
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Confirm building", exact: true })
      .isDisabled(),
  );
  await camera(page);
  await page.screenshot({
    path: resolve(output, "03-invalid-construction.jpg"),
  });
  await locate(page, [-23, -237]);
  await page
    .getByLabel("Building name", { exact: true })
    .fill("Quay workspace");
  await page.getByLabel("Storeys", { exact: true }).fill("3");
  await confirm(page);
  await count(page, 2);
  // Add a public space through its actual precision controls; no preset outcome buttons.
  await page
    .getByRole("button", { name: "Physical public spaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New public-space footprint", exact: true })
    .click();
  await page.locator(".public-space-editor .precision-tools summary").click();
  for (const [x, z] of example.physical.proposals[0].vertices) {
    await page
      .getByLabel("New vertex east metres", { exact: true })
      .fill(String(x));
    await page
      .getByLabel("New vertex south metres", { exact: true })
      .fill(String(z));
    await page
      .getByRole("button", { name: "Add coordinate vertex", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Confirm public space", exact: true })
    .click();
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await count(page, 2);
  assert.match(await page.getByLabel("Development summary").innerText(), /189/);
  const beforeRun = await exportPlan(page);
  assert.equal(beforeRun.version, 5);
  assert.equal(beforeRun.development.proposals.length, 2);
  assert.equal(beforeRun.physical.proposals.length, 1);
  assert.equal(
    beforeRun.plan.interventions.length,
    0,
    "Construction must not edit traffic access",
  );
  const outcome = await run(page);
  report.desktop.computeMs = outcome.computeMs;
  // Multiple compatible purposes and a balanced, tested challenge are independently discoverable.
  await page.getByRole("button", { name: "Civic", exact: true }).click();
  await locate(page, [9, -213]);
  await page
    .getByLabel("Building name", { exact: true })
    .fill("Community pavilion");
  await confirm(page);
  await count(page, 3);
  assert.match(
    await page
      .getByRole("status")
      .filter({ hasText: "Simulation complete" })
      .innerText(),
    /complete/,
    "Construction retains the existing traffic run",
  );
  await page
    .getByRole("button", {
      name: "Challenge · A New Urban Quarter",
      exact: true,
    })
    .click();
  await page
    .getByText("Urban quarter challenge achieved", { exact: true })
    .waitFor();
  await camera(page);
  const applied = await metrics(page);
  assert(applied.triangles > initial.triangles);
  assert(
    applied.calls <= initial.calls + 4,
    "Public space and all buildings use at most four extra settled passes",
  );
  await page
    .locator("canvas")
    .screenshot({ path: resolve(output, "04-developed-bergen.jpg") });
  const developed = await page.locator("canvas").screenshot();
  await page
    .getByRole("button", { name: "Show observed city", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).triangles, initial.triangles);
  assert.notDeepEqual(await page.locator("canvas").screenshot(), developed);
  await page
    .getByRole("button", { name: "Show proposed city", exact: true })
    .click();
  await page.getByLabel("Show proposed buildings", { exact: true }).uncheck();
  await camera(page);
  assert((await metrics(page)).triangles < applied.triangles);
  await page.getByLabel("Show proposed buildings", { exact: true }).check();
  await library(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("My combined urban quarter");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page
    .getByText("Plan saved in this browser.", { exact: true })
    .waitFor();
  const exported = await exportPlan(page);
  writeFileSync(
    resolve(output, "combined-development-plan.json"),
    JSON.stringify(exported, null, 2) + "\n",
  );
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans[0],
  );
  await page
    .getByRole("button", { name: "Duplicate plan", exact: true })
    .click();
  await page
    .getByLabel("Compare with saved plan", { exact: true })
    .selectOption(stored.id);
  await page
    .getByLabel("Proposed buildings", { exact: true })
    .selectOption(exported.development.proposals[0].id);
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await page.getByLabel("Storeys", { exact: true }).fill("2");
  await confirm(page);
  assert.match(
    await page.getByLabel("Development summary").innerText(),
    /Current − saved: −?140|Current − saved: -140/,
  );
  await page
    .getByRole("button", { name: "Show saved development", exact: true })
    .click();
  await camera(page);
  await page.screenshot({ path: resolve(output, "05-plan-comparison.jpg") });
  await page
    .getByRole("button", { name: "Show current development", exact: true })
    .click();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(page);
  await library(page);
  await page.getByLabel("Saved plans", { exact: true }).selectOption(stored.id);
  await page
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  await count(page, 3);
  assert.deepEqual(await exportPlan(page), exported);
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await count(page, 0);
  await importJson(page, exported);
  await count(page, 3);
  const bad = structuredClone(exported);
  bad.development.proposals[2].center = [-140, -160];
  await importJson(page, bad, "invalid-final-building.json");
  assert.deepEqual(await exportPlan(page), exported);
  const mesh = structuredClone(exported);
  mesh.development.proposals[0].mesh = {};
  await importJson(page, mesh, "invalid-mesh.json");
  assert.deepEqual(await exportPlan(page), exported);
  await importJson(page, Buffer.from(legacy));
  await count(page, 0);
  const fourA = readFileSync(
    new URL("../public/plans/waterfront-example.json", import.meta.url),
  );
  await importJson(page, fourA);
  await count(page, 0);
  assert.equal((await exportPlan(page)).physical.proposals.length, 1);
  await importJson(page, exported);
  await count(page, 3);
  // Same 4A plan + same probes establish regression; the developed plan measures incremental cost.
  await importJson(page, fourA);
  await run(page);
  report.desktop.compatibilityProfile = await profile(page);
  await importJson(page, exported);
  await run(page);
  report.desktop.developedProfile = await profile(page);
  await camera(page);
  const settled = await metrics(page);
  // Repeated edits, deletions and complete exit must release old GPU buffers.
  await page
    .getByLabel("Proposed buildings", { exact: true })
    .selectOption(exported.development.proposals[0].id);
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await camera(page);
  const editSamples = [];
  for (let i = 0; i < 8; i++) {
    const n = (await metrics(page)).frames,
      start = performance.now();
    await page
      .getByLabel("Width metres", { exact: true })
      .fill(String(i % 2 ? 10 : 11));
    await page.waitForFunction(
      (n) =>
        JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
      n,
    );
    editSamples.push(performance.now() - start);
  }
  editSamples.sort((a, b) => a - b);
  report.desktop.resizeCommandLatencyMs = {
    sampleCount: editSamples.length,
    median: editSamples[4],
    p95: editSamples.at(-1),
    meaning:
      "Playwright numeric resize command through next observed frame; software renderer and automation overhead, not physical GPU FPS",
  };
  await page
    .getByRole("button", { name: "Discard building draft", exact: true })
    .click();
  const memorySession = await page.context().newCDPSession(page);
  const heap = async () => {
    await memorySession.send("HeapProfiler.collectGarbage");
    return (await memorySession.send("Runtime.getHeapUsage")).usedSize;
  };
  const heapBefore = await heap();
  const retained = [];
  for (let i = 0; i < 6; i++) {
    await page
      .getByLabel("Proposed buildings", { exact: true })
      .selectOption(exported.development.proposals[0].id);
    await page
      .getByRole("button", { name: "Edit building", exact: true })
      .click();
    await page
      .getByLabel("Storeys", { exact: true })
      .fill(String(i % 2 ? 3 : 2));
    await confirm(page);
    await camera(page);
    retained.push((await metrics(page)).geometries);
  }
  assert(
    Math.max(...retained) - Math.min(...retained) <= 1,
    "Replaced proposal geometry must not accumulate",
  );
  report.desktop.retainedGeometries = retained;
  report.desktop.heapRetentionBytes = {
    before: heapBefore,
    after: await heap(),
    meaning:
      "CDP used JavaScript heap after explicit GC before/after six confirmed construction edits; GPU buffers checked separately",
  };
  assert(
    report.desktop.heapRetentionBytes.after - heapBefore < 5 * 1024 * 1024,
    "Six edits must not retain unbounded JavaScript allocations",
  );
  await memorySession.detach();
  await page
    .getByRole("button", { name: "Remove all proposed buildings", exact: true })
    .click();
  await count(page, 0);
  await camera(page);
  assert((await metrics(page)).triangles < settled.triangles);
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).calls, 7); // Five source passes + two R1B architectural batches.
  assert.equal((await metrics(page)).geometries, 8); // Original batch, filtered index view and two asset geometries are bounded.
  await page.close();
  report.checks.push(
    "Terrain placement; direct resize and rotation; numeric storeys, purpose and roof; observed-building and water rejection; hypothetical geometry visibly changes 3D",
  );
  report.checks.push(
    "Combined public-space/construction plans; challenge achieved; zero automatic traffic edits; retained traffic results; undo/redo, compare, save/reload, actual JSON export/import, legacy 3B and 4A imports",
  );
  const mobile = await setup(true);
  report.mobile.loadMs = mobile.loadMs;
  const m = mobile.page;
  await enter(m);
  await importJson(m, legacyEmpty);
  await m.getByRole("button", { name: "Residential", exact: true }).click();
  await camera(m, [-40, 115, -100], [9, 1, -213]);
  const touch = await screen(m, 9, -213);
  await m.touchscreen.tap(touch.x, touch.y);
  await valid(m);
  await m.getByLabel("Storeys", { exact: true }).fill("3");
  await confirm(m);
  await count(m, 1);
  await camera(m, [-40, 115, -100], [9, 1, -213]);
  assert(
    (await metrics(m)).triangles > 288104,
    "The touch-placed concept must be visible in the mobile scene",
  );
  await m.screenshot({ path: resolve(output, "06-mobile-construction.jpg") });
  const mobilePlan = await exportPlan(m);
  await m.reload();
  await m.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(m);
  await importJson(m, mobilePlan);
  await count(m, 1);
  await importJson(m, fourA);
  await run(m);
  report.mobile.compatibilityProfile = await profile(m);
  await importJson(m, exported);
  await run(m);
  report.mobile.developedProfile = await profile(m);
  assert.equal(
    await m.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "Mobile layout must fit viewport",
  );
  await m.getByRole("button", { name: "Reset city", exact: true }).click();
  await m
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(m);
  assert.equal((await metrics(m)).geometries, 8);
  await m.close();
  report.checks.push(
    "Touch placement, accessible numeric editing, mobile import/reload and viewport fit; bounded draw calls, GPU geometry disposal, zero idle frames",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  assert(
    [...requests].every(
      (url) => url.startsWith(base) || url.startsWith("blob:"),
    ),
    "No external services are used",
  );
  report.passed = true;
  report.errors = errors;
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page
        .screenshot({ path: resolve(output, "failure.png") })
        .catch(() => {});
    }
  report.passed = false;
  report.errors = [...errors, e.stack];
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw e;
} finally {
  await browser.close();
}
