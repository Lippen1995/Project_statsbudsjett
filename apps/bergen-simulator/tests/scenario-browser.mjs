import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve("artifacts/milestone-3a");
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
async function setup(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
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
async function complete(page, policy) {
  await page.getByRole("radio", { name: policy, exact: true }).check();
  const start = Date.now();
  await page
    .getByRole("button", { name: "▶ Run simulation", exact: true })
    .click();
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
try {
  const page = await setup({ width: 1440, height: 1000 });
  report.desktop.explorer = await metrics(page);
  report.desktop.explorerProfile = await profile(page);
  await page.getByRole("button", { name: "Plan Bryggen traffic →" }).click();
  await page
    .getByRole("heading", { name: "Bryggen & Vågen", exact: true })
    .waitFor();
  await frame(page);
  await settle(page);
  await page.screenshot({
    path: resolve(output, "01-planning.jpg"),
    type: "jpeg",
    quality: 90,
  });
  report.desktop.ready = await metrics(page);
  await page
    .getByRole("radio", { name: "Restricted through-traffic", exact: true })
    .check();
  await page
    .getByRole("button", { name: "▶ Run simulation", exact: true })
    .click();
  await page.waitForFunction(
    () => +document.querySelector("progress").value >= 5,
  );
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Simulation paused" })
    .waitFor();
  const paused = await page.getByRole("progressbar").getAttribute("value");
  await settle(page);
  assert.equal(
    await page.getByRole("progressbar").getAttribute("value"),
    paused,
  );
  assert(
    await page
      .getByRole("radio", { name: "Baseline", exact: true })
      .isDisabled(),
  );
  report.desktop.paused = await metrics(page);
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Simulation complete" })
    .waitFor({ timeout: 30000 });
  await settle(page);
  await frame(page);
  report.desktop.restrictedProfile = await profile(page);
  report.desktop.restricted = {
    table: await page.getByRole("table").innerText(),
    workerComputeMs: Number(
      await page
        .locator(".simulation-progress")
        .getAttribute("data-compute-ms"),
    ),
    metrics: await metrics(page),
  };
  assert.match(report.desktop.restricted.table, /960/);
  const policyImage = await page.locator("canvas").screenshot();
  await page.screenshot({
    path: resolve(output, "02-restricted.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page
    .getByRole("button", {
      name: "Compare on map · show baseline",
      exact: true,
    })
    .click();
  await settle(page);
  const baselineImage = await page.locator("canvas").screenshot();
  assert(
    !policyImage.equals(baselineImage),
    "Computed policy must visibly change the batched road overlay",
  );
  const baselineCamera = await metrics(page);
  assert.deepEqual(
    baselineCamera.position,
    report.desktop.restricted.metrics.position,
  );
  assert.deepEqual(
    baselineCamera.target,
    report.desktop.restricted.metrics.target,
  );
  assert.equal(
    await page.getByLabel("Traffic map legend").getAttribute("data-map-state"),
    "baseline",
  );
  await page.screenshot({
    path: resolve(output, "03-baseline-comparison.jpg"),
    type: "jpeg",
    quality: 90,
  });
  await page
    .getByRole("button", {
      name: "Showing baseline · show policy",
      exact: true,
    })
    .click();
  // Pick an actual mapped Bryggen centreline through the traffic batch. Camera
  // projection derives screen coordinates from source geometry, not test-only hooks.
  const city = JSON.parse(
    readFileSync(new URL("../public/data/bergen.json", import.meta.url)),
  );
  const road = city.roads.find((r) => r.id === "way/9649862");
  const box = await page.locator("canvas").boundingBox(),
    view = await metrics(page);
  const camera = new PerspectiveCamera(43, box.width / box.height, 2, 14000);
  camera.position.fromArray(view.position);
  camera.lookAt(new Vector3(...view.target));
  camera.updateMatrixWorld();
  let picked = false;
  for (const fraction of [0.25, 0.5, 0.75]) {
    const point = road.points[Math.floor((road.points.length - 1) * fraction)];
    const ndc = new Vector3(point[0], point[1] + 0.6, point[2]).project(camera);
    await page.mouse.click(
      box.x + ((ndc.x + 1) * box.width) / 2,
      box.y + ((1 - ndc.y) * box.height) / 2,
    );
    if ((await page.locator(".inspector").innerText()).includes(road.id)) {
      picked = true;
      break;
    }
  }
  assert(
    picked,
    "Traffic overlay selection must retain the observed OSM way ID",
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  report.desktop.pedestrian = await complete(
    page,
    "Pedestrian-priority corridor",
  );
  await page.screenshot({
    path: resolve(output, "04-pedestrian.jpg"),
    type: "jpeg",
    quality: 90,
  });
  assert.notEqual(
    report.desktop.pedestrian.table,
    report.desktop.restricted.table,
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert(
    await page
      .getByRole("radio", { name: "Baseline", exact: true })
      .isChecked(),
  );
  assert.equal(await page.getByRole("progressbar").getAttribute("value"), "0");
  assert.equal(await page.getByRole("table").count(), 0);
  assert(
    await page
      .getByLabel("Traffic intensity on map", { exact: true })
      .isChecked(),
  );
  const repeated = await complete(page, "Restricted through-traffic");
  assert.equal(
    repeated.table,
    report.desktop.restricted.table,
    "Worker results must reproduce after reset",
  );
  await page.getByLabel("Traffic intensity on map", { exact: true }).uncheck();
  await settle(page);
  assert(
    (await metrics(page)).calls <= 6,
    "Traffic off retains just one corridor pass",
  );
  await page
    .getByRole("button", { name: "Leave scenario", exact: true })
    .click();
  await settle(page);
  assert.equal(
    (await metrics(page)).calls,
    5,
    "Leaving scenario releases overlay passes",
  );
  await page.close();
  const mobile = await setup({ width: 390, height: 844 });
  await mobile.getByLabel("Rendering", { exact: true }).selectOption("low");
  report.mobile.explorerProfile = await profile(mobile);
  await mobile.getByRole("button", { name: "Plan Bryggen traffic →" }).click();
  report.mobile.restricted = await complete(
    mobile,
    "Restricted through-traffic",
  );
  assert.equal(report.mobile.restricted.table, repeated.table);
  report.mobile.restrictedProfile = await profile(mobile);
  await mobile.locator("canvas").scrollIntoViewIfNeeded();
  await mobile.screenshot({
    path: resolve(output, "05-mobile-map.jpg"),
    type: "jpeg",
    quality: 90,
  });
  assert(await mobile.getByLabel("Traffic map legend").isVisible());
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.getByRole("button", { name: "Reset", exact: true }).click();
  await mobile
    .getByRole("button", { name: "Leave scenario", exact: true })
    .click();
  await mobile.route("**/data/bryggen-transport.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  // Expected 503 is checked separately from normal runtime console errors.
  mobile.removeAllListeners("console");
  await mobile.getByRole("button", { name: "Plan Bryggen traffic →" }).click();
  await mobile
    .getByRole("alert")
    .filter({ hasText: "Transport snapshot unavailable (503)" })
    .waitFor();
  assert.equal(
    await mobile.getByRole("radio", { name: "Baseline", exact: true }).count(),
    0,
  );
  assert(await mobile.locator("canvas").isVisible());
  await mobile.close();
  assert(
    [...requests].every((url) => new URL(url).origin === new URL(base).origin),
  );
  assert.deepEqual(errors, []);
  report.checks = [
    "enter verified scenario",
    "select policy",
    "worker run/pause/resume",
    "policy controls locked while running",
    "30-minute completion",
    "computed road colours visibly differ at identical camera",
    "baseline comparison",
    "traffic-batch source pointer inspection",
    "pedestrian access trade-off",
    "reset restores baseline",
    "repeat worker results",
    "heatmap toggle",
    "overlay disposal",
    "paused/complete zero idle frames",
    "390px mobile run and reset",
    "missing transport fails explicitly",
    "local static assets only",
    "module worker under unchanged Vercel CSP",
  ];
  report.passed = true;
  report.errors = errors;
  writeFileSync(
    resolve(output, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
