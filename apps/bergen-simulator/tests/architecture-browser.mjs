import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";

const base = process.argv[2] ?? "http://127.0.0.1:4180";
const phase = process.argv[3] ?? "after";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert(["before", "after"].includes(phase));
const out = `artifacts/r1b/${phase}`;
mkdirSync(out, { recursive: true });
const views = [
  ...JSON.parse(readFileSync("tests/quality-views.json")),
  { name: "facades", position: [-112, 24, -230], target: [-48, 8, -279] },
  { name: "skur-roof", position: [0, 26, -90], target: [51, 6, -142] },
];
const headers = Object.fromEntries(
  JSON.parse(readFileSync("vercel.json")).headers[0].headers.map(
    ({ key, value }) => [key, value],
  ),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--js-flags=--expose-gc",
  ],
});
const report = {
  phase,
  baselineCommit: "b827783c8ebb94e95c4722d1a695d8ab4790e190",
  browser: browser.version(),
  renderer: "ANGLE SwiftShader; software measurements, physical GPU unverified",
  cases: {},
  errors: [],
};
const metrics = (p) =>
  p.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
async function view(p, v) {
  const frames = (await metrics(p)).frames;
  const presentedMs = await p.locator("canvas").evaluate(async (c, detail) => {
    const start = performance.now();
    c.dispatchEvent(new CustomEvent("bergen:capture", { detail }));
    // Wait for two presentation opportunities. The last R3F callback alone can
    // precede asynchronous driver work and produced misleading ~0 ms samples.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const presentationOpportunityMs = performance.now() - start;
    const gl = c.getContext("webgl2");
    if (!gl) throw new Error("Missing WebGL2 benchmark context");
    // Local QA only: two RAFs do not establish that the asynchronous software
    // driver completed its commands. Synchronize the driver before sampling.
    gl.finish();
    return {
      completedGLMs: performance.now() - start,
      presentationOpportunityMs,
    };
  }, v);
  await p.waitForFunction(
    (f) =>
      JSON.parse(document.querySelector("canvas").dataset.capture).frames > f,
    frames,
  );
  const m = await metrics(p);
  for (let i = 0; i < 3; i++) {
    assert(Math.abs(m.position[i] - v.position[i]) < 0.01);
    assert(Math.abs(m.target[i] - v.target[i]) < 0.01);
  }
  return {
    ...m,
    presentedMs: presentedMs.completedGLMs,
    presentationOpportunityMs: presentedMs.presentationOpportunityMs,
  };
}
async function settled(p) {
  await p.waitForTimeout(1000);
  const frames = (await metrics(p)).frames;
  await p.waitForTimeout(700);
  assert.equal((await metrics(p)).frames, frames, "Zero settled idle frames");
}
const quantile = (rows, fraction) =>
  [...rows].sort((a, b) => a - b)[
    Math.min(rows.length - 1, Math.floor(rows.length * fraction))
  ];
