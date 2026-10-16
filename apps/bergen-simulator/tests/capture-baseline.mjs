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
// Only the identical localhost capture probe is added to the baseline renderer.
const app = fileURLToPath(new URL("..", import.meta.url));
const baseline = "ab92713a99588dbf2458135e1bf7b41d892088a5";
const temp = mkdtempSync(resolve(tmpdir(), "bergen-2a-baseline-"));
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
  for (const file of [
    "src/geo/capture.ts",
    "tests/visual.mjs",
    "tests/visual-views.json",
  ])
    cpSync(resolve(app, file), resolve(archivedApp, file));
  const scenePath = resolve(archivedApp, "src/components/Scene.tsx");
  let scene = readFileSync(scenePath, "utf8");
  assert(scene.includes('orbit.addEventListener("change", onChange);'));
  scene =
    'import { installCapture } from "../geo/capture";\n' +
    scene
      .replace(
        'orbit.addEventListener("change", onChange);',
        'orbit.addEventListener("change", onChange);\nconst stopCapture=installCapture(camera,gl,orbit,invalidate);',
      )
      .replace("orbit.dispose();", "stopCapture();\norbit.dispose();");
  writeFileSync(scenePath, scene);
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
      resolve(archivedApp, "tests/visual.mjs"),
      "http://127.0.0.1:4181",
      "before",
    ],
    { cwd: archivedApp, stdio: "inherit" },
  );
  const destination = resolve(app, "artifacts/milestone-2a/before");
  mkdirSync(destination, { recursive: true });
  cpSync(resolve(archivedApp, "artifacts/milestone-2a/before"), destination, {
    recursive: true,
  });
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  rmSync(temp, { recursive: true, force: true });
}
