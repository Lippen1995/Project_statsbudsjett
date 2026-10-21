import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";

const base = process.argv[2] ?? "http://127.0.0.1:4180";
const phase = process.argv[3] ?? "after";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(["before", "after"].includes(phase));
const out = `artifacts/r1e/${phase}`;
mkdirSync(out, { recursive: true });
const views = [
  { name: "waterfront", position: [-145, 85, -45], target: [-12, 8, -260] },
  { name: "aerial-pilot", position: [75, 125, -260], target: [4, 8, -286] },
  {
    name: "representative-roofs",
    position: [70, 45, -330],
    target: [8, 9, -292],
  },
  { name: "bryggen-street", position: [47, 12, -225], target: [7, 6, -272] },
  ...(phase === "after"
    ? [
        {
          name: "bryggen-lane-eye-level",
            position: [62.13, 4.5, -224.17],
            target: [43.13, 2.5, -223.17],
        },
      ]
    : []),
];
const headers = Object.fromEntries(
  JSON.parse(readFileSync("vercel.json")).headers[0].headers.map(
    ({ key, value }) => [key, value],
  ),
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--js-flags=--expose-gc",
  ],
});
const report = {
  phase,
  baselineCommit: "c87db8bfe73e4e73a49bc0160a91116615274893",
  driver: "Chromium ANGLE SwiftShader; physical GPU unverified",
  browser: browser.version(),
  measurementProtocol:
    "v2: await a newer captured frame at the commanded camera, then two RAF callbacks and gl.finish; 56 measured samples after 8 warmups; software driver latency, not physical FPS",
  views,
  cases: [],
  errors: [],
};
const metrics = (page) =>
  page.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
const quantile = (v, f) =>
  [...v].sort((a, b) => a - b)[
    Math.min(v.length - 1, Math.floor(v.length * f))
  ];
