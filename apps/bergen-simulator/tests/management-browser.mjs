import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-5b/after");
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
    cameraLatencySamplesMs: samples.map((v) => v.cameraLatencyMs),
  };
}
async function enter(page) {
  await page
    .getByRole("button", { name: "Enter Planning Mode →", exact: true })
    .click();
  await page.getByRole("button", { name: "Buildings", exact: true }).waitFor();
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
async function independentTrafficForProfile(page) {
  const at = Number((await stocks(page)).month);
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await page.getByRole("button", { name: "▶ Run plan", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Simulation complete" })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Living City", exact: true }).click();
  await month(page, at);
}
async function living(page) {
  await page.getByRole("button", { name: "Living City", exact: true }).click();
  await month(page, 0);
}
async function month(page, n) {
  await page.waitForFunction(
    (n) =>
      document.querySelector('[aria-label="District outcomes"]')?.dataset
        .month === String(n) &&
      document
        .querySelector('[aria-label="District status"]')
        ?.textContent.includes(`District month ${n} ready`),
    n,
    { timeout: 30000 },
  );
}
async function stocks(page) {
  return page.getByLabel("District outcomes", { exact: true }).evaluate((e) => {
    const result = { ...e.dataset };
    delete result.workerMs;
    return result;
  });
}
async function scenePhoto(page, name) {
  const tools = page.getByLabel("Living City map tools", { exact: true });
  await tools.evaluate((e) => (e.style.visibility = "hidden"));
  await page.locator("canvas").screenshot({ path: resolve(output, name) });
  const bytes = await page.locator("canvas").screenshot();
  await tools.evaluate((e) => (e.style.visibility = ""));
  return bytes;
}
async function openSaved(page, id) {
  await library(page);
  await page.getByLabel("Saved plans", { exact: true }).selectOption(id);
  await page
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
}
async function exportPlan(page) {
  await library(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  return JSON.parse(readFileSync(await (await pending).path()));
}
const fiveA = readFileSync(
  new URL("../public/plans/living-quarter-example.json", import.meta.url),
);
async function management(page) {
  const el = page.locator(".city-management");
  if (!(await el.evaluate((e) => e.open)))
    await el.locator("summary").first().click();
}
async function accounts(page) {
  return page
    .getByLabel("City Management accounts", { exact: true })
    .evaluate((e) => ({ ...e.dataset }));
}
async function choose(page, name) {
  await page
    .getByLabel("Construction projects", { exact: true })
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
async function schedule(page, patch) {
  for (const [name, value] of Object.entries(patch))
    await page.getByLabel(name, { exact: true }).fill(String(value));
  const frames = (await metrics(page)).frames,
    started = performance.now();
  await page
    .getByRole("button", { name: "Apply construction schedule", exact: true })
    .click();
  await month(page, 0);
  await page.waitForFunction(
    (n) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
    frames,
  );
  const elapsed = performance.now() - started;
  const device =
    page.viewportSize().width < 700 ? report.mobile : report.desktop;
  (device.scheduleCommandSamplesMs ??= []).push(elapsed);
  return elapsed;
}
async function funding(page, patch) {
  const el = page.locator(".public-funding");
  if (!(await el.evaluate((e) => e.open))) await el.locator("summary").click();
  for (const [name, value] of Object.entries(patch))
    await page.getByLabel(name, { exact: true }).fill(String(value));
  await page
    .getByRole("button", { name: "Apply public funding", exact: true })
    .click();
  await month(page, 0);
}
async function to24(page) {
  await page
    .getByRole("button", { name: "Advance to month 24", exact: true })
    .click();
  await month(page, 24);
}
async function six(page) {
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
}
async function save(page, name) {
  await library(page);
  await page.getByLabel("Plan name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page
    .getByText("Plan saved in this browser.", { exact: true })
    .waitFor();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans.at(-1),
  );
}
try {
  const { page, loadMs } = await setup();
  report.desktop.loadMs = loadMs;
  await enter(page);
  await page.getByRole("button", { name: "Living City", exact: true }).click();
  await month(page, 0);
  assert(
    (await accounts(page)).projects === "[]",
    "Fresh plans use scheduled construction by default",
  );
  await importJson(page, fiveA);
  await month(page, 0);
  await management(page);
  await page
    .getByLabel("Legacy commissioning compatibility", { exact: true })
    .waitFor();
  await six(page);
  const legacySix = await stocks(page);
  assert.equal(Number(legacySix.households), 6.59048593755636);
  assert.equal(Number(legacySix.jobs), 8.88097187511272);
  const migrated = await exportPlan(page);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.management.mode, "legacy-immediate");
  assert(
    migrated.management.projects.every(
      (p) => p.startMonth === 0 && p.durationMonths === 0,
    ),
  );
  report.desktop.legacyImmediateSix = legacySix;
  await page
    .getByRole("button", { name: "Schedule this development", exact: true })
    .click();
  await month(page, 0);
  await choose(page, "Quay workspace");
  await schedule(page, {
    "Construction start month": 2,
    "Construction duration": 1,
  });
  await choose(page, "Community pavilion");
  await schedule(page, { "Civic investment priority": 1 });
  assert.equal(Number((await stocks(page)).households), 0);
  await camera(page);
  const planned = await metrics(page),
    plannedImage = await scenePhoto(page, "01-planned.jpg");
  report.desktop.phaseMetrics = { planned };
  await page
    .getByRole("button", { name: "Advance one month", exact: true })
    .click();
  await month(page, 1);
  await camera(page);
  const building = await metrics(page),
    m1 = await accounts(page),
    ph1 = JSON.parse(m1.projects);
  assert.equal(ph1.find((p) => p.id === "study-0").phase, "under-construction");
  assert.equal(ph1.find((p) => p.id === "study-1").phase, "planned");
  assert.equal(Number((await stocks(page)).households), 0);
  assert.equal(Number((await stocks(page)).jobs), 0);
  report.desktop.phaseMetrics.underConstruction = building;
  assert(building.triangles > planned.triangles);
  assert.notDeepEqual(
    await scenePhoto(page, "02-under-construction.jpg"),
    plannedImage,
  );
  assert.equal(Number(m1.capitalSpent), 19200);
  await page
    .getByRole("button", { name: "Advance one month", exact: true })
    .click();
  await month(page, 2);
  await page
    .getByRole("button", { name: "Advance one month", exact: true })
    .click();
  await month(page, 3);
  assert.equal(Number((await stocks(page)).households), 0);
  assert(Number((await stocks(page)).jobs) > 0);
  await page
    .getByRole("button", { name: "Advance one month", exact: true })
    .click();
  await month(page, 4);
  assert(Number((await stocks(page)).households) > 0);
  assert.equal(Number((await accounts(page)).potential), 0);
  await page
    .getByRole("button", { name: "Advance one month", exact: true })
    .click();
  await month(page, 5);
  const commissioned = await accounts(page);
  assert.equal(Number(commissioned.potential), 19);
  assert.equal(Number(commissioned.funded), 19);
  assert(
    JSON.parse(commissioned.projects).every((p) => p.phase === "operational"),
  );
  await camera(page);
  await scenePhoto(page, "03-operational.jpg");
  report.desktop.phaseMetrics.operational = await metrics(page);
  assert((await metrics(page)).calls <= 11);
  await to24(page);
  const healthy = await stocks(page);
  report.desktop.funded24 = healthy;
  const early = await save(page, "Early funded quarter");
  const earlyFile = await exportPlan(page);
  await funding(page, { "Monthly operating funding": 0 });
  await six(page);
  assert.equal(Number((await accounts(page)).potential), 19);
  assert.equal(Number((await accounts(page)).funded), 0);
  await page.getByLabel("Operating shortfall", { exact: true }).waitFor();
  await to24(page);
  const underfunded = await stocks(page);
  assert(Number(underfunded.households) < Number(healthy.households));
  assert(Number(underfunded.serviceUnmet) > 0);
  report.desktop.underfunded24 = underfunded;
  await camera(page);
  await page
    .getByLabel("City Management accounts", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "04-underfunded-services.jpg"),
  });
  await funding(page, { "Monthly operating funding": 40 });
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  await funding(page, { "Starting capital allocation": 0 });
  await six(page);
  const deferred = await accounts(page);
  assert.equal(Number(deferred.capitalSpent), 0);
  assert(
    JSON.parse(deferred.projects).find((p) => p.id === "study-2").deferred,
  );
  await page.getByLabel("Capital deferral", { exact: true }).waitFor();
  await camera(page);
  await page
    .getByLabel("City Management accounts", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "05-capital-deferral.jpg") });
  await funding(page, { "Starting capital allocation": 1000 });
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  await choose(page, "Community pavilion");
  await page.getByLabel("Cancel project month", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Apply construction schedule", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Cancellation must" })
    .waitFor();
  assert.deepEqual(await stocks(page), healthy);
  await schedule(page, { "Cancel project month": 3 });
  await six(page);
  const cancelled = await accounts(page);
  assert.equal(
    JSON.parse(cancelled.projects).find((p) => p.id === "study-2").phase,
    "cancelled",
  );
  assert.equal(Number(cancelled.capitalSpent), 38400);
  assert.equal(Number(cancelled.potential), 0);
  await schedule(page, { "Cancel project month": "" });
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  // Otherwise identical designs, changed commissioning schedules.
  await choose(page, "Quay homes");
  report.desktop.scheduleEditLatencyMs = await schedule(page, {
    "Construction start month": 15,
    "Construction duration": 5,
  });
  await camera(page);

  await choose(page, "Community pavilion");
  await schedule(page, { "Construction start month": 12 });
  await page
    .getByLabel("District comparison plan", { exact: true })
    .selectOption(early.id);
  await month(page, 0);
  await to24(page);
  const late = await stocks(page);
  assert(Number(late.households) < Number(healthy.households));
  assert(Number(late.jobs) < Number(healthy.jobs));
  const comparison = page.getByLabel("District strategy comparison", {
    exact: true,
  });
  assert.equal(
    Number(await comparison.getAttribute("data-reference-households")),
    Number(healthy.households),
  );
  report.desktop.late24 = late;
  await camera(page);
  await comparison.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "06-sequencing-comparison.jpg"),
  });
  await openSaved(page, early.id);
  await month(page, 0);
  await to24(page);
  await page
    .getByRole("button", {
      name: "Challenge · Building a Sustainable Quarter",
      exact: true,
    })
    .click();
  await page
    .getByText("Sustainable Quarter achieved", { exact: true })
    .waitFor();
  await camera(page);
  await page
    .getByLabel("Building a Sustainable Quarter challenge", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "07-management-challenge.jpg"),
  });
  const exported = await exportPlan(page);
  assert.equal(exported.version, 5);
  assert.equal(exported.management.version, 1);
  assert.equal(exported.results, undefined);
  assert.equal(exported.management.balances, undefined);
  writeFileSync(
    resolve(output, "combined-management-plan.json"),
    JSON.stringify(exported, null, 2) + "\n",
  );
  await importJson(
    page,
    { ...exported, management: { ...exported.management, completed: true } },
    "invalid-management.json",
  );
  assert.deepEqual(await stocks(page), healthy);
  assert.deepEqual(await exportPlan(page), exported);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(page);
  await openSaved(page, early.id);
  await living(page);
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  await importJson(page, exported);
  await month(page, 0);
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  // Shared management history changes and restores the actual plan, without cached outcomes.
  await funding(page, { "Monthly operating funding": 0 });
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await month(page, 0);
  await to24(page);
  assert.deepEqual(await stocks(page), healthy);
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await month(page, 0);
  await to24(page);
  assert(Number((await stocks(page)).serviceUnmet) > 0);
  for (const name of [
    "rethinking",
    "waterfront",
    "urban-quarter",
    "living-quarter",
  ]) {
    await importJson(
      page,
      readFileSync(
        new URL(`../public/plans/${name}-example.json`, import.meta.url),
      ),
    );
    await month(page, 0);
    const f = await exportPlan(page);
    assert.equal(f.management.mode, "legacy-immediate");
    assert(
      f.management.projects.every(
        (p) => p.startMonth === 0 && p.durationMonths === 0,
      ),
    );
  }
  await six(page);
  assert.deepEqual(await stocks(page), legacySix);
  await importJson(page, earlyFile);
  await month(page, 0);
  await to24(page);
  await independentTrafficForProfile(page);
  report.desktop.activeProfile = await profile(page);
  report.desktop.workerComputeMs = await page
    .getByLabel("District outcomes", { exact: true })
    .getAttribute("data-worker-ms");
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  };
  const heapBefore = await heap(),
    retained = [];
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole("button", { name: "Reset district time", exact: true })
      .click();
    await month(page, 0);
    await to24(page);
    await camera(page);
    retained.push((await metrics(page)).geometries);
  }
  const heapAfter = await heap();
  assert.equal(Math.max(...retained) - Math.min(...retained), 0);
  assert(heapAfter - heapBefore < 5 * 1024 * 1024);
  report.desktop.memory = {
    heapBefore,
    heapAfter,
    retainedGeometries: retained,
  };
  await cdp.detach();
  await settle(page);
  await page
    .getByRole("button", { name: "Show observed Bergen", exact: true })
    .click();
  await camera(page);
  assert(
    (await metrics(page)).triangles < report.desktop.activeProfile.triangles,
  );
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).calls, 5);
  assert.equal((await metrics(page)).geometries, 5);
  await page.close();
  report.checks.push(
    "Legacy 5A exact replay; explicit scheduled conversion; project dates/priority; planned → construction → operational 3D; no unfinished capacity",
  );
  report.checks.push(
    "Operating shortfall and restored funding; capital deferral without overspending; schedule strategy comparison; verified challenge; shared undo/redo; save/reload/export/import and versions 1–4",
  );
  const mobile = await setup(true);
  report.mobile.loadMs = mobile.loadMs;
  const m = mobile.page;
  await enter(m);
  await importJson(m, exported);
  await living(m);
  await choose(m, "Community pavilion");
  await schedule(m, {
    "Construction start month": 2,
    "Construction duration": 3,
  });
  await six(m);
  const ma = await accounts(m);
  assert.equal(Number(ma.potential), 19);
  assert(Number((await stocks(m)).households) > 0);
  await camera(m, [-40, 115, -100], [9, 1, -213]);
  await m.screenshot({ path: resolve(output, "08-mobile-management.jpg") });
  await funding(m, { "Monthly operating funding": 0 });
  await six(m);
  assert.equal(Number((await accounts(m)).funded), 0);
  await pageSafeViewport(m);
  await importJson(m, exported);
  await month(m, 0);
  await to24(m);
  assert.deepEqual(await stocks(m), healthy);
  await save(m, "Mobile managed quarter");
  await m.reload();
  await m.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(m);
  const savedId = await m.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans[0]
        .id,
  );
  await openSaved(m, savedId);
  await living(m);
  await to24(m);
  assert.deepEqual(await stocks(m), healthy);
  await independentTrafficForProfile(m);
  report.mobile.activeProfile = await profile(m);
  await pageSafeViewport(m);
  await settle(m);
  await m.getByRole("button", { name: "Reset city", exact: true }).click();
  await m
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(m);
  assert.equal((await metrics(m)).geometries, 5);
  await m.close();
  report.checks.push(
    "Touch viewport scheduling/funding, exact local replay, stable geometry retention and zero idle frames under production CSP",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  assert(
    [...requests].every(
      (url) => url.startsWith(base) || url.startsWith("blob:"),
    ),
  );
  report.passed = true;
  report.errors = [];
} catch (e) {
  report.passed = false;
  report.errors = [...errors, e.stack];
  for (const c of browser.contexts())
    for (const page of c.pages())
      await page
        .screenshot({ path: resolve(output, "failure.png") })
        .catch(() => {});
  throw e;
} finally {
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
async function pageSafeViewport(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
