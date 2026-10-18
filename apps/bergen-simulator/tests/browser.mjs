import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// Run against the independently built preview: npm run preview -- --host 127.0.0.1
const base = process.argv[2] || "http://127.0.0.1:4180";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Browser verification is local only",
);
const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const artifacts = new URL("../artifacts/", import.meta.url);
mkdirSync(artifacts, { recursive: true });
const errors = [],
  failures = [],
  cancelledAssets = [],
  requests = new Set();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const architecturalUrl = new URL(
  JSON.parse(
    readFileSync(
      new URL("../src/architecture/catalogue.json", import.meta.url),
    ),
  ).url,
  base,
).href;
page.on("requestfailed", (r) => {
  // Layer/quality switches deliberately cancel this optional tile. Source-data,
  // module, HTTP and all other network failures remain fatal below.
  if (
    r.url() === architecturalUrl &&
    r.failure()?.errorText === "net::ERR_ABORTED"
  )
    cancelledAssets.push(r.url());
  else failures.push(`${r.url()}: ${r.failure()?.errorText}`);
});
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
page.on("request", (r) => requests.add(r.url()));
try {
  await page.goto(base);
  await page.locator("canvas").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  await page.getByText("mapped buildings", { exact: true }).waitFor();
  await page.screenshot({ path: new URL("desktop.png", artifacts).pathname });
  const canvas = page.locator("canvas");
  const before = await canvas.screenshot();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const zoomed = await canvas.screenshot();
  assert(!before.equals(zoomed), "Zoom must change the rendered scene");
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 100,
    rect.y + rect.height / 2 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  const orbited = await canvas.screenshot();
  assert(!zoomed.equals(orbited), "Orbit must change the rendered scene");
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    rect.x + rect.width / 2 + 140,
    rect.y + rect.height / 2 + 50,
    { steps: 8 },
  );
  await page.mouse.up({ button: "right" });
  assert(
    !orbited.equals(await canvas.screenshot()),
    "Pan must change the rendered scene",
  );

  await page.getByRole("switch", { name: "Buildings", exact: true }).click();
  assert.equal(
    await page
      .getByRole("switch", { name: "Buildings", exact: true })
      .isChecked(),
    false,
  );
  await page.getByRole("switch", { name: "Buildings", exact: true }).click();
  await page.getByLabel("Rendering", { exact: true }).selectOption("low");
  assert.equal(await canvas.evaluate((c) => c.width), Math.round(rect.width));
  await page
    .getByRole("button", { name: "Reset overview and north direction" })
    .click();

  const data = JSON.parse(
    readFileSync(new URL("../public/data/bergen.json", import.meta.url)),
  );
  const place =
    data.buildings.find((b) => /Mariakirken/.test(b.name)) ||
    data.buildings.find((b) => b.tags.name);
  assert(place, "A verified named building is required for selection QA");
  await page.getByLabel("Search mapped places").fill(place.name);
  await page.locator(".place-list button").first().click();
  await page.getByRole("button", { name: "Clear selection" }).click();
  // Pointer selection must resolve a triangle from the merged mesh to its OSM feature.
  let picked = false;
  for (const [dx, dy] of [
    [0, 0],
    [0, -10],
    [10, -10],
    [-10, -10],
    [0, -25],
    [20, -25],
    [-20, -25],
    [0, 15],
  ]) {
    await page.mouse.click(
      rect.x + rect.width / 2 + dx,
      rect.y + rect.height / 2 + dy,
    );
    if (await page.getByText("Rendered height", { exact: true }).count()) {
      picked = true;
      break;
    }
  }
  assert(picked, "A mapped building must be selectable in the 3D canvas");
  assert(
    await page
      .locator(".inspector")
      .innerText()
      .then((t) => /way\/|relation\//.test(t)),
    "Inspector must show an OSM identity",
  );
  await page.getByRole("button", { name: /Focus on object/ }).click();
  await page.getByRole("button", { name: /Data & accuracy/ }).click();
  await page
    .getByRole("heading", { name: "Real places. Honest geometry." })
    .waitFor();
  await page.getByRole("button", { name: "Close data and accuracy" }).click();
  await page.screenshot({ path: new URL("selection.png", artifacts).pathname });

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Reset overview and north direction" })
    .click();
  await page.screenshot({
    path: new URL("mobile.png", artifacts).pathname,
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile page must not overflow horizontally",
  );
  assert(await canvas.isVisible(), "Scene remains visible on mobile");
  assert(
    [...requests].every((url) => new URL(url).origin === new URL(base).origin),
    "Runtime must use only local static assets",
  );
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.deepEqual(failures, [], "Failed HTTP requests");
  // Failure path: no fake city appears when the snapshot cannot load.
  const failurePage = await browser.newPage();
  await failurePage.route("**/data/bergen.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await failurePage.goto(base);
  await failurePage.getByRole("alert").waitFor();
  assert.equal(await failurePage.locator("canvas").count(), 0);
  await failurePage.close();
  const highDpi = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  highDpi.on("pageerror", (e) => errors.push(e.message));
  await highDpi.goto(base);
  await highDpi.locator("canvas").waitFor({ timeout: 60000 });
  await highDpi.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return c?.width > 0;
  });
  const ratio = await highDpi
    .locator("canvas")
    .evaluate((c) => c.width / c.getBoundingClientRect().width);
  assert(ratio <= 1.51, "Balanced rendering must cap a 3× display at DPR 1.5");
  await highDpi.getByLabel("Rendering", { exact: true }).selectOption("low");
  await highDpi.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return Math.abs(c.width / c.getBoundingClientRect().width - 1) < 0.01;
  });
  await highDpi.close();
  assert.deepEqual(errors, [], "High-DPI runtime errors");
  const report = {
    passed: true,
    checkedAt: new Date().toISOString(),
    errors,
    failures,
    localRequests: requests.size,
    cancelledAssets,
    checks: [
      "WebGL scene",
      "zoom",
      "orbit",
      "pan",
      "layer visibility",
      "low power rendering",
      "merged-mesh pointer selection",
      "source inspection",
      "camera focus/reset",
      "accuracy panel",
      "390px responsive layout",
      "3× display bounded to DPR 1.5; low power DPR 1",
      "no external runtime services",
      "missing snapshot failure",
    ],
  };
  writeFileSync(
    new URL("browser-report.json", artifacts),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
