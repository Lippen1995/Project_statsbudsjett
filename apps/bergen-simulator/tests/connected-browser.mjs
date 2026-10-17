import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
const phase = process.argv[3] ?? "after";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(["before", "after"].includes(phase));
const out = `artifacts/milestone-5c/${phase}`;
mkdirSync(out, { recursive: true });
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
  browser: browser.version(),
  renderer: "SwiftShader; physical GPU performance unverified",
  phase,
  viewports: {},
  errors: [],
};
const metrics = (p) =>
  p.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
const month = (p, n) =>
  p.waitForFunction(
    (n) =>
      document.querySelector('[aria-label="District outcomes"]')?.dataset
        .month === String(n) &&
      document
        .querySelector('[aria-label="District status"]')
        ?.textContent.includes(`District month ${n} ready`),
    n,
  );
async function importPlan(p, name = "sustainable-quarter-example.json") {
  const d = p.locator(".plan-library");
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
  const buffer = readFileSync(`public/plans/${name}`);
  await p
    .getByLabel("Import scenario JSON")
    .setInputFiles({ name, mimeType: "application/json", buffer });
  await p.waitForFunction(
    (name) =>
      document.querySelector(".plan-heading strong")?.textContent === name,
    JSON.parse(buffer).name,
  );
}
async function settle(p) {
  await p.waitForTimeout(900);
  const a = (await metrics(p)).frames;
  await p.waitForTimeout(600);
  assert.equal((await metrics(p)).frames, a, "Zero idle frames");
}
async function command(p, action, ready) {
  const t = performance.now();
  await action();
  if (ready) await ready();
  return performance.now() - t;
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
    p.on("request", (r) =>
      assert.equal(
        new URL(r.url()).origin,
        new URL(base).origin,
        "No external runtime requests",
      ),
    );
    await p.route(base + "/?capture=1", async (r) => {
      const s = await r.fetch();
      await r.fulfill({ response: s, headers: { ...s.headers(), ...headers } });
    });
    await p.addInitScript(() => {
      const s = (window.__bergenProfile = {
        longTasks: [],
        workers: [],
        supported: PerformanceObserver.supportedEntryTypes.includes("longtask"),
      });
      if (s.supported)
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            s.longTasks.push({ start: e.startTime, duration: e.duration });
            if (s.longTasks.length > 256) s.longTasks.shift();
          }
        }).observe({ type: "longtask", buffered: true });
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          const t = performance.now();
          super(...args);
          this.record = {
            createdAt: t,
            firstReplyMs: null,
            terminated: false,
            messages: 0,
            processingMs: [],
            roundTripsMs: [],
          };
          s.workers.push(this.record);
          if (s.workers.length > 128) s.workers.shift();
          this.pending = [];
          this.addEventListener("message", (e) => {
            const r = this.record;
            r.messages++;
            if (r.firstReplyMs === null) r.firstReplyMs = performance.now() - t;
            if (Number.isFinite(e.data?.computeMs))
              r.processingMs.push(e.data.computeMs);
            if (this.pending.length)
              r.roundTripsMs.push(performance.now() - this.pending.shift());
            r.processingMs = r.processingMs.slice(-64);
            r.roundTripsMs = r.roundTripsMs.slice(-64);
          });
        }
        postMessage(...args) {
          this.pending.push(performance.now());
          if (this.pending.length > 64) this.pending.shift();
          return super.postMessage(...args);
        }
        terminate() {
          this.record.terminated = true;
          return super.terminate();
        }
      };
    });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Performance.enable");
    const start = performance.now();
    await p.goto(base + "/?capture=1");
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
      null,
      { timeout: 60000 },
    );
    const r = {
      sceneReadyMs: performance.now() - start,
      initial: await metrics(p),
    };
    await settle(p);
    r.startup = await p.evaluate(() => ({
      longTasks: window.__bergenProfile.longTasks.slice(),
      resources: performance.getEntriesByType("resource").map((e) => ({
        name: new URL(e.name).pathname,
        duration: e.duration,
        bytes: e.transferSize,
      })),
      preparation: JSON.parse(
        document.querySelector("canvas").dataset.preparation ?? "null",
      ),
    }));
    await p
      .getByRole("button", { name: "Enter Planning Mode →", exact: true })
      .click();
    await importPlan(p);
    await p.getByRole("button", { name: "Living City", exact: true }).click();
    await month(p, 0);
    r.advanceSixMs = await command(
      p,
      () =>
        p
          .getByRole("button", { name: "Advance six months", exact: true })
          .click(),
      () => month(p, 6),
    );
    r.monthSix = await p
      .getByLabel("District outcomes", { exact: true })
      .evaluate((e) => ({ ...e.dataset }));
    if (phase === "after") {
      const status = p.getByLabel("District transport connection", {
        exact: true,
      });
      await status.waitFor();
      assert.match(await status.innerText(), /0.*3|3.*unverified/);
      assert.equal(await status.getAttribute("data-added-trips"), "0");
    }
    r.editMs = await command(
      p,
      async () => {
        const d = p.locator(".city-management");
        if (!(await d.evaluate((e) => e.open)))
          await d.locator("summary").first().click();
        await p
          .getByRole("button", { name: /Quay homes/ })
          .first()
          .click();
        await p
          .getByLabel("Construction start month", { exact: true })
          .fill("2");
        await p
          .getByRole("button", {
            name: "Apply construction schedule",
            exact: true,
          })
          .click();
      },
      () => month(p, 0),
    );
    r.undoMs = await command(
      p,
      () => p.getByRole("button", { name: "↶ Undo", exact: true }).click(),
      () => month(p, 0),
    );
    r.redoMs = await command(
      p,
      () => p.getByRole("button", { name: "↷ Redo", exact: true }).click(),
      () => month(p, 0),
    );
    await p
      .getByRole("button", { name: "Advance six months", exact: true })
      .click();
    await month(p, 6);
    await p.getByRole("button", { name: "Play district", exact: true }).click();
    await month(p, 7);
    await month(p, 8);
    await p
      .getByRole("button", { name: "Pause district", exact: true })
      .click();
    await settle(p);
    r.playbackPaused = await metrics(p);
    r.scenarioSwitchMs = [];
    for (const name of [
      "living-quarter-example.json",
      "sustainable-quarter-example.json",
    ])
      r.scenarioSwitchMs.push(
        await command(
          p,
          () => importPlan(p, name),
          () => month(p, 0),
        ),
      );
    const samples = [];
    await p.locator("canvas").scrollIntoViewIfNeeded();
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
      if (i >= 2) samples.push(await metrics(p));
    }
    r.cameraSamplesMs = samples.map((s) => s.cameraLatencyMs);
    r.cameraMedianMs = [...r.cameraSamplesMs].sort((a, b) => a - b)[6];
    r.cameraP95Ms = Math.max(...r.cameraSamplesMs);
    await settle(p);
    r.retention = [];
    await p.evaluate(() => window.gc?.());
    r.heapBefore = await p.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    for (let i = 0; i < 5; i++) {
      await p
        .getByRole("button", { name: "Reset district time", exact: true })
        .click();
      await month(p, 0);
      for (let j = 6; j <= 24; j += 6) {
        await p
          .getByRole("button", { name: "Advance six months", exact: true })
          .click();
        await month(p, j);
      }
      await settle(p);
      r.retention.push((await metrics(p)).geometries);
    }
    await p.evaluate(() => window.gc?.());
    r.heapAfter = await p.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    assert.equal(new Set(r.retention).size, 1);
    assert(
      r.heapAfter - r.heapBefore < 5 * 1024 * 1024,
      "Bounded heap retention",
    );
    r.diagnostics = await p.evaluate(() => window.__bergenProfile);
    r.mainThread = Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics
        .filter((m) =>
          [
            "TaskDuration",
            "ScriptDuration",
            "LayoutDuration",
            "JSHeapUsedSize",
            "Nodes",
          ].includes(m.name),
        )
        .map((m) => [m.name, m.value]),
    );
    assert(
      r.diagnostics.workers.filter((w) => !w.terminated).length <= 2,
      "Workers bounded across switches and replay",
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Viewport must fit",
    );
    await p.screenshot({
      path: `${out}/${mobile ? "mobile" : "desktop"}-connected-status.jpg`,
    });
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
    `${out}/profile-browser-report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
