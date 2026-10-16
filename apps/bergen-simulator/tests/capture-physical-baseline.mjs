import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const app = fileURLToPath(new URL("..", import.meta.url)),
  baseline = "e04790448595e12c7936c6a86c0bfe1a9971555f",
  temp = mkdtempSync(resolve(tmpdir(), "bergen-4a-baseline-"));
let server, browser;
try {
  const archive = execFileSync(
    "git",
    ["archive", baseline, "apps/bergen-simulator"],
    { cwd: resolve(app, "../.."), maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", temp], { input: archive });
  const archived = resolve(temp, "apps/bergen-simulator");
  symlinkSync(
    resolve(app, "node_modules"),
    resolve(archived, "node_modules"),
    "dir",
  );
  execFileSync("npm", ["run", "build"], { cwd: archived, stdio: "inherit" });
  server = spawn(
    process.execPath,
    [
      resolve(app, "node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4181",
      "--strictPort",
    ],
    { cwd: archived, stdio: "ignore" },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert(server.exitCode === null, "Baseline preview exited");
    try {
      ready = (await fetch("http://127.0.0.1:4181")).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Baseline preview did not start");
  // Only the capture harness is corrected: wait for async File.text() import completion.
  // Application code, geometry, camera probes and rendering remain exact e047904.
  const browserPath = resolve(archived, "tests/scenario-browser.mjs");
  const browserCode = readFileSync(browserPath, "utf8");
  const oldImport = `    buffer: Buffer.from(text),
  });
}`;
  const completedImport = `    buffer: Buffer.from(text),
  });
  const file=JSON.parse(text);
  if(file.version===99)await page.getByRole("alert").filter({hasText:"Import rejected"}).waitFor();
  else await page.waitForFunction(name=>document.querySelector(".plan-heading strong")?.textContent===name,file.name);
}`;
  assert(browserCode.includes(oldImport), "Historical import harness changed");
  const loadStart = '  await page.goto(base + "/?capture=1");';
  const loadEnd = "  return page;\n}";
  assert(
    browserCode.includes(loadStart) && browserCode.includes(loadEnd),
    "Historical load harness changed",
  );
  writeFileSync(
    browserPath,
    browserCode
      .replace(oldImport, completedImport)
      .replace(loadStart, "  const loadStart=performance.now();\n" + loadStart)
      .replace(
        loadEnd,
        '  report[mobile?"mobile":"desktop"].loadMs=performance.now()-loadStart;\n' +
          loadEnd,
      ),
  );
  execFileSync(
    process.execPath,
    [resolve(archived, "tests/scenario-browser.mjs"), "http://127.0.0.1:4181"],
    { cwd: archived, stdio: "inherit" },
  );
  const out = resolve(app, "artifacts/milestone-4a/before");
  mkdirSync(out, { recursive: true });
  cpSync(resolve(archived, "artifacts/milestone-3b"), out, { recursive: true });
  const report = JSON.parse(readFileSync(resolve(out, "browser-report.json")));
  report.baselineCommit = baseline;
  report.captureCommand = "npm run test:physical-baseline";
  report.harnessCorrection =
    "Await File.text() import completion and record initial load elapsed time; no application or renderer changes.";
  writeFileSync(
    resolve(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:4181/?capture=1");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.capture,
  );
  await page.getByRole("button", { name: "Enter Planning Mode →" }).click();
  await page
    .getByRole("button", { name: "▶ Run plan", exact: true })
    .waitFor();
  await page.locator("canvas").evaluate((c) =>
    c.dispatchEvent(
      new CustomEvent("bergen:capture", {
        detail: { position: [-90, 115, -120], target: [-40, 1, -240] },
      }),
    ),
  );
  await page.waitForTimeout(2200);
  const capture = await page
    .locator("canvas")
    .evaluate((c) => JSON.parse(c.dataset.capture));
  for (const [key, expected] of [
    ["position", [-90, 115, -120]],
    ["target", [-40, 1, -240]],
  ])
    for (let i = 0; i < 3; i++)
      assert(
        Math.abs(capture[key][i] - expected[i]) < 1e-6,
        "Historical waterfront camera changed",
      );
  report.waterfrontCapture = capture;
  writeFileSync(
    resolve(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await page
    .locator("canvas")
    .screenshot({ path: resolve(out, "02-waterfront.jpg") });
} finally {
  await browser?.close();
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
