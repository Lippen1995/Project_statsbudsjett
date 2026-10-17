import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4180";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = "artifacts/milestone-5c/after";
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
  ],
});
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
    await p.route(base + "/?capture=1", async (r) => {
      const s = await r.fetch();
      await r.fulfill({ response: s, headers: { ...s.headers(), ...headers } });
    });
    await p.goto(base + "/?capture=1");
    await p.waitForFunction(
      () => document.querySelector("canvas")?.dataset.capture,
    );
    await p
      .getByRole("button", { name: "Enter Planning Mode →", exact: true })
      .click();
    const library = p.locator(".plan-library");
    if (!(await library.evaluate((e) => e.open)))
      await library.locator("summary").click();
    await p.getByLabel("Import scenario JSON").setInputFiles({
      name: "sustainable-quarter-example.json",
      mimeType: "application/json",
      buffer: readFileSync("public/plans/sustainable-quarter-example.json"),
    });
    await p.waitForFunction(
      () =>
        document.querySelector(".plan-heading strong")?.textContent ===
        "Building a Sustainable Quarter",
    );
    await p.getByRole("button", { name: "Living City", exact: true }).click();
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="District outcomes"]')?.dataset
          .month === "0",
    );
    await p
      .getByRole("button", { name: "Advance to month 24", exact: true })
      .click();
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="District outcomes"]')?.dataset
          .month === "24",
    );
    await p.locator("canvas").evaluate((c) =>
      c.dispatchEvent(
        new CustomEvent("bergen:capture", {
          detail: { position: [-90, 115, -120], target: [-40, 1, -240] },
        }),
      ),
    );
    await p.waitForTimeout(1000);
    const status = p.getByLabel("District transport connection", {
      exact: true,
    });
    assert.equal(await status.getAttribute("data-added-trips"), "0");
    const why = p.locator("details").filter({
      has: p.locator("summary").filter({ hasText: "Why traffic is separate" }),
    });
    if (!(await why.evaluate((e) => e.open)))
      await why.locator("summary").click();
    await status.scrollIntoViewIfNeeded();
    if (mobile) {
      await status.screenshot({ path: out + "/mobile-access-readout.jpg" });
      await p
        .locator("canvas")
        .screenshot({ path: out + "/mobile-district-world.jpg" });
    } else await p.screenshot({ path: out + "/desktop-access-readout.jpg" });
    await p.close();
  }
} finally {
  await browser.close();
}
