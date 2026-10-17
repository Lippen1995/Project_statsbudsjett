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
const app = fileURLToPath(new URL("..", import.meta.url)),
  baseline = "298d1620d1bfca4d115ac841c8a5b46643371e84",
  temp = mkdtempSync(resolve(tmpdir(), "bergen-5a-baseline-"));
let server;
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
  // Run the exact committed 4B acceptance harness and application, unmodified.
  execFileSync(
    process.execPath,
    [resolve(archived, "tests/building-browser.mjs"), "http://127.0.0.1:4181"],
    { cwd: archived, stdio: "inherit" },
  );
  const out = resolve(app, "artifacts/milestone-5a/before");
  mkdirSync(out, { recursive: true });
  cpSync(resolve(archived, "artifacts/milestone-4b/after"), out, { recursive: true });
  const report = JSON.parse(readFileSync(resolve(out, "browser-report.json")));
  report.baselineCommit = baseline;
  report.captureCommand = "npm run test:living-baseline";
  report.harnessCorrection = "None; exact 4B source and harness.";
  writeFileSync(
    resolve(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
