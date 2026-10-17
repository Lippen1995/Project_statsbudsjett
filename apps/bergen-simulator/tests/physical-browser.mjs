import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-4a");
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
      new URL("../public/plans/waterfront-example.json", import.meta.url),
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
  await page
    .getByRole("button", { name: "Physical public spaces", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Physical public spaces", exact: true })
    .click();
}
async function screen(page, x, z, handle = false) {
  const rect = await page.locator("canvas").boundingBox(),
    m = await metrics(page);
  const c = new PerspectiveCamera(43, rect.width / rect.height, 2, 14000);
  c.position.fromArray(m.position);
  c.lookAt(new Vector3(...m.target));
  c.updateMatrixWorld();
  const v = new Vector3(x, height(x, z) + (handle ? 1.2 : 0), z).project(c);
  return {
    x: rect.x + ((v.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - v.y) * rect.height) / 2,
  };
}
async function draw(page, mobile = false) {
  await page
    .getByRole("button", { name: "New public-space footprint", exact: true })
    .click();
  await camera(page);
  for (const [x, z] of example.physical.proposals[0].vertices) {
    const q = await screen(page, x, z);
    if (mobile) await page.touchscreen.tap(q.x, q.y);
    else await page.mouse.click(q.x, q.y);
    await page.waitForTimeout(100);
  }
  await page
    .locator('.physical-map-tools [data-placement-valid="true"]')
    .waitFor();
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

try {
  const { page, loadMs } = await setup();
  report.desktop.loadMs = loadMs;
  await enter(page);
  await camera(page);
  await page
    .locator("canvas")
    .screenshot({ path: resolve(output, "01-before-waterfront.jpg") });
  const initial = await metrics(page);
  await draw(page);
  await page
    .getByLabel("Space name", { exact: true })
    .fill("Bryggen public-space trial");
  await camera(page);
  await page.screenshot({ path: resolve(output, "02-live-placement.jpg") });
  await page
    .getByRole("button", { name: "Apply surface", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit shape", exact: true }).waitFor();
  await camera(page);
  const applied = await metrics(page);
  assert(
    applied.triangles > initial.triangles,
    "Applied footprint must add real scene triangles",
  );
  await page
    .locator("canvas")
    .screenshot({ path: resolve(output, "03-proposed-waterfront.jpg") });
  const proposed = await page.locator("canvas").screenshot();
  await page
    .getByRole("button", { name: "Show observed city", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).triangles, initial.triangles);
  assert.notDeepEqual(await page.locator("canvas").screenshot(), proposed);
  await page
    .getByRole("button", { name: "Show proposed city", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit shape", exact: true }).click();
  await camera(page);
  // Direct manipulation on the real terrain, followed by keyboard-accessible precision editing.
  const from = await screen(page, -53, -255, true),
    to = await screen(page, -52, -256);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await page
    .locator('.physical-map-tools [data-placement-valid="true"]')
    .waitFor();
  await page.locator(".precision-tools summary").click();
  await page.getByLabel("Active corner", { exact: true }).selectOption("0");
  const moved = Number(
    await page.getByLabel("Corner east metres", { exact: true }).inputValue(),
  );
  assert(
    Math.abs(moved + 52) < 0.2,
    "Dragging must move a vertex, not orbit the camera",
  );
  await page.getByLabel("Corner east metres", { exact: true }).fill("-140");
  await page
    .locator('.physical-map-tools [data-placement-valid="false"]')
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Apply surface", exact: true })
      .isDisabled(),
  );
  await page.screenshot({ path: resolve(output, "04-invalid-placement.jpg") });
  await page.getByLabel("Corner east metres", { exact: true }).fill("-53");
  await page.getByLabel("Corner south metres", { exact: true }).fill("-255");
  await page
    .getByRole("button", { name: "Confirm public space", exact: true })
    .click();
  assert.match(
    await page.locator(".road-conflicts").innerText(),
    /way\/9649862/,
  );
  // A physical access choice must not overwrite an already chosen capacity.
  await page
    .getByRole("button", { name: "Street operations", exact: true })
    .click();
  await page
    .getByLabel("Select modelled section", { exact: true })
    .selectOption("way/9649862:645523:75457133");
  await page
    .getByLabel("Assumed capacity", { exact: true })
    .selectOption("1.25");
  await page
    .getByRole("button", { name: "Physical public spaces", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Apply local + servicing access",
      exact: true,
    })
    .click();
  const result = await run(page);
  assert.match(result.rows, /960/);
  report.desktop.computeMs = result.computeMs;
  report.checks.push(
    "Mouse polygon draw, terrain-following mesh, direct corner drag, accessible coordinate edit and invalid-placement rejection",
  );
  await camera(page);
  await page.screenshot({
    path: resolve(output, "05-combined-plan-results.jpg"),
  });
  const intensity = await page.locator("canvas").screenshot();
  await page
    .getByRole("button", { name: "Initial baseline", exact: true })
    .click();
  await camera(page);
  assert.notDeepEqual(await page.locator("canvas").screenshot(), intensity);
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  assert.match(
    await page.locator(".road-conflicts").innerText(),
    /Model access: all/,
  );
  await run(page);
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  const repeated = await run(page);
  assert.equal(repeated.rows, result.rows);
  report.checks.push(
    "Explicit road rule changes synthetic routes; baseline comparison and cross-type undo/redo rerun reproducibly",
  );
  await library(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Combined waterfront trial");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  const saved = await page
    .getByLabel("Saved plans", { exact: true })
    .locator("option")
    .last()
    .getAttribute("value");
  assert(saved);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  await enter(page);
  await library(page);
  await page.getByLabel("Saved plans", { exact: true }).selectOption(saved);
  await page
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  assert.match(
    await page.getByLabel("Geometric plan comparison").innerText(),
    /3\d\d\.\d m²/,
  );
  const restored = await run(page);
  assert.equal(restored.rows, result.rows);
  // A second physical design keeps the original intact and is compared from the same synthetic demand.
  await page
    .getByLabel("Proposed spaces", { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Edit shape", exact: true }).click();
  await page
    .getByLabel("Surface treatment", { exact: true })
    .selectOption("landscaped");
  await page.locator(".precision-tools summary").click();
  await page.getByLabel("Active corner", { exact: true }).selectOption("0");
  await page.getByLabel("Corner east metres", { exact: true }).fill("-52");
  await page
    .getByRole("button", { name: "Confirm public space", exact: true })
    .click();
  await library(page);
  await page
    .getByRole("button", { name: "Duplicate plan", exact: true })
    .click();
  await page
    .getByLabel("Compare with saved plan", { exact: true })
    .selectOption(saved);
  await run(page);
  await camera(page);
  const alternative = await page.locator("canvas").screenshot();
  await page
    .getByRole("button", { name: "Show saved design", exact: true })
    .click();
  await camera(page);
  assert.notDeepEqual(await page.locator("canvas").screenshot(), alternative);
  await page.screenshot({
    path: resolve(output, "06-saved-design-comparison.jpg"),
  });
  await page.getByLabel("Saved plans", { exact: true }).selectOption(saved);
  await page
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  assert.equal((await run(page)).rows, result.rows);
  report.checks.push(
    "Duplicated physical designs compare independently in 3D without overwriting the original",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON", exact: true }).click(),
  ]);
  const path = resolve(output, "combined-waterfront-plan.json");
  await download.saveAs(path);
  const exported = JSON.parse(readFileSync(path));
  assert.equal(exported.version, 3);
  assert.equal(exported.physical.proposals.length, 1);
  assert.equal(exported.plan.interventions.length, 1);
  assert.equal(
    exported.plan.interventions[0].capacityFactor,
    1.25,
    "Access-only choice preserves explicit capacity edit",
  );
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page
    .getByRole("button", { name: "Physical public spaces", exact: true })
    .click();
  await importJson(page, exported);
  assert.equal((await run(page)).rows, result.rows);
  const bad = {
    ...exported,
    physical: {
      ...exported.physical,
      proposals: [
        {
          ...exported.physical.proposals[0],
          vertices: [
            [-140, -160],
            [-130, -160],
            [-130, -150],
            [-140, -150],
          ],
        },
      ],
    },
  };
  await importJson(page, bad, "invalid.json");
  assert.match(await page.getByRole("alert").innerText(), /Import rejected/);
  assert.equal(
    await page.locator(".scenario-results tbody").innerText(),
    result.rows,
  );
  report.checks.push(
    "Save/reload, real JSON download/import and malformed geometry rejection preserve the active combined plan",
  );
  await importJson(page, legacy, "legacy-3b.json");
  assert.match(
    await page.locator(".plan-heading").innerText(),
    /5 proposed section edits/,
  );
  assert.match(
    await page.getByLabel("Geometric plan comparison").innerText(),
    /Your plan: 0\.0 m²/,
  );
  await importJson(page, example);
  await page
    .getByRole("button", {
      name: "Challenge · Transforming the Bryggen Waterfront",
      exact: true,
    })
    .click();
  await run(page);
  assert.match(
    await page
      .getByLabel("Transforming the Bryggen Waterfront challenge")
      .innerText(),
    /Waterfront challenge achieved/,
  );
  report.checks.push(
    "Legacy 3B import succeeds and a real-network combined plan achieves the optional challenge",
  );
  report.desktop.activeProfile = await profile(page);
  await camera(page);
  await page.screenshot({ path: resolve(output, "06-challenge.jpg") });
  // Select an applied surface directly, then inspect/remove it. No source features are edited.
  const centre = await screen(page, -40.5, -238.5);
  await page.mouse.click(centre.x, centre.y);
  await page
    .getByRole("button", { name: "Remove public space", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Remove public space", exact: true })
    .click();
  assert.match(
    await page.getByLabel("Geometric plan comparison").innerText(),
    /Your plan: 0\.0 m²/,
  );
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  assert.match(
    await page.getByLabel("Geometric plan comparison").innerText(),
    /315\.0 m²/,
  );
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await page.getByRole("button", { name: "Reset city", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave Planning Mode", exact: true })
    .click();
  await camera(page);
  assert.equal((await metrics(page)).calls, 5);
  assert.equal(
    (await metrics(page)).geometries,
    5,
    "Obsolete draft/surface/traffic buffers must be disposed after reset and exit",
  );
  report.checks.push(
    "Direct surface inspection/removal and reset return the city to the original five rendering passes",
  );
  await page.close();
  const mobile = await setup(true),
    phone = mobile.page;
  report.mobile.loadMs = mobile.loadMs;
  await enter(phone);
  await draw(phone, true);
  await phone
    .getByLabel("Surface treatment", { exact: true })
    .selectOption("landscaped");
  await phone
    .getByRole("button", { name: "Confirm public space", exact: true })
    .click();
  await phone
    .getByRole("button", {
      name: "Apply local + servicing access",
      exact: true,
    })
    .click();
  const phoneResult = await run(phone);
  report.mobile.computeMs = phoneResult.computeMs;
  await library(phone);
  await phone
    .getByLabel("Plan name", { exact: true })
    .fill("Touch waterfront study");
  await phone.getByRole("button", { name: "Save plan", exact: true }).click();
  const phoneId = await phone
    .getByLabel("Saved plans", { exact: true })
    .locator("option")
    .last()
    .getAttribute("value");
  await phone.reload();
  await phone.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  await enter(phone);
  await library(phone);
  await phone.getByLabel("Saved plans", { exact: true }).selectOption(phoneId);
  await phone
    .getByRole("button", { name: "Open saved plan", exact: true })
    .click();
  assert.equal((await run(phone)).rows, phoneResult.rows);
  report.mobile.activeProfile = await profile(phone);
  await camera(phone);
  await phone.screenshot({ path: resolve(output, "07-mobile-landscaped.jpg") });
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  report.checks.push(
    "Touch polygon placement, landscaped treatment, mobile save/reload and zero idle rendering",
  );
  await phone.close();
  assert.equal(errors.length, 0, errors.join("\n"));
  assert(
    [...requests].every((u) => u.startsWith(base) || u.startsWith("blob:")),
    "No production or external services",
  );
  report.passed = true;
  report.errors = errors;
} catch (e) {
  report.passed = false;
  report.errors = [...errors, e.stack];
  throw e;
} finally {
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