try {
  for (const mobile of [false, true]) {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      hasTouch: mobile,
      isMobile: mobile,
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    p.on("request", (r) =>
      assert.equal(new URL(r.url()).origin, new URL(base).origin),
    );
    await p.route(base + "/?capture=1", async (r) => {
      const response = await r.fetch();
      await r.fulfill({
        response,
        headers: { ...response.headers(), ...headers },
      });
    });
    await p.addInitScript(() => {
      window.__r1 = { longTasks: [], workers: [] };
      new PerformanceObserver((list) => {
        window.__r1.longTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, duration: e.duration })),
        );
      }).observe({ type: "longtask", buffered: true });
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          const start = performance.now();
          super(...args);
          this.record = { created: start, replyMs: null, terminated: false };
          window.__r1.workers.push(this.record);
          this.addEventListener("message", () => {
            this.record.replyMs ??= performance.now() - start;
          });
        }
        terminate() {
          this.record.terminated = true;
          return super.terminate();
        }
      };
    });
    const start = performance.now();
    await p.goto(base + "/?capture=1");
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
      null,
      { timeout: 60000 },
    );
    await p.locator("canvas").evaluate((c) => c.getContext("webgl2").finish());
    const sourceReadyMs = performance.now() - start;
    if (phase === "after") {
      await p.waitForFunction(
        () => {
          const c = JSON.parse(
            document.querySelector("canvas").dataset.capture,
          );
          return c.textures === 2 && c.lines === 0;
        },
        null,
        { timeout: 20000 },
      );
      await p
        .locator("canvas")
        .evaluate((c) => c.getContext("webgl2").finish());
    }
    const readyMs = performance.now() - start;
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Performance.enable");
    for (const quality of ["balanced", "low"]) {
      await p.getByLabel("Rendering", { exact: true }).selectOption(quality);
      await p.locator("canvas").scrollIntoViewIfNeeded();
      const captures = [];
      for (const v of views) {
        await view(p, v);
        await settled(p);
        captures.push({ name: v.name, ...(await metrics(p)) });
        await p.locator(".viewport").screenshot({
          path: `${out}/${mobile ? "mobile" : "desktop"}-${quality}-${v.name}.jpg`,
          type: "jpeg",
          quality: 92,
        });
      }
      const samples = [];
      for (let i = 0; i < 16; i++) {
        const v = views[0];
        const m = await view(p, {
          ...v,
          position: [
            v.position[0] + (i % 2 ? 7 : 0),
            v.position[1],
            v.position[2],
          ],
        });
        if (i >= 4)
          samples.push({
            cpu: m.cpuFrameMs,
            latency: m.presentedMs,
            renderCallbackLatency: m.cameraLatencyMs,
            presentationOpportunityMs: m.presentationOpportunityMs,
          });
      }
      await settled(p);
      await p.evaluate(() => window.gc?.());
      const heap = (await cdp.send("Performance.getMetrics")).metrics.find(
        (m) => m.name === "JSHeapUsedSize",
      ).value;
      const retention = [];
      for (let i = 0; i < 5; i++) {
        await view(p, views[1]);
        await view(p, views[0]);
        await settled(p);
        retention.push(
          await p.locator("canvas").evaluate((c) => {
            c.dispatchEvent(new Event("bergen:memory"));
            return JSON.parse(c.dataset.memory);
          }),
        );
      }
      await p.evaluate(() => window.gc?.());
      const heapAfter = (await cdp.send("Performance.getMetrics")).metrics.find(
        (m) => m.name === "JSHeapUsedSize",
      ).value;
      assert(
        heapAfter - heap < 5 * 1024 * 1024,
        "Camera switching retains <5 MiB after GC",
      );
      assert(
        retention.every(
          (r) =>
            r.geometries === retention[0].geometries &&
            r.attributeBytes === retention[0].attributeBytes,
        ),
        "Stable live geometry allocations",
      );
      const key = `${mobile ? "mobile" : "desktop"}-${quality}`;
      report.cases[key] = {
        readyMs,
        sourceReadyMs,
        captures,
        samples,
        medianCpuMs: quantile(
          samples.map((s) => s.cpu),
          0.5,
        ),
        p95CpuMs: quantile(
          samples.map((s) => s.cpu),
          0.95,
        ),
        medianCameraMs: quantile(
          samples.map((s) => s.latency),
          0.5,
        ),
        p95CameraMs: quantile(
          samples.map((s) => s.latency),
          0.95,
        ),
        retention,
        heap,
        heapAfter,
        idleFrames: 0,
        preparation: await p
          .locator("canvas")
          .evaluate((c) => JSON.parse(c.dataset.preparation)),
        resources: await p.evaluate(() =>
          performance.getEntriesByType("resource").map((r) => ({
            path: new URL(r.name).pathname,
            transferBytes: r.transferSize,
            encodedBytes: r.encodedBodySize,
            durationMs: r.duration,
          })),
        ),
        diagnostics: await p.evaluate(() => window.__r1),
      };
      assert(
        captures.every(
          (m) =>
            m.calls <= 8 &&
            m.triangles <= 292500 &&
            m.attributeBytes <= 31.5 * 1024 * 1024,
        ),
        "R1C asset budget; R1B reports retain their original thresholds",
      );
    }
    if (phase === "after") {
      await p
        .getByRole("button", { name: "Bryggen waterfront", exact: true })
        .click();
      await p.locator("canvas").scrollIntoViewIfNeeded();
      await settled(p);
      assert(
        (await metrics(p)).position[1] < 120,
        "Accessible hero camera bookmark",
      );
      const city = JSON.parse(readFileSync("public/data/bergen.json"));
      const candidates = ["way/488690084", "way/331274578", "way/292320268"];
      let picked = false;
      const m = await metrics(p),
        rect = await p.locator("canvas").boundingBox();
      const camera = new PerspectiveCamera(
        43,
        rect.width / rect.height,
        2,
        14000,
      );
      camera.position.fromArray(m.position);
      camera.lookAt(new Vector3(...m.target));
      camera.updateMatrixWorld();
      for (const id of candidates) {
        const b = city.buildings.find((b) => b.id === id);
        const point = new Vector3(
          b.center[0],
          b.elevation + b.height * 0.75,
          b.center[1],
        ).project(camera);
        const x = rect.x + ((point.x + 1) * rect.width) / 2,
          y = rect.y + ((1 - point.y) * rect.height) / 2;
        if (mobile) await p.touchscreen.tap(x, y);
        else await p.mouse.click(x, y);
        await settled(p);
        const text = await p.locator(".inspector").innerText();
        if (
          text.includes("R1 waterfront study") &&
          text.includes("Rendered height")
        ) {
          picked = true;
          break;
        }
      }
      assert(
        picked,
        "Direct source-building picking retains OSM identities and R1 truth labels",
      );
      await p.getByRole("button", { name: /Focus on object/ }).click();
      await p.locator("canvas").scrollIntoViewIfNeeded();
      await settled(p);
      const inspected = await metrics(p);
      assert(
        Math.hypot(
          ...inspected.position.map((v, i) => v - inspected.target[i]),
        ) < 300,
        "Object focus frames the actual footprint",
      );
      await p.locator(".viewport").screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-inspection.jpg`,
        type: "jpeg",
        quality: 92,
      });
      await p
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Bryggen waterfront", exact: true })
        .click();
      await p.locator("canvas").scrollIntoViewIfNeeded();
      await settled(p);
      const canvas = p.locator("canvas");
      await canvas.focus();
      const before = (await metrics(p)).position;
      await p.keyboard.press("+");
      await settled(p);
      assert.notDeepEqual((await metrics(p)).position, before, "Keyboard zoom");
      if (mobile) {
        const rect = await canvas.boundingBox(),
          from = (await metrics(p)).position;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.55 },
          ],
        });
        for (let i = 1; i <= 5; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x: rect.x + rect.width * 0.5 + i * 8,
                y: rect.y + rect.height * 0.55 + i * 3,
              },
            ],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await settled(p);
        assert.notDeepEqual(
          (await metrics(p)).position,
          from,
          "Actual touch orbit updates the 3D camera",
        );
      }
      await p.getByLabel("Rendering", { exact: true }).selectOption("balanced");
      await p.getByLabel("Search mapped places").fill("Skur 11");
      await p.locator(".place-list button").first().click();
      assert.match(await p.locator(".inspector").innerText(), /way\/393025479/);
      assert.match(
        await p.locator(".inspector").innerText(),
        /OSM wall colour: darkgreen/,
      );
      assert.match(
        await p.locator(".inspector").innerText(),
        /Roof form unresolved/,
      );
      await p.getByRole("button", { name: /Focus on object/ }).click();
      await canvas.scrollIntoViewIfNeeded();
      await settled(p);
      await p.locator(".viewport").screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-skur11.jpg`,
        type: "jpeg",
        quality: 92,
      });
      assert(
        await p.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
        "No horizontal mobile overflow",
      );
    }
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  writeFileSync(`${out}/metrics.json`, JSON.stringify(report, null, 2) + "\n");
  if (phase === "after") {
    const before = JSON.parse(
      readFileSync("artifacts/r1b/before/metrics.json"),
    );
    for (const [key, r] of Object.entries(report.cases)) {
      const b = before.cases[key];
      assert(
        r.readyMs <= b.readyMs * 1.25 + 500,
        `${key} readiness regression`,
      );
      assert(
        r.medianCameraMs <= b.medianCameraMs * 1.25 + 30,
        `${key} median camera regression`,
      );
      assert(
        r.p95CameraMs <= b.p95CameraMs * 1.25 + 50,
        `${key} P95 camera regression`,
      );
    }
  }
  console.log(
    JSON.stringify(
      {
        phase,
        cases: Object.fromEntries(
          Object.entries(report.cases).map(([k, r]) => [
            k,
            {
              readyMs: r.readyMs,
              medianCameraMs: r.medianCameraMs,
              p95CameraMs: r.p95CameraMs,
              calls: r.captures[0].calls,
              triangles: r.captures[0].triangles,
              idleFrames: r.idleFrames,
            },
          ]),
        ),
        errors: report.errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
