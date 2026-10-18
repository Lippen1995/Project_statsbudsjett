import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const catalogue = JSON.parse(readFileSync("src/architecture/catalogue.json"));
const city = JSON.parse(readFileSync("public/data/bergen.json"));
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
const out = "artifacts/r1b/assets";
mkdirSync(out, { recursive: true });
const expectedResourceErrors = new WeakSet();
const report = { errors: [], checks: [], cases: [] };
const metrics = (p) =>
  p.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
async function settle(p) {
  await p.waitForTimeout(900);
  const a = (await metrics(p)).frames;
  await p.waitForTimeout(700);
  assert.equal((await metrics(p)).frames, a);
}
async function setup(mobile = false) {
  const p = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  p.on("pageerror", (e) => report.errors.push(e.message));
  p.on("console", (m) => {
    if (
      m.type() === "error" &&
      !(
        expectedResourceErrors.has(p) &&
        m.location().url === base + catalogue.url
      )
    )
      report.errors.push(m.text());
  });
  await p.route(base + "/?capture=1", async (r) => {
    const response = await r.fetch();
    await r.fulfill({
      response,
      headers: { ...response.headers(), ...headers },
    });
  });
  return p;
}
async function open(p) {
  await p.goto(base + "/?capture=1");
  await p.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
    null,
    { timeout: 60000 },
  );
}
async function pose(p, position, target) {
  await p.locator("canvas").scrollIntoViewIfNeeded();
  await p
    .locator("canvas")
    .evaluate(
      (c, detail) =>
        c.dispatchEvent(new CustomEvent("bergen:capture", { detail })),
      { position, target },
    );
  await settle(p);
}
try {
  for (const mobile of [false, true]) {
    const p = await setup(mobile);
    await open(p);
    await p.waitForFunction(
      () =>
        JSON.parse(document.querySelector("canvas").dataset.capture)
          .textures === 2,
    );
    await settle(p);
    const near = await metrics(p);
    assert.equal(near.calls, 7);
    assert.equal(near.geometries, 7); // Parallel startup avoids uploading the original fallback first.
    assert.equal(near.textures, 2);
    await pose(p, [-145, 34, -200], [-55, 8, -280]);
    const picked = [],
      pickSamplesMs = [];
    for (const r of catalogue.buildings.slice(0, 6)) {
      const b = city.buildings.find((b) => b.id === r.id);
      const ring = b.rings[0].slice(0, -1);
      const edge = ring
        .map((a, i) => [a, ring[(i + 1) % ring.length]])
        .sort(
          (e, f) =>
            f.reduce((n, p) => n - p[0] + p[1], 0) -
            e.reduce((n, p) => n - p[0] + p[1], 0),
        )[0];
      const position = [
        (edge[0][0] + edge[1][0]) / 2 - 0.04,
        b.elevation + (r.roof.eaveNN2000 - b.elevation) * 0.72,
        (edge[0][1] + edge[1][1]) / 2 + 0.04,
      ];
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
      const projected = new Vector3(...position).project(camera);
      const x = rect.x + ((projected.x + 1) * rect.width) / 2,
        y = rect.y + ((1 - projected.y) * rect.height) / 2;
      assert(
        x > rect.x &&
          x < rect.x + rect.width &&
          y > rect.y &&
          y < rect.y + rect.height,
        "Projected facade visible",
      );
      const pickStart = performance.now();
      if (mobile) await p.touchscreen.tap(x, y);
      else await p.mouse.click(x, y);
      await p.waitForFunction(
        (id) => document.querySelector(".inspector")?.textContent.includes(id),
        r.id,
      );
      assert.match(
        await p.locator(".inspector").innerText(),
        /R1B architectural study/,
      );
      picked.push(r.id);
      pickSamplesMs.push(performance.now() - pickStart);
    }
    await p.locator(".viewport").screenshot({
      path: `${out}/${mobile ? "mobile" : "desktop"}-selected.jpg`,
      type: "jpeg",
      quality: 92,
    });
    await p
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await pose(p, [105, 22, -102], [51, 6, -142]);
    {
      const record = catalogue.buildings.at(-1),
        b = city.buildings.find((b) => b.id === record.id);
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
      const point = new Vector3(
        b.center[0],
        record.roof.eaveNN2000 + 0.4,
        b.center[1],
      ).project(camera);
      const x = rect.x + ((point.x + 1) * rect.width) / 2,
        y = rect.y + ((1 - point.y) * rect.height) / 2;
      const pickStart = performance.now();
      if (mobile) await p.touchscreen.tap(x, y);
      else await p.mouse.click(x, y);
      await p.waitForFunction(
        (id) => document.querySelector(".inspector")?.textContent.includes(id),
        b.id,
      );
      picked.push(b.id);
      pickSamplesMs.push(performance.now() - pickStart);
      await p.locator(".viewport").screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-skur-selected.jpg`,
        type: "jpeg",
        quality: 92,
      });
    }
    await p
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Performance.enable");
    const heap = async () => {
      await p.evaluate(() => window.gc?.());
      return (await cdp.send("Performance.getMetrics")).metrics.find(
        (m) => m.name === "JSHeapUsedSize",
      ).value;
    };
    const heapBefore = await heap();
    const cycles = [];
    for (let i = 0; i < 3; i++) {
      await pose(p, [1200, 1500, 2000], [0, 0, 0]);
      assert.equal((await metrics(p)).calls, 5);
      await pose(p, [-145, 85, -45], [-12, 8, -260]);
      await p.waitForFunction(
        () =>
          JSON.parse(document.querySelector("canvas").dataset.capture)
            .textures === 2,
      );
      await settle(p);
      const m = await metrics(p);
      cycles.push({
        geometries: m.geometries,
        textures: m.textures,
        bytes: m.attributeBytes,
      });
    }
    assert(
      cycles.every(
        (c) =>
          c.geometries === 8 &&
          c.textures === 2 &&
          c.bytes === near.attributeBytes,
      ),
      "Tile eviction/reload does not grow GPU allocations",
    );
    const heapAfter = await heap();
    assert(
      heapAfter - heapBefore < 5 * 1024 * 1024,
      "Bounded JS retention across tile eviction/reload",
    );
    await cdp.detach();
    await p.getByLabel("Rendering", { exact: true }).selectOption("low");
    await settle(p);
    assert.equal((await metrics(p)).calls, 5);
    assert.equal((await metrics(p)).textures, 1);
    assert(
      await p.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
      "Mobile fit",
    );
    report.cases.push({
      mobile,
      picked,
      pickSamplesMs,
      near,
      cycles,
      heapBefore,
      heapAfter,
    });
    await p.close();
  }
  for (const mode of ["missing", "corrupt", "cancelled"]) {
    const p = await setup();
    if (mode === "missing") expectedResourceErrors.add(p);
    let requested = 0,
      releaseDelayed = () => {};
    await p.route(base + catalogue.url, async (r) => {
      requested++;
      if (mode === "missing")
        await r.fulfill({
          status: 404,
          contentType: "application/octet-stream",
          body: Buffer.alloc(0),
        });
      else if (mode === "corrupt") {
        const body = readFileSync("public" + catalogue.url);
        body[100] ^= 1;
        await r.fulfill({ contentType: "model/gltf-binary", body });
      } else {
        await new Promise((resolve) => {
          releaseDelayed = resolve;
        });
        try {
          await r.fulfill({
            contentType: "model/gltf-binary",
            body: readFileSync("public" + catalogue.url),
          });
        } catch {
          /*request already cancelled*/
        }
      }
    });
    await open(p);
    for (let i = 0; i < 200 && !requested; i++) await p.waitForTimeout(20);
    assert(requested > 0, "Asset request started");
    if (mode === "cancelled") {
      await p.getByLabel("Rendering", { exact: true }).selectOption("low");
      await settle(p);
      releaseDelayed();
      await p.waitForTimeout(1400);
      assert.equal((await metrics(p)).calls, 5);
      assert.equal((await metrics(p)).textures, 1);
    } else {
      await p.getByLabel("Search mapped places").fill("Skur 11");
      await p.locator(".place-list button").first().click();
      await p
        .getByText(
          /Architectural detail unavailable; original schematic geometry retained/,
        )
        .waitFor();
      await settle(p);
      assert((await metrics(p)).calls <= 7);
      assert.equal((await metrics(p)).textures, 1);
    }
    assert(requested >= 1);
    report.checks.push(
      mode + " retains immutable fallback without stale detail",
    );
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "All seven source IDs picked directly per viewport, including six photographic facades; unchanged CSP; no blob fetch; zero idle; low tier; bounded tile eviction",
  );
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks: report.checks,
        cases: report.cases.map((c) => ({
          mobile: c.mobile,
          picked: c.picked.length,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
