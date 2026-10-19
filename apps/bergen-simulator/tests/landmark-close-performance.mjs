import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4180",
  phase = process.argv[3] ?? "after";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(["before", "after"].includes(phase));
const out = `artifacts/r1c/close-${phase}`;
mkdirSync(out, { recursive: true });
const views = JSON.parse(readFileSync("tests/landmark-views.json")).filter(
  (v) => ["street-frontal", "detail"].includes(v.name),
);
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
  ],
});
const report = {
  phase,
  baselineCommit: "d278ec9a5f17f5750c4a62a0bfae6c0ee891e0f8",
  browser: browser.version(),
  method:
    "four warm-ups + twelve retained two-RAF/gl.finish software completion probes; not physical FPS",
  cases: {},
  errors: [],
};
try {
  for (const mobile of [false, true]) {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    await p.route(base + "/?capture=1", async (r) => {
      const response = await r.fetch();
      await r.fulfill({
        response,
        headers: { ...response.headers(), ...headers },
      });
    });
    await p.goto(base + "/?capture=1");
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
      null,
      { timeout: 60000 },
    );
    await p.waitForFunction(
      () =>
        JSON.parse(document.querySelector("canvas").dataset.capture)
          .textures === 2,
    );
    for (const v of views) {
      const samples = [];
      for (let i = 0; i < 16; i++) {
        const result = await p.locator("canvas").evaluate(
          async (c, { v, i }) => {
            const detail = {
              position: [
                v.position[0] + (i % 2) * 0.5,
                v.position[1],
                v.position[2],
              ],
              target: v.target,
            };
            const start = performance.now();
            c.dispatchEvent(new CustomEvent("bergen:capture", { detail }));
            await new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            );
            c.getContext("webgl2").finish();
            return {
              driverMs: performance.now() - start,
              ...JSON.parse(c.dataset.capture),
            };
          },
          { v, i },
        );
        if (i >= 4) samples.push(result);
      }
      await p.waitForTimeout(1000);
      const f = await p
        .locator("canvas")
        .evaluate((c) => JSON.parse(c.dataset.capture).frames);
      await p.waitForTimeout(700);
      assert.equal(
        await p
          .locator("canvas")
          .evaluate((c) => JSON.parse(c.dataset.capture).frames),
        f,
      );
      const times = samples.map((s) => s.driverMs).sort((a, b) => a - b);
      const key = `${mobile ? "mobile" : "desktop"}-${v.name}`;
      report.cases[key] = {
        medianMs: times[6],
        p95Ms: times[11],
        samples,
        idleFrames: 0,
      };
      assert(samples.every((m) => m.calls <= 8 && m.triangles <= 292500));
    }
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  writeFileSync(out + "/metrics.json", JSON.stringify(report, null, 2) + "\n");
  if (phase === "after") {
    const before = JSON.parse(
      readFileSync("artifacts/r1c/close-before/metrics.json"),
    );
    for (const [key, r] of Object.entries(report.cases)) {
      const b = before.cases[key];
      assert(r.medianMs <= b.medianMs * 1.25 + 30, key + " median");
      assert(r.p95Ms <= b.p95Ms * 1.25 + 50, key + " P95");
    }
  }
  console.log(
    JSON.stringify({
      phase,
      status: "passed",
      cases: Object.fromEntries(
        Object.entries(report.cases).map(([k, r]) => [
          k,
          { medianMs: r.medianMs, p95Ms: r.p95Ms, idleFrames: 0 },
        ]),
      ),
    }),
  );
} finally {
  await browser.close();
}
