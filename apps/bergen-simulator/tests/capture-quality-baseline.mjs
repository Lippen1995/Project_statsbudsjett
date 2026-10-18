import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("..", import.meta.url));
const baseline = "7243b53544ffbae88d680eb7df531cd67f273ded";
const temp = mkdtempSync(resolve(tmpdir(), "bergen-r1-baseline-"));
let server;
try {
  const archive = execFileSync(
    "git",
    ["archive", baseline, "apps/bergen-simulator"],
    { cwd: resolve(app, "../.."), maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", temp], { input: archive });
  const archived = resolve(temp, "apps/bergen-simulator");
  assert.equal(
    readFileSync(resolve(app, "package-lock.json"), "utf8"),
    readFileSync(resolve(archived, "package-lock.json"), "utf8"),
  );
  for (const file of ["quality-browser.mjs", "quality-views.json"])
    cpSync(resolve(app, "tests", file), resolve(archived, "tests", file));
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
  assert(ready);
  execFileSync(
    process.execPath,
    [
      resolve(archived, "tests/quality-browser.mjs"),
      "http://127.0.0.1:4181",
      "before",
    ],
    { cwd: archived, stdio: "inherit" },
  );
  const out = resolve(app, "artifacts/r1/before");
  mkdirSync(out, { recursive: true });
  cpSync(resolve(archived, "artifacts/r1/before"), out, { recursive: true });
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
