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

// Read-only historical archive; never checks out or modifies a branch/worktree.
// 54c6531 contains the probe. Only the capture harness gets the documented visibility correction.
const app = fileURLToPath(new URL("..", import.meta.url));
const baseline = "54c65318a3a82af51d36e196c2cc313148703efc";
const temp = mkdtempSync(resolve(tmpdir(), "bergen-3b-baseline-"));
let server;
try {
  const archive = execFileSync(
    "git",
    ["archive", baseline, "apps/bergen-simulator"],
    { cwd: resolve(app, "../.."), maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", temp], { input: archive });
  const archivedApp = resolve(temp, "apps/bergen-simulator");
  symlinkSync(
    resolve(app, "node_modules"),
    resolve(archivedApp, "node_modules"),
    "dir",
  );
  // Instrumentation-only correction applied equally to before/after profiling:
  // the phone's canvas must be onscreen, rather than scrolled below the tools.
  const browserPath = resolve(archivedApp, "tests/scenario-browser.mjs");
  const browserCode = readFileSync(browserPath, "utf8");
  assert(browserCode.includes("async function profile(page) {"));
  writeFileSync(
    browserPath,
    browserCode
      .replace(
        "viewport, deviceScaleFactor: 1",
        "viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 700, isMobile: viewport.width < 700",
      )
      .replace(
        "async function profile(page) {",
        "async function profile(page) {\n  await page.locator('canvas').scrollIntoViewIfNeeded();\n  await settle(page);",
      ),
  );
  execFileSync("npm", ["run", "build"], { cwd: archivedApp, stdio: "inherit" });
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
    { cwd: archivedApp, stdio: "ignore" },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert(server.exitCode === null, "Baseline preview exited");
    try {
      ready = (await fetch("http://127.0.0.1:4181")).ok;
    } catch {
      /* server is starting */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Baseline preview did not start");
  execFileSync(
    process.execPath,
    [
      resolve(archivedApp, "tests/scenario-browser.mjs"),
      "http://127.0.0.1:4181",
    ],
    { cwd: archivedApp, stdio: "inherit" },
  );
  const destination = resolve(app, "artifacts/milestone-3b/before");
  mkdirSync(destination, { recursive: true });
  cpSync(resolve(archivedApp, "artifacts/milestone-3a"), destination, {
    recursive: true,
  });
  const metricsPath = resolve(destination, "browser-report.json");
  const metrics = JSON.parse(readFileSync(metricsPath, "utf8"));
  metrics.baselineCommit = baseline;
  metrics.captureCommand = "npm run test:sandbox-baseline";
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + "\n");
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