async function setView(page, detail) {
  return page.locator("canvas").evaluate(async (c, v) => {
    const t = performance.now();
    const before = JSON.parse(c.dataset.capture).frames;
    c.dispatchEvent(new CustomEvent("bergen:capture", { detail: v }));
    await new Promise((resolve, reject) => {
      const check = () => {
        const m = JSON.parse(c.dataset.capture);
        if (
          m.frames > before &&
          m.position.every((n, i) => Math.abs(n - v.position[i]) < 0.01)
        ) resolve();
        else if (performance.now() - t > 10000)
          reject(new Error("No rendered frame at commanded camera"));
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    c.getContext("webgl2").finish();
    return performance.now() - t;
  }, detail);
}
async function idle(page) {
  await page.waitForTimeout(850);
  const before = (await metrics(page)).frames;
  await page.waitForTimeout(700);
  assert.equal(
    (await metrics(page)).frames,
    before,
    "Zero settled idle frames",
  );
}
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    page.on("request", (r) =>
      assert.equal(new URL(r.url()).origin, new URL(base).origin),
    );
    await page.route(base + "/?capture=1", async (r) => {
      const response = await r.fetch();
      await r.fulfill({
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
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("canvas").dataset.capture)
          .textures === 2,
    );
    const readyMs = performance.now() - start;
    await page.locator("canvas").scrollIntoViewIfNeeded();
    const modes = phase === "after" ? [false, true] : [false];
    for (const enabled of modes) {
      if (phase === "after") {
        await page
          .getByLabel("Kartverket roof pilot (2022)", { exact: true })
          .setChecked(enabled);
        if (enabled)
          await page.getByText(/6 source-derived roofs loaded/).waitFor();
        await page.locator("canvas").scrollIntoViewIfNeeded();
      }
      const captures = [];
      for (const view of views) {
        await setView(page, view);
        await idle(page);
        const m = await metrics(page);
        for (let j = 0; j < 3; j++)
          assert(
            Math.abs(m.position[j] - view.position[j]) < 0.01,
            "Exact camera pose",
          );
        await page
          .locator(".viewport")
          .screenshot({
            path: `${out}/${mobile ? "mobile" : "desktop"}-${enabled ? "on" : "off"}-${view.name}.jpg`,
            type: "jpeg",
            quality: 93,
          });
        captures.push({ view: view.name, ...m });
      }
      const samples = [];
      for (let i = 0; i < 64; i++) {
        const v = views[1];
        const ms = await setView(page, {
          ...v,
          position: [
            v.position[0] + (i % 2 ? 4 : 0),
            v.position[1],
            v.position[2],
          ],
        });
        if (i >= 8) samples.push(ms);
      }
      await idle(page);
      report.cases.push({
        mobile,
        enabled,
        readyMs,
        captures,
        cameraSamplesMs: samples,
        medianMs: quantile(samples, 0.5),
        p95Ms: quantile(samples, 0.95),
      });
    }
    if (phase === "after") {
      const catalogue = JSON.parse(
        readFileSync("src/enhancements/catalogue.json"),
      );
      const building = catalogue.buildings[0],
        center = building.roof.center;
      const view = {
        position: [center[0] + 10, 100, center[1] + 25],
        target: [center[0], 8, center[1]],
      };
      await setView(page, view);
      await idle(page);
      const m = await metrics(page),
        rect = await page.locator("canvas").boundingBox();
      const camera = new PerspectiveCamera(
        43,
        rect.width / rect.height,
        2,
        14000,
      );
      camera.position.fromArray(m.position);
      camera.lookAt(new Vector3(...m.target));
      camera.updateMatrixWorld();
      const point = new Vector3(
        center[0],
        building.roof.coefficients[0] - 0.1,
        center[1],
      ).project(camera);
      const x = rect.x + ((point.x + 1) * rect.width) / 2,
        y = rect.y + ((1 - point.y) * rect.height) / 2;
      if (mobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      assert.match(
        await page.locator(".inspector").innerText(),
        new RegExp(building.id),
      );
      assert.match(
        await page.locator(".inspector").innerText(),
        /R1E.*source-derived/s,
      );
      assert.match(
        await page.locator(".inspector").innerText(),
        /not a building survey/i,
      );
      const allocations = [];
      for (let i = 0; i < 5; i++) {
        await page
          .getByLabel("Kartverket roof pilot (2022)", { exact: true })
          .uncheck();
        await page
          .getByLabel("Kartverket roof pilot (2022)", { exact: true })
          .check();
        await page.getByText(/6 source-derived roofs loaded/).waitFor();
        await page.locator("canvas").scrollIntoViewIfNeeded();
        await idle(page);
        allocations.push(
          await page.locator("canvas").evaluate((c) => {
            c.dispatchEvent(new Event("bergen:memory"));
            return JSON.parse(c.dataset.memory);
          }),
        );
      }
      assert.equal(allocations.at(-1).geometries, allocations[0].geometries);
      assert.equal(
        allocations.at(-1).attributeBytes,
        allocations[0].attributeBytes,
      );
      await page.getByLabel("Rendering", { exact: true }).selectOption("low");
      await page.getByText(/Pilot paused in low power/).waitFor();
      await page.locator("canvas").scrollIntoViewIfNeeded();
      await idle(page);
      await page
        .getByLabel("Rendering", { exact: true })
        .selectOption("balanced");
      await page.getByText(/6 source-derived roofs loaded/).waitFor();
      await page
        .getByLabel("Kartverket roof pilot (2022)", { exact: true })
        .uncheck();
      report.cases.at(-1).pickingSourceId = building.id;
      report.cases.at(-1).toggleAllocations = allocations;
    }
    await page.close();
  }
  if (phase === "after") {
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (e) => runtimeErrors.push(e.message));
    await page.route("**/enhancements/*.glb", (r) =>
      r.fulfill({ status: 404, body: "Unavailable" }),
    );
    await page.goto(base + "/?capture=1");
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
    );
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("canvas").dataset.capture)
          .textures === 2,
    );
    await idle(page);
    const original = await metrics(page);
    await page
      .getByLabel("Kartverket roof pilot (2022)", { exact: true })
      .check();
    await page
      .getByText(/Roof data unavailable; original view retained/)
      .waitFor();
    await page.locator("canvas").scrollIntoViewIfNeeded();
    await idle(page);
    assert.equal((await metrics(page)).triangles, original.triangles);
    await page
      .getByLabel("Kartverket roof pilot (2022)", { exact: true })
      .uncheck();
    await page.unroute("**/enhancements/*.glb");
    await page.route("**/enhancements/*.glb", async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        await r.continue();
      } catch {
        /* expected cancellation */
      }
    });
    await page
      .getByLabel("Kartverket roof pilot (2022)", { exact: true })
      .check();
    await page
      .getByLabel("Kartverket roof pilot (2022)", { exact: true })
      .uncheck();
    await page.waitForTimeout(500);
    await page.locator("canvas").scrollIntoViewIfNeeded();
    await idle(page);
    assert.equal((await metrics(page)).triangles, original.triangles);
    assert.deepEqual(runtimeErrors, []);
    report.failureAndCancellationFallback =
      "passed; original geometry retained";
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      phase,
      status: "passed",
      cases: report.cases.map(({ mobile, enabled, medianMs, p95Ms }) => ({
        mobile,
        enabled,
        medianMs,
        p95Ms,
      })),
    }),
  );
} finally {
  await browser.close();
}
