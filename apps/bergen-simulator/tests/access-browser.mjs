import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = "artifacts/milestone-5d/after";
mkdirSync(out, { recursive: true });
const example = JSON.parse(
  readFileSync("public/plans/connected-quarter-example.json"),
);
const city = JSON.parse(readFileSync("public/data/bergen.json"));
const headers = Object.fromEntries(
  JSON.parse(readFileSync("vercel.json")).headers[0].headers.map(
    ({ key, value }) => [key, value],
  ),
);
const report = {
  renderer: "SwiftShader; physical GPU performance unverified",
  viewports: {},
  errors: [],
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--js-flags=--expose-gc",
  ],
});
const metrics = (p) =>
  p.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
const click = (p, name) => p.getByRole("button", { name, exact: true }).click();
async function library(p) {
  const d = p.locator(".plan-library");
  if (!(await d.evaluate((d) => d.open))) await d.locator("summary").click();
}
async function importPlan(p, plan) {
  await library(p);
  await p.getByLabel("Import scenario JSON").setInputFiles({
    name: "plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(plan)),
  });
  await p.waitForFunction(
    (name) =>
      document.querySelector(".plan-heading strong")?.textContent === name,
    plan.name,
  );
}
async function settle(p) {
  await p.waitForTimeout(900);
  const a = (await metrics(p)).frames;
  await p.waitForTimeout(600);
  assert.equal((await metrics(p)).frames, a, "Zero idle frames");
}
async function camera(
  p,
  position = [-175, 125, -180],
  target = [-105, 0, -308],
) {
  await p.locator("canvas").scrollIntoViewIfNeeded();
  const n = (await metrics(p)).frames;
  await p
    .locator("canvas")
    .evaluate(
      (c, detail) =>
        c.dispatchEvent(new CustomEvent("bergen:capture", { detail })),
      { position, target },
    );
  await p.waitForFunction(
    (n) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames > n,
    n,
  );
  await settle(p);
}
function height(x, z) {
  const pos = city.terrain.positions,
    ix = city.terrain.indices;
  for (let i = 0; i < ix.length; i += 3) {
    const [a, b, c] = ix
      .slice(i, i + 3)
      .map((j) => pos.slice(j * 3, j * 3 + 3));
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-8) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den,
      v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      return u * a[1] + v * b[1] + (1 - u - v) * c[1];
  }
  throw Error("No test terrain");
}
async function screen(p, point, above = 0) {
  const rect = await p.locator("canvas").boundingBox(),
    m = await metrics(p),
    camera = new PerspectiveCamera(43, rect.width / rect.height, 2, 14000);
  camera.position.fromArray(m.position);
  camera.lookAt(new Vector3(...m.target));
  camera.updateMatrixWorld();
  const v = new Vector3(point[0], height(...point) + above, point[1]).project(
    camera,
  );
  return {
    x: rect.x + ((v.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - v.y) * rect.height) / 2,
  };
}
async function run(p) {
  await click(p, "Run connected transport");
  await p
    .getByLabel("Connected transport outcomes", { exact: true })
    .waitFor({ timeout: 30000 });
  await settle(p);
  return p
    .getByLabel("Connected transport outcomes", { exact: true })
    .evaluate((e) => ({ ...e.dataset, text: e.textContent }));
}
async function save(p, name) {
  await library(p);
  await p.getByLabel("Plan name", { exact: true }).fill(name);
  await click(p, "Save plan");
  await p
    .getByRole("note")
    .filter({ hasText: "Plan saved in this browser" })
    .waitFor();
}
try {
  for (const mobile of [false, true]) {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: 1,
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    p.on("request", (r) =>
      assert.equal(new URL(r.url()).origin, new URL(base).origin),
    );
    await p.route(base + "/?capture=1", async (r) => {
      const s = await r.fetch();
      await r.fulfill({ response: s, headers: { ...s.headers(), ...headers } });
    });
    await p.addInitScript(() => {
      window.__accessProfile = { longTasks: [], workers: [] };
      if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.__accessProfile.longTasks.push({
              start: e.startTime,
              duration: e.duration,
            });
          window.__accessProfile.longTasks =
            window.__accessProfile.longTasks.slice(-256);
        }).observe({ type: "longtask", buffered: true });
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.record = { terminated: false, messages: 0, computeMs: [] };
          window.__accessProfile.workers.push(this.record);
          this.addEventListener("message", (e) => {
            this.record.messages++;
            if (Number.isFinite(e.data?.computeMs))
              this.record.computeMs.push(e.data.computeMs);
          });
        }
        terminate() {
          this.record.terminated = true;
          return super.terminate();
        }
      };
    });
    const t = performance.now();
    await p.goto(base + "/?capture=1");
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
      null,
      { timeout: 60000 },
    );
    const r = {
      sceneReadyMs: performance.now() - t,
      initial: await metrics(p),
    };
    report.viewports[mobile ? "mobile" : "desktop"] = r;
    await click(p, "Enter Planning Mode →");
    const legacy = structuredClone(example);
    legacy.version = 5;
    delete legacy.access;
    delete legacy.mobility;
    legacy.name = "5B quarter / access design trial";
    await importPlan(p, legacy);
    await click(p, "Access Planning");
    await camera(p, [-220, 240, 40], [-40, 0, -250]);
    await click(p, "Show observed Bergen");
    await p.locator("canvas").screenshot({
      path: `${out}/${mobile ? "mobile" : "desktop"}-before-access.jpg`,
    });
    await click(p, "Show proposed access");
    // Both portals and target nodes are explicitly chosen: no proximity-based automatic link.
    for (const [index, connection] of example.access.connections.entries()) {
      await p
        .getByLabel("Access building", { exact: true })
        .selectOption(connection.buildingId);
      await click(p, "Design access connection");
      await p
        .getByLabel("Access attachment node", { exact: true })
        .selectOption(connection.nodeId);
      await p
        .getByLabel("Access east", { exact: true })
        .fill(String(connection.points[0][0]));
      await p
        .getByLabel("Access south", { exact: true })
        .fill(String(connection.points[0][1]));
      if (index === 0) {
        await p
          .getByLabel("Access attachment node", { exact: true })
          .selectOption("75457133");
        await camera(p);
        const q = await screen(p, connection.points.at(-1), 1.5);
        if (mobile) await p.touchscreen.tap(q.x, q.y);
        else await p.mouse.click(q.x, q.y);
        assert.equal(
          await p
            .getByLabel("Access attachment node", { exact: true })
            .inputValue(),
          connection.nodeId,
        );
        await click(p, "Place selected vertex on terrain");
        await camera(p);
        const terrainPoint = await screen(p, [-101, -314]);
        if (mobile) await p.touchscreen.tap(terrainPoint.x, terrainPoint.y);
        else await p.mouse.click(terrainPoint.x, terrainPoint.y);
        assert(
          Math.abs(
            Number(
              await p.getByLabel("Access south", { exact: true }).inputValue(),
            ) + 314,
          ) < 1,
          "Direct terrain manipulation moves the selected portal",
        );
        await p
          .getByLabel("Access placement validity", { exact: true })
          .filter({ hasText: "Geometrically eligible" })
          .waitFor();
        await click(p, "Navigate camera");
        await p.getByLabel("Access south", { exact: true }).fill("-317");
        await p.getByLabel("Access east", { exact: true }).fill("");
        assert.equal(
          await p
            .getByRole("button", {
              name: "Confirm proposed access",
              exact: true,
            })
            .isDisabled(),
          true,
        );
        await click(p, "↶ Undo");
        assert.equal(
          await p.getByLabel("Access east", { exact: true }).inputValue(),
          "-101",
        );
        await click(p, "↷ Redo");
        assert.equal(
          await p.getByLabel("Access east", { exact: true }).inputValue(),
          "",
        );
        await p.getByLabel("Access east", { exact: true }).fill("-80");
        assert.equal(
          await p
            .getByRole("button", {
              name: "Confirm proposed access",
              exact: true,
            })
            .isDisabled(),
          true,
        );
        await p.getByLabel("Access east", { exact: true }).fill("-101");
        await p
          .getByLabel("Access placement validity", { exact: true })
          .filter({ hasText: "Geometrically eligible" })
          .waitFor();
        await p.locator("canvas").screenshot({
          path: `${out}/${mobile ? "mobile" : "desktop"}-access-preview-world.jpg`,
        });
        await p.screenshot({
          path: `${out}/${mobile ? "mobile" : "desktop"}-access-preview.jpg`,
        });
      }
      await p
        .getByLabel("Access placement validity", { exact: true })
        .filter({ hasText: "Geometrically eligible" })
        .waitFor();
      await click(p, "Confirm proposed access");
    }
    await p
      .getByLabel("Enable synthetic activity demand", { exact: true })
      .check();
    await p.getByLabel("Activity month", { exact: true }).fill("24");
    await click(p, "Apply mobility assumptions");
    // Actual construction and monthly stocks are exercised before transport.
    await click(p, "Open Living City timeline");
    await p
      .getByRole("button", { name: "Advance to month 24", exact: true })
      .click();
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="District outcomes"]')?.dataset
          .month === "24",
    );
    await click(p, "Plan hypothetical access & transport");
    r.connected = await run(p);
    assert.equal(r.connected.generated, "13");
    assert.equal(r.connected.routed, "13");
    assert.equal(r.connected.unrouted, "0");
    assert.match(r.connected.text, /1,969.6|1969.6/);
    await click(p, "Challenge · Connect the New Quarter");
    await p
      .getByLabel("Connect the New Quarter challenge")
      .getByText("Connected quarter achieved", { exact: true })
      .waitFor();
    await camera(p, [-220, 240, 40], [-40, 0, -250]);
    await p.locator("canvas").screenshot({
      path: `${out}/${mobile ? "mobile" : "desktop"}-connected-city.jpg`,
    });
    await p
      .getByLabel("Connected transport outcomes", { exact: true })
      .screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-outcomes.jpg`,
      });
    r.after = await metrics(p);
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await settle(p);
    r.cameraSamplesMs = [];
    for (let i = 0; i < 14; i++) {
      const n = (await metrics(p)).frames;
      await p.locator("canvas").evaluate(
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
      await p.waitForFunction(
        (n) =>
          JSON.parse(document.querySelector("canvas").dataset.capture).frames >
          n,
        n,
      );
      if (i >= 2) r.cameraSamplesMs.push((await metrics(p)).cameraLatencyMs);
    }
    await settle(p);
    await p.evaluate(() => window.gc?.());
    r.heapBefore = await p.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    r.retention = [];
    r.lastFrameRetention = [];
    r.replayMs = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await run(p);
      r.replayMs.push(performance.now() - t);
      r.lastFrameRetention.push((await metrics(p)).geometries);
      const live = await p.locator("canvas").evaluate((c) => {
        c.dispatchEvent(new Event("bergen:memory"));
        return JSON.parse(c.dataset.memory);
      });
      r.retention.push(live.geometries);
    }
    await p.evaluate(() => window.gc?.());
    r.heapAfter = await p.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    assert.equal(new Set(r.retention).size, 1);
    assert(
      r.heapAfter - r.heapBefore < 5 * 1024 * 1024,
      "Bounded connected replay heap",
    );
    await save(p, "Connected strategy");
    const saved = await p
      .getByLabel("Saved plans", { exact: true })
      .locator("option")
      .last()
      .getAttribute("value");
    await p
      .getByLabel("Compare with saved plan", { exact: true })
      .selectOption(saved);
    await click(p, "Buildings");
    await p
      .getByLabel("Proposed buildings", { exact: true })
      .selectOption("study-0");
    await click(p, "Edit building");
    await p.getByLabel("Storeys", { exact: true }).fill("2");
    await click(p, "Confirm building");
    await click(p, "Access Planning");
    r.lessHousing = await run(p);
    assert(Number(r.lessHousing.generated) < 13);
    await p.getByLabel("Connected strategy comparison").waitFor();
    await click(p, "↶ Undo");
    assert.equal((await run(p)).generated, "13");
    // Mode separation and access loss: geometry remains valid but generated trips cannot vanish.
    await p
      .getByLabel("Access building", { exact: true })
      .selectOption("study-0");
    await click(p, "Edit vehicle access");
    await p
      .getByLabel("Access mode", { exact: true })
      .selectOption("pedestrian");
    await click(p, "Confirm proposed access");
    r.pedestrian = await run(p);
    assert.equal(r.pedestrian.generated, "13");
    assert.equal(r.pedestrian.unrouted, "7");
    assert.equal(r.pedestrian.routed, "6");
    await p.getByLabel("Connected strategy comparison").waitFor();
    await click(p, "↶ Undo");
    r.undo = await run(p);
    assert.equal(r.undo.routed, "13");
    await click(p, "↷ Redo");
    r.redo = await run(p);
    assert.equal(r.redo.unrouted, "7");
    await click(p, "↶ Undo");
    await run(p);
    await save(p, "Connected strategy");
    const download = p.waitForEvent("download");
    await click(p, "Export JSON");
    const artifact = await download;
    const path = await artifact.path();
    const exported = JSON.parse(readFileSync(path));
    assert.equal(exported.version, 6);
    assert.equal(exported.access.connections.length, 2);
    assert(!("results" in exported));
    r.beforeReloadInstrumentation = await p.evaluate(
      () => window.__accessProfile,
    );
    await p.reload();
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
    );
    await click(p, "Enter Planning Mode →");
    await library(p);
    await p.getByLabel("Saved plans", { exact: true }).selectOption(saved);
    await click(p, "Open saved plan");
    await click(p, "Access Planning");
    r.reloaded = await run(p);
    assert.equal(r.reloaded.routed, "13");
    await click(p, "Living City");
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="District outcomes"]')?.dataset
          .month === "24",
    );
    await click(p, "Access Planning");
    await click(p, "Reset city");
    await importPlan(p, exported);
    await click(p, "Access Planning");
    assert.equal((await run(p)).generated, "13");
    const bad = structuredClone(exported);
    bad.name = "invalid connector";
    bad.access.connections[0].points[0] = [-1000, -1000];
    await library(p);
    await p.getByLabel("Import scenario JSON").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await p.getByRole("alert").filter({ hasText: "Import rejected" }).waitFor();
    assert.equal(
      await p.locator(".plan-heading strong").innerText(),
      exported.name,
    );
    for (const name of [
      "rethinking-example.json",
      "waterfront-example.json",
      "urban-quarter-example.json",
      "living-quarter-example.json",
      "sustainable-quarter-example.json",
    ]) {
      const old = JSON.parse(readFileSync("public/plans/" + name));
      await importPlan(p, old);
    }
    await click(p, "Reset city");
    await camera(p);
    r.reset = await metrics(p);
    assert.equal(r.reset.calls, 8); // Five source passes + two R1B asset passes + network overlay.
    await settle(p);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    r.instrumentation = await p.evaluate(() => window.__accessProfile);
    assert(
      r.instrumentation.workers.filter((w) => !w.terminated).length <= 1,
      "No retained connected or geometry workers after reset",
    );
    report.viewports[mobile ? "mobile" : "desktop"] = r;
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.errors.push(e.stack);
  throw e;
} finally {
  writeFileSync(
    `${out}/access-browser-report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
