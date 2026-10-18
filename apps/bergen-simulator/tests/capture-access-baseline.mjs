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
  baseline = "830a39fdef6a92a66ad4c4850cff7219bb1af975",
  temp = mkdtempSync(resolve(tmpdir(), "bergen-5d-baseline-"));
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
  // Keep the archived 5C profiler. The R1 profiler requires a sixth geometry
  // export that deliberately does not exist in the historical implementation.
  cpSync(
    resolve(app, "tests/geometry-baseline-5b.json"),
    resolve(archived, "tests/geometry-baseline-5b.json"),
  );
  assert.equal(
    readFileSync(resolve(app, "package-lock.json"), "utf8"),
    readFileSync(resolve(archived, "package-lock.json"), "utf8"),
    "Shared installed dependencies require the exact baseline lockfile",
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
  // Exact 5C app, lockfile and the same pre-existing connected profiler.
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
  const out = resolve(app, "artifacts/milestone-5d/baseline-repeat");
  mkdirSync(out, { recursive: true });
  cpSync(resolve(archived, "artifacts/milestone-5c/before"), out, {
    recursive: true,
  });
  const report = JSON.parse(
    readFileSync(resolve(out, "profile-browser-report.json")),
  );
  report.baselineCommit = baseline;
  report.captureCommand = "npm run test:access-baseline";
  writeFileSync(
    resolve(out, "profile-browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
