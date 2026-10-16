import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:4180";
const label = process.argv[3] ?? "after";
const quality = process.argv[4] ?? "balanced";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert(["before", "after"].includes(label));
assert(["balanced", "low"].includes(quality));
const output = resolve(
  "artifacts",
  "milestone-2a",
  quality === "balanced" ? label : label + "-low",
);
mkdirSync(output, { recursive: true });
const views = JSON.parse(
  readFileSync(new URL("visual-views.json", import.meta.url)),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const getMetrics = () =>
  page.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
async function setView(view) {
  const frame = (await getMetrics()).frames;
  await page
    .locator("canvas")
    .evaluate(
      (c, detail) =>
        c.dispatchEvent(new CustomEvent("bergen:capture", { detail })),
      view,
    );
  await page.waitForFunction(
    (frame) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames >
      frame,
    frame,
  );
}
try {
  const start = Date.now();
  await page.goto(base + "/?capture=1");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
  const readyMs = Date.now() - start;
  if (quality === "low")
    await page.getByLabel("Rendering", { exact: true }).selectOption("low");
  const samples = [];
  for (const view of views) {
    await setView(view);
    await page.screenshot({
      path: resolve(output, view.name + ".jpg"),
      type: "jpeg",
      quality: 90,
    });
    const metrics = await getMetrics();
    for (let i = 0; i < 3; i++) {
      assert(
        Math.abs(metrics.position[i] - view.position[i]) < 0.01,
        "Fixed camera position changed",
      );
      assert(
        Math.abs(metrics.target[i] - view.target[i]) < 0.01,
        "Fixed camera target changed",
      );
    }
    samples.push({ name: view.name, ...metrics });
  }
  const frameSamples = [];
  const latencySamples = [];
  for (let i = 0; i < 20; i++) {
    const view = views[0];
    await setView({
      position: [
        view.position[0] + (i % 2 ? 80 : 0),
        view.position[1],
        view.position[2],
      ],
      target: view.target,
    });
    if (i > 3) {
      const m = await getMetrics();
      frameSamples.push(m.cpuFrameMs);
      latencySamples.push(m.cameraLatencyMs);
    }
  }
  const beforeIdle = (await getMetrics()).frames;
  await page.waitForTimeout(500);
  const idleFrames = (await getMetrics()).frames - beforeIdle;
  assert(idleFrames <= 1, "Demand rendering must settle when idle");
  assert.deepEqual(errors, []);
  frameSamples.sort((a, b) => a - b);
  latencySamples.sort((a, b) => a - b);
  const report = {
    label,
    quality,
    baselineCommit: "ab92713a99588dbf2458135e1bf7b41d892088a5",
    viewport: [1440, 1000],
    renderer:
      "Chromium / ANGLE SwiftShader (software, not a hardware FPS benchmark)",
    browserVersion: browser.version(),
    readyMs,
    medianCpuFrameMs: frameSamples[Math.floor(frameSamples.length / 2)],
    p95CpuFrameMs: frameSamples[Math.floor(frameSamples.length * 0.95)],
    medianCameraLatencyMs:
      latencySamples[Math.floor(latencySamples.length / 2)],
    p95CameraLatencyMs:
      latencySamples[Math.floor(latencySamples.length * 0.95)],
    idleFrames,
    views: samples,
    errors,
  };
  writeFileSync(
    resolve(output, "metrics.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
