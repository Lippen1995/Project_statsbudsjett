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
  baseline = "c334ba6ad0caedd90b6706d34c004a833d7f7dd5",
  temp = mkdtempSync(resolve(tmpdir(), "bergen-5c-baseline-"));
let server;
try {
  const archive = execFileSync(
    "git",
    ["archive", baseline, "apps/bergen-simulator"],
    { cwd: resolve(app, "../.."), maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", temp], { input: archive });
  const archived = resolve(temp, "apps/bergen-simulator");
  cpSync(
    resolve(app, "tests/connected-browser.mjs"),
    resolve(archived, "tests/connected-browser.mjs"),
  );
  cpSync(
    resolve(app, "tests/geometry-profile.test.ts"),
    resolve(archived, "tests/geometry-profile.test.ts"),
  );
  cpSync(
    resolve(app, "tests/geometry-baseline-5b.json"),
    resolve(archived, "tests/geometry-baseline-5b.json"),
  );
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
  // Run the exact committed 5B acceptance harness and application, unmodified.
  execFileSync(
    process.execPath,
    [
      resolve(archived, "tests/management-browser.mjs"),
      "http://127.0.0.1:4181",
    ],
    { cwd: archived, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [
      resolve(archived, "tests/connected-browser.mjs"),
      "http://127.0.0.1:4181",
      "before",
    ],
    { cwd: archived, stdio: "inherit" },
  );
  execFileSync(
    "npm",
    ["exec", "--", "vitest", "run", "tests/geometry-profile.test.ts"],
    {
      cwd: archived,
      stdio: "inherit",
      env: { ...process.env, BERGEN_PROFILE: "before" },
    },
  );
  const out = resolve(app, "artifacts/milestone-5c/before");
  mkdirSync(out, { recursive: true });
  cpSync(resolve(archived, "artifacts/milestone-5b/after"), out, {
    recursive: true,
  });
  cpSync(resolve(archived, "artifacts/milestone-5c/before"), out, {
    recursive: true,
  });
  const report = JSON.parse(readFileSync(resolve(out, "browser-report.json")));
  writeFileSync(
    resolve(out, "management-browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  report.baselineCommit = baseline;
  report.captureCommand = "npm run test:connected-baseline";
  report.harnessCorrection =
    "Exact 5B app and management journey; connected profiler is copied unchanged into the archive for measurement.";
  writeFileSync(
    resolve(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
