import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PerspectiveCamera, Vector3 } from "three";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const headers = Object.fromEntries(
  JSON.parse(readFileSync("vercel.json")).headers[0].headers.map(
    ({ key, value }) => [key, value],
  ),
);
const out = "artifacts/r1c/inspection";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--js-flags=--expose-gc",
  ],
});
const report = { errors: [], cases: [] };
const metrics = (p) =>
  p.locator("canvas").evaluate((c) => JSON.parse(c.dataset.capture));
async function settle(p) {
  await p.waitForTimeout(1100);
  const f = (await metrics(p)).frames;
  await p.waitForTimeout(750);
  assert.equal((await metrics(p)).frames, f, "zero settled idle frames");
}
async function pick(p, point, mobile) {
  await p.locator("canvas").scrollIntoViewIfNeeded();
  const m = await metrics(p),
    rect = await p.locator("canvas").boundingBox();
  const camera = new PerspectiveCamera(43, rect.width / rect.height, 2, 14000);
  camera.position.fromArray(m.position);
  camera.lookAt(new Vector3(...m.target));
  camera.updateMatrixWorld();
  const q = new Vector3(...point).project(camera);
  const x = rect.x + ((q.x + 1) * rect.width) / 2,
    y = rect.y + ((1 - q.y) * rect.height) / 2;
  assert(
    x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height,
    "pick on screen",
  );
  if (mobile) await p.touchscreen.tap(x, y);
  else await p.mouse.click(x, y);
  await p.waitForTimeout(300);
  assert.match(await p.locator(".inspector").innerText(), /way\/393025479/);
}
try {
  for (const mobile of [false, true]) {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
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
    const overview = await metrics(p);
    await p
      .getByRole("button", { name: /Skur 11 · street inspection/ })
      .click();
    await p.locator("canvas").scrollIntoViewIfNeeded();
    // Let one complete finite flight finish without skipping. No perpetual render loop.
    await p.waitForTimeout(3000);
    await settle(p);
    const arrived = await metrics(p);
    assert(arrived.position[1] < 10 && arrived.position[1] > 3);
    assert(arrived.triangles > overview.triangles + 2000);
    assert(arrived.calls <= 8);
    assert(arrived.frames - overview.frames < 80, "bounded transition frames");
    const views = [];
    for (const name of [
      "Gable & doors",
      "Quay side",
      "Street side",
      "Stone capital",
    ]) {
      await p.getByRole("button", { name, exact: true }).click();
      await p
        .getByRole("button", { name: "Skip movement", exact: true })
        .click();
      await p.locator("canvas").scrollIntoViewIfNeeded();
      await settle(p);
      assert.equal(
        await p
          .getByRole("button", { name, exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      const m = await metrics(p);
      views.push({ name, ...m });
      await p.locator(".viewport").screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-${name.split(" ")[0].toLowerCase()}.jpg`,
        type: "jpeg",
        quality: 94,
      });
      assert(m.position.every(Number.isFinite));
      assert(m.position[1] > 2.5);
      assert(m.calls <= 8);
      assert(m.triangles <= 292500);
    }
    await p.getByRole("button", { name: "Gable & doors", exact: true }).click();
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await p.locator("canvas").focus();
    await p.keyboard.press("Escape");
    await settle(p);
    assert(
      (await metrics(p)).position[1] < 10,
      "Escape skips to cleared exterior view",
    );
    await p.getByRole("button", { name: "Stone capital", exact: true }).click();
    await p.getByRole("button", { name: "Skip movement", exact: true }).click();
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await settle(p);
    await p
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await pick(p, [59.17, 10.15, -128.53], mobile);
    assert.match(
      await p.locator(".inspector").innerText(),
      /photo-inferred|approximate reconstruction/,
    );
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await p.locator("canvas").focus();
    for (let i = 0; i < 8; i++) await p.keyboard.press("+");
    await p.keyboard.press("ArrowRight");
    await settle(p);
    const zoomed = await metrics(p);
    assert(zoomed.position[1] > 2.5);
    if (mobile) {
      const cdp = await p.context().newCDPSession(p),
        rect = await p.locator("canvas").boundingBox();
      const before = (await metrics(p)).position;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: rect.x + rect.width * 0.6, y: rect.y + rect.height * 0.4 },
        ],
      });
      for (let i = 1; i <= 5; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: rect.x + rect.width * 0.6 + i * 5,
              y: rect.y + rect.height * 0.4,
            },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle(p);
      assert.notDeepEqual(
        (await metrics(p)).position,
        before,
        "real synthetic touch orbit",
      );
      await cdp.detach();
    }
    await p
      .getByRole("button", { name: "Back to Bergen ↗", exact: true })
      .click();
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await settle(p);
    assert((await metrics(p)).position[1] > 1000);
    assert.equal(
      await p
        .getByRole("button", { name: "Stone capital", exact: true })
        .count(),
      0,
    );
    assert(
      await p.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
    );
    report.cases.push({
      mobile,
      overview,
      arrived,
      views,
      zoomed,
      idleFrames: 0,
    });
    await p.close();
  }
  assert.deepEqual(report.errors, []);
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "passed",
      viewports: 2,
      viewsPerViewport: 4,
      picking: "OSM identity retained",
      idleFrames: 0,
    }),
  );
} finally {
  await browser.close();
}
