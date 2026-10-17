import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-5a/after");
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
const legacy = readFileSync(
  new URL("../public/plans/rethinking-example.json", import.meta.url),
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
try {
  const { page, loadMs } = await setup();
  report.desktop.loadMs = loadMs;
  await enter(page);
  // Import the exact 4B legacy geometry, which has no living-city field.
  const legacy4b = readFileSync(
    new URL("../public/plans/urban-quarter-example.json", import.meta.url),
  );
  await importJson(page, legacy4b);
  await living(page);
  const zero = await stocks(page);
  assert.equal(Number(zero.households), 0);
  assert.equal(Number(zero.jobs), 0);
  await camera(page);
  const before = await metrics(page),
    beforeImage = await scenePhoto(page, "01-month-zero.jpg");
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
  await settle(page);
  const initialSix = await stocks(page);
  assert(Number(initialSix.households) > 0 && Number(initialSix.jobs) > 0);
  assert(Number(initialSix.households) < 4);
  assert.match(
    await page.getByLabel("District constraint", { exact: true }).innerText(),
    /workforce/i,
  );
  await camera(page);
  const developed = await metrics(page);
  assert.equal(developed.calls, before.calls);
  assert.equal(developed.triangles, before.triangles);
  assert.equal(developed.geometries, before.geometries);
  assert.notDeepEqual(
    await scenePhoto(page, "02-six-month-activity.jpg"),
    beforeImage,
    "Visible building activity must change with identical camera and geometry",
  );
  // Inspect a previous result without rerunning or changing the plan.
  await page.getByLabel("Inspect simulated month", { exact: true }).fill("2");
  await month(page, 2);
  await page.getByLabel("Inspect simulated month", { exact: true }).fill("6");
  await month(page, 6);
  assert.deepEqual(await stocks(page), initialSix);
  // Save the smaller strategy before directly changing the residential proposal.
  await library(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Smaller housing strategy");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page
    .getByText("Plan saved in this browser.", { exact: true })
    .waitFor();
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans[0],
  );
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await page
    .getByLabel("Proposed buildings", { exact: true })
    .selectOption("study-0");
  await page
    .getByLabel("Selected building simulated activity", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await page.getByLabel("Storeys", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Confirm building", exact: true })
    .click();
  await page.getByRole("button", { name: "Living City", exact: true }).click();
  await month(page, 0);
  assert.equal(Number((await stocks(page)).households), 0);
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
  const changedSix = await stocks(page);
  report.desktop.strategies = {
    month: 6,
    originalTwoStoreys: initialSix,
    revisedThreeStoreys: changedSix,
  };
  assert(Number(changedSix.households) > Number(initialSix.households));
  assert(Number(changedSix.jobs) > Number(initialSix.jobs));
  assert(Number(changedSix.serviceDemand) > Number(initialSix.serviceDemand));
  await page
    .getByLabel("District comparison plan", { exact: true })
    .selectOption(original.id);
  await month(page, 0);
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
  const comp = page.getByLabel("District strategy comparison", { exact: true });
  assert.equal(
    Number(await comp.getAttribute("data-reference-households")),
    Number(initialSix.households),
  );
  assert.equal(
    Number(await comp.getAttribute("data-reference-jobs")),
    Number(initialSix.jobs),
  );
  await camera(page);
  await page.screenshot({
    path: resolve(output, "03-strategy-comparison.jpg"),
  });
  await page
    .getByRole("button", { name: "Show saved district", exact: true })
    .click();
  await camera(page);
  await page
    .getByRole("button", { name: "Show current district", exact: true })
    .click();
  // Pausing ends automatic ticks; settled renderer produces no idle frames.
  await page
    .getByRole("button", { name: "Play district", exact: true })
    .click();
  await month(page, 7);
  await page
    .getByRole("button", { name: "Pause district", exact: true })
    .click();
  await settle(page);
  const paused = await stocks(page);
  await page.waitForTimeout(1200);
  assert.deepEqual(await stocks(page), paused);
  await page
    .getByRole("button", { name: "Advance to month 24", exact: true })
    .click();
  await month(page, 24);
  await page
    .getByRole("button", {
      name: "Challenge · A Balanced New Quarter",
      exact: true,
    })
    .click();
  await page
    .getByText("Balanced New Quarter achieved", { exact: true })
    .waitFor();
  const final = await stocks(page);
  report.desktop.finalStocks = final;
  await camera(page);
  await page.screenshot({ path: resolve(output, "04-balanced-quarter.jpg") });
  await independentTrafficForProfile(page);
  report.desktop.activeProfile = await profile(page);
  report.desktop.workerComputeMs = await page
    .getByLabel("District outcomes", { exact: true })
    .getAttribute("data-worker-ms");
  await page
    .getByRole("button", { name: "Show observed Bergen", exact: true })
    .click();
  await camera(page);
  assert(
    (await metrics(page)).triangles < report.desktop.activeProfile.triangles,
  );
  await page
    .getByRole("button", { name: "Show proposed district", exact: true })
    .click();
  await library(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Living quarter strategy");
  await page
    .getByRole("button", { name: "Duplicate plan", exact: true })
    .click();
  await page
    .getByText("Plan duplicated locally. The original is unchanged.", {
      exact: true,
    })
    .waitFor();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans.at(-1),
  );
  const exported = await exportPlan(page);
  assert.equal(exported.version, 4);
  assert.equal(exported.living.version, 1);
  assert.equal(exported.results, undefined);
  writeFileSync(
    resolve(output, "combined-living-plan.json"),
    JSON.stringify(exported, null, 2) + "\n",
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(page);
  await openSaved(page, saved.id);
  await living(page);
  await page
    .getByRole("button", { name: "Advance to month 24", exact: true })
    .click();
  await month(page, 24);
  assert.deepEqual(await stocks(page), final);
  // Inputs, not outcomes, are imported; bad input must preserve the running design and month.
  const bad = { ...exported, living: { ...exported.living, completed: true } };
  await importJson(page, bad, "invalid-completion.json");
  assert.deepEqual(await stocks(page), final);
  assert.deepEqual(await exportPlan(page), exported);
  await importJson(page, Buffer.from(legacy));
  await month(page, 0);
  assert.equal(Number((await stocks(page)).households), 0);
  const fourA = readFileSync(
    new URL("../public/plans/waterfront-example.json", import.meta.url),
  );
  await importJson(page, fourA);
  await month(page, 0);
  assert.equal(Number((await stocks(page)).jobs), 0);
  await importJson(page, legacy4b);
  await month(page, 0);
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
  assert.deepEqual(await stocks(page), initialSix);
  // Undo/redo changes both construction and the district baseline without copying old activity.
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await page
    .getByLabel("Proposed buildings", { exact: true })
    .selectOption("study-0");
  await page
    .getByRole("button", { name: "Edit building", exact: true })
    .click();
  await page.getByLabel("Storeys", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Confirm building", exact: true })
    .click();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await page.getByRole("button", { name: "Living City", exact: true }).click();
  await month(page, 0);
  await page
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(page, 6);
  assert.equal(
    Number((await stocks(page)).households),
    Number(changedSix.households),
  );
  // Repeated time resets and worker generations retain a fixed mesh set and bounded heap.
  await camera(page);
  const retained = [],
    session = await page.context().newCDPSession(page);
  const heap = async () => {
    await session.send("HeapProfiler.collectGarbage");
    return (await session.send("Runtime.getHeapUsage")).usedSize;
  };
  const heapBefore = await heap();
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole("button", { name: "Reset district time", exact: true })
      .click();
    await month(page, 0);
    await page
      .getByRole("button", { name: "Advance to month 24", exact: true })
      .click();
    await month(page, 24);
    await camera(page);
    retained.push((await metrics(page)).geometries);
  }
  const heapAfter = await heap();
  assert(Math.max(...retained) - Math.min(...retained) === 0);
  assert(heapAfter - heapBefore < 5 * 1024 * 1024);
  report.desktop.memory = {
    retainedGeometries: retained,
    heapBefore,
    heapAfter,
  };
  await session.detach();
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).calls, 5);
  assert.equal((await metrics(page)).geometries, 5);
  await page.close();
  report.checks.push(
    "Load legacy 4B → living month zero → six dynamic months → identify workforce imbalance → add residential storey → rerun from identical baseline → compare saved strategies",
  );
  report.checks.push(
    "Direct 3D activity colour change without mesh growth; previous-month inspection; automatic play/pause; 24-month challenge; local save/reload and exact replay; strict imports; 3B/4A/4B compatibility; construction undo/redo",
  );
  const mobile = await setup(true);
  report.mobile.loadMs = mobile.loadMs;
  const m = mobile.page;
  await enter(m);
  await importJson(m, Buffer.from(legacy4b));
  await living(m);
  await m
    .getByRole("button", { name: "Advance six months", exact: true })
    .click();
  await month(m, 6);
  assert.equal(
    Number((await stocks(m)).households),
    Number(initialSix.households),
  );
  await camera(m, [-40, 115, -100], [9, 1, -213]);
  await m.screenshot({ path: resolve(output, "05-mobile-living-quarter.jpg") });
  await m.getByLabel("Inspect simulated month", { exact: true }).fill("1");
  await month(m, 1);
  await m.getByLabel("Inspect simulated month", { exact: true }).fill("6");
  await month(m, 6);
  await independentTrafficForProfile(m);
  report.mobile.activeProfile = await profile(m);
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await importJson(m, exported);
  await month(m, 0);
  await m
    .getByRole("button", { name: "Advance to month 24", exact: true })
    .click();
  await month(m, 24);
  assert.deepEqual(await stocks(m), final);
  await library(m);
  await m.getByRole("button", { name: "Save plan", exact: true }).click();
  const mobileSaved = await m.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bergen.reimagined.plans.v1")).plans[0]
        .id,
  );
  await m.reload();
  await m.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await enter(m);
  await openSaved(m, mobileSaved);
  await living(m);
  await m
    .getByRole("button", { name: "Advance to month 24", exact: true })
    .click();
  await month(m, 24);
  assert.deepEqual(await stocks(m), final);
  await settle(m);
  await m.getByRole("button", { name: "Reset city", exact: true }).click();
  await m
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(m);
  assert.equal((await metrics(m)).geometries, 5);
  await m.close();
  report.checks.push(
    "Mobile timeline/inspection, 24-month scenario replay, local reload, viewport fit and zero idle frames; repeated worker resets retain bounded heap and fixed GPU geometry",
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
