import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4180",
  phase = process.argv[3] ?? "after";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(["before", "after"].includes(phase));
const out = `artifacts/r1b/details-${phase}`;
mkdirSync(out, { recursive: true });
const headers = Object.fromEntries(
  JSON.parse(readFileSync("vercel.json")).headers[0].headers.map(
    ({ key, value }) => [key, value],
  ),
);
const views = [
  {
    name: "northern-group",
    position: [-145, 34, -200],
    target: [-55, 8, -280],
  },
  { name: "skur-gable", position: [105, 22, -102], target: [51, 6, -142] },
];
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = { phase, views, cases: [], errors: [] };
try {
  for (const mobile of [false, true]) {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
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
    if (phase === "after")
      await p.waitForFunction(
        () =>
          JSON.parse(document.querySelector("canvas").dataset.capture)
            .textures === 2,
      );
    for (const view of views) {
      await p
        .locator("canvas")
        .evaluate(
          (c, detail) =>
            c.dispatchEvent(new CustomEvent("bergen:capture", { detail })),
          view,
        );
      await p.waitForTimeout(1000);
      await p
        .locator("canvas")
        .evaluate((c) => c.getContext("webgl2").finish());
      const m = await p
        .locator("canvas")
        .evaluate((c) => JSON.parse(c.dataset.capture));
      for (let i = 0; i < 3; i++)
        assert(Math.abs(m.position[i] - view.position[i]) < 0.01);
      await p
        .locator(".viewport")
        .screenshot({
          path: `${out}/${mobile ? "mobile" : "desktop"}-${view.name}.jpg`,
          type: "jpeg",
          quality: 94,
        });
      report.cases.push({
        mobile,
        view: view.name,
        calls: m.calls,
        triangles: m.triangles,
      });
    }
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ phase, status: "passed", cases: report.cases }));
} finally {
  await browser.close();
}
