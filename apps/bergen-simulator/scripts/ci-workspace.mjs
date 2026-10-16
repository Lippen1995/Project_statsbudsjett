import assert from "node:assert/strict";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT, TEAM } from "./ci-policy.mjs";

export function prepareStageWorkspace(app, link) {
  assert.equal(link.projectId, PROJECT);
  assert.equal(link.orgId, TEAM);
  const directory = link.settings?.rootDirectory ?? "";
  assert(["", "apps/bergen-simulator"].includes(directory));
  // The CLI resolves the remote Root Directory relative to its working directory,
  // even for --prebuilt. Package only this app in a disposable repository layout.
  const workspace = resolve(app, ".vercel", "bergen-stage");
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(resolve(workspace, ".vercel"), { recursive: true });
  writeFileSync(
    resolve(workspace, ".vercel/project.json"),
    JSON.stringify(link),
    { mode: 0o600 },
  );
  cpSync(resolve(app, ".vercel/output"), resolve(workspace, ".vercel/output"), {
    recursive: true,
  });
  mkdirSync(resolve(workspace, directory), { recursive: true });
  for (const name of ["vercel.json", "package.json"])
    cpSync(resolve(app, name), resolve(workspace, directory, name));
  return workspace;
}
