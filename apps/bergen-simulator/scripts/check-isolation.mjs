import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertContext } from "./ci-policy.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const app = resolve(root, "apps/bergen-simulator");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (process.env.GITHUB_ACTIONS === "true") {
  // checkout@<SHA> deliberately detaches HEAD. Trust only the guarded repository,
  // exact branch/event metadata and triggering SHA, never a detached checkout alone.
  assertContext(process.env, git("rev-parse", "HEAD"));
} else {
  assert.equal(
    git("branch", "--show-current"),
    "feature/bergen-simulator",
    "Wrong development branch",
  );
}
const allowed = (path) =>
  /^(apps|docs)\/bergen-simulator\//.test(path) ||
  path === ".github/workflows/bergen-simulator.yml";
const baseline = JSON.parse(
  readFileSync(resolve(root, "docs/bergen-simulator/baseline.json")),
).commit;
const changes = git("diff", "--name-status", baseline)
  .split("\n")
  .filter(Boolean);
for (const change of changes) {
  const [status, path] = change.split("\t");
  assert.equal(status, "A", `Existing tracked file changed: ${path}`);
  assert(allowed(path), `Change outside the simulator boundary: ${path}`);
}
for (const path of git("ls-files", "--others", "--exclude-standard")
  .split("\n")
  .filter(Boolean)) {
  assert(allowed(path), `Unrelated untracked file: ${path}`);
}
const config = readFileSync(resolve(app, "vite.config.ts"), "utf8");
assert.match(config, /envDir:\s*false/);
const deployment = JSON.parse(readFileSync(resolve(app, "vercel.json")));
assert.equal(
  deployment.git.deploymentEnabled,
  false,
  "Native Git deployment must remain disabled; simulator releases use the isolated Actions workflow",
);
const pkg = JSON.parse(readFileSync(resolve(app, "package.json")));
assert(
  !Object.keys(pkg.dependencies).some((d) => /neon|postgres|prisma/.test(d)),
);
function inspect(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) {
      inspect(path);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(file.name)) continue;
    const source = readFileSync(path, "utf8");
    assert(
      !/DATABASE_URL|POSTGRES_URL|process\.env|import\.meta\.env|fellestall\.no|@neondatabase/.test(
        source,
      ),
      `Production service or environment reference: ${path}`,
    );
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()['"]([^'"]+)/g,
    )) {
      if (match[1].startsWith("."))
        assert(
          resolve(directory, match[1]).startsWith(app + "/"),
          `Import escapes application: ${path}`,
        );
    }
  }
}
inspect(resolve(app, "src"));
console.log(
  `Isolation verified against ${baseline}: original tracked files unchanged; additions confined to simulator directories and its exact workflow; no database or production service imports; native Git deployment disabled.`,
);
