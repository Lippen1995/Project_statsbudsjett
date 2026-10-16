import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { prepareStageWorkspace } from "../scripts/ci-workspace.mjs";
import {
  assertAnonymousDenied,
  assertContext,
  assertDeployment,
  assertDomains,
  assertEnvironment,
  assertProject,
  assertTarget,
  cliFailureSummary,
  parseStageOutput,
  BRANCH,
  ENVIRONMENT,
  PROJECT,
  PROJECT_NAME,
  REPOSITORY,
  STABLE_HOST,
  TEAM,
} from "../scripts/ci-policy.mjs";

const sha = "a".repeat(40);

test("prebuilt staging mirrors the remote app root without copying repository source or environment files", () => {
  const app = mkdtempSync(resolve(tmpdir(), "bergen-stage-test-"));
  try {
    mkdirSync(resolve(app, ".vercel/output/static"), { recursive: true });
    writeFileSync(
      resolve(app, ".vercel/output/static/index.html"),
      "verified build",
    );
    writeFileSync(
      resolve(app, ".vercel/.env.production.local"),
      "private fixture",
    );
    writeFileSync(resolve(app, "vercel.json"), "{}");
    writeFileSync(resolve(app, "package.json"), "{}");
    writeFileSync(resolve(app, "unrelated-source.txt"), "do not package");
    for (const rootDirectory of [null, "apps/bergen-simulator"]) {
      const link = {
        orgId: TEAM,
        projectId: PROJECT,
        settings: { rootDirectory },
      };
      const workspace = prepareStageWorkspace(app, link);
      assert.deepEqual(
        JSON.parse(readFileSync(resolve(workspace, ".vercel/project.json"))),
        link,
      );
      assert(
        existsSync(resolve(workspace, rootDirectory ?? "", "vercel.json")),
      );
      assert.equal(
        readFileSync(
          resolve(workspace, ".vercel/output/static/index.html"),
          "utf8",
        ),
        "verified build",
      );
      assert.deepEqual(readdirSync(resolve(workspace, ".vercel")).sort(), [
        "output",
        "project.json",
      ]);
      assert(!existsSync(resolve(workspace, "unrelated-source.txt")));
    }
    assert.throws(() =>
      prepareStageWorkspace(app, {
        orgId: TEAM,
        projectId: PROJECT,
        settings: { rootDirectory: "../other-app" },
      }),
    );
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});

test("CLI diagnostics classify identity failures without reproducing captured credentials or URLs", () => {
  const privateValue = "do-not-publish-this-test-credential";
  assert.equal(
    cliFailureSummary({
      stderr: `Error: You do not have access to the specified account ${privateValue}`,
    }),
    "account identity lookup denied",
  );
  assert.equal(
    cliFailureSummary({
      stdout: JSON.stringify({
        reason: privateValue,
        url: `https://example.invalid/${privateValue}`,
      }),
    }),
    "unclassified CLI failure",
  );
  assert(
    !cliFailureSummary({ stderr: `HTTP 403 ${privateValue}` }).includes(
      privateValue,
    ),
  );
  assert.equal(
    cliFailureSummary({ stderr: "fetch failed: ECONNREFUSED" }),
    "CLI network request failed",
  );
  assert.equal(
    cliFailureSummary({
      stdout: JSON.stringify({
        error: { code: "PROJECT_UNAUTHORIZED", message: privateValue },
      }),
    }),
    "CLI project settings permission denied",
  );
});

test("pinned CLI non-interactive deployment JSON yields only a READY Bergen production URL", () => {
  const url = "https://bergen-reimagined-example-fjord-insight.vercel.app";
  const output = {
    status: "ok",
    deployment: { url, readyState: "READY", target: "production" },
  };
  assert.equal(parseStageOutput(JSON.stringify(output)), url);
  assert.throws(() => parseStageOutput(url));
  assert.throws(() =>
    parseStageOutput(JSON.stringify({ ...output, status: "error" })),
  );
  for (const patch of [
    { readyState: "BUILDING" },
    { target: null },
    { url: "https://unrelated.vercel.app" },
    { url: url + "/path" },
    { url: url.replace("https:", "http:") },
  ]) {
    assert.throws(() =>
      parseStageOutput(
        JSON.stringify({
          ...output,
          deployment: { ...output.deployment, ...patch },
        }),
      ),
    );
  }
});
const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_REF: `refs/heads/${BRANCH}`,
  GITHUB_EVENT_NAME: "push",
  GITHUB_SHA: sha,
  VERCEL_ORG_ID: TEAM,
  VERCEL_PROJECT_ID: PROJECT,
};
const project = {
  id: PROJECT,
  accountId: TEAM,
  name: PROJECT_NAME,
  ssoProtection: { deploymentType: "all" },
};
const deployment = {
  id: "dpl_bergen",
  projectId: PROJECT,
  ownerId: TEAM,
  target: "production",
  readyState: "READY",
  meta: {
    githubCommitSha: sha,
    githubCommitRef: BRANCH,
    githubCommitOrg: "Lippen1995",
    githubCommitRepo: "Project_statsbudsjett",
  },
};
const environment = {
  name: ENVIRONMENT,
  deployment_branch_policy: {
    custom_branch_policies: true,
    protected_branches: false,
  },
};

test("exact-SHA detached Actions context is permitted only for the intended branch, repository and events", () => {
  assertContext(env, sha);
  assertContext({ ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, sha);
  for (const patch of [
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_REF: "refs/heads/gh-pages" },
    { GITHUB_REF: "refs/heads/feature/other" },
    { GITHUB_REF: `refs/tags/${BRANCH}` },
    { GITHUB_REPOSITORY: "fork/Project_statsbudsjett" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "workflow_run" },
    { GITHUB_ACTIONS: "false" },
    { GITHUB_SHA: "" },
  ]) {
    assert.throws(() => assertContext({ ...env, ...patch }, sha));
  }
  assert.throws(() => assertContext(env, "b".repeat(40)));
});

test("target guards positively allow only the exact simulator IDs", () => {
  assertTarget(env);
  for (const patch of [
    { VERCEL_ORG_ID: "team_other" },
    { VERCEL_PROJECT_ID: "prj_other" },
    { VERCEL_PROJECT_ID: undefined },
    { VERCEL_ORG_ID: undefined },
  ]) {
    assert.throws(() => assertTarget({ ...env, ...patch }));
  }
});

test("project protection must positively identify Authentication for All Deployments", () => {
  assertProject(project);
  for (const patch of [
    { id: "prj_other" },
    { accountId: "team_other" },
    { name: "other" },
    { ssoProtection: null },
    { ssoProtection: {} },
    { ssoProtection: { deploymentType: "preview" } },
    { ssoProtection: { deploymentType: "all_except_custom_domains" } },
    { ssoProtection: { enabled: false, deploymentType: "all" } },
  ]) {
    assert.throws(() => assertProject({ ...project, ...patch }));
  }
});

test("only READY production output for the exact repository commit can be promoted", () => {
  assertDeployment(deployment, sha);
  for (const patch of [
    { projectId: "prj_other" },
    { ownerId: "team_other" },
    { target: null },
    { readyState: "BUILDING" },
    { readyState: "ERROR" },
    { id: "invalid" },
    { meta: { ...deployment.meta, githubCommitSha: "b".repeat(40) } },
    { meta: { ...deployment.meta, githubCommitRef: "main" } },
    { meta: { ...deployment.meta, githubCommitOrg: "fork" } },
    { meta: { ...deployment.meta, githubCommitRepo: "other" } },
  ]) {
    assert.throws(() => assertDeployment({ ...deployment, ...patch }, sha));
  }
});

test("promotion cannot carry an unrelated domain or a changed project domain set", () => {
  const initial = assertDomains([{ name: STABLE_HOST }]);
  assertDomains([STABLE_HOST], initial);
  assert.throws(() => assertDomains([STABLE_HOST, "unrelated.example"]));
  assert.throws(() => assertDomains(["other.vercel.app"]));
  assert.throws(() =>
    assertDomains(
      [STABLE_HOST, "bergen-reimagined-fjord-insight.vercel.app"],
      initial,
    ),
  );
});

test("the dedicated environment must allow the exact branch and no wildcard or tags", () => {
  const policies = [{ name: BRANCH, type: "branch" }];
  assertEnvironment(environment, policies);
  for (const patch of [
    { name: "vercel-migration" },
    { deployment_branch_policy: null },
    {
      deployment_branch_policy: {
        custom_branch_policies: false,
        protected_branches: true,
      },
    },
  ]) {
    assert.throws(() =>
      assertEnvironment({ ...environment, ...patch }, policies),
    );
  }
  for (const invalid of [
    [],
    [{ name: "*", type: "branch" }],
    [{ name: BRANCH, type: "tag" }],
    [...policies, { name: "main", type: "branch" }],
  ]) {
    assert.throws(() => assertEnvironment(environment, invalid));
  }
});

test("anonymous checks reject public content, generic failures and unrelated redirects", () => {
  assertAnonymousDenied(401, null, "<title>Authentication Required</title>");
  assertAnonymousDenied(302, "https://vercel.com/sso-api?url=test", "");
  assert.throws(() =>
    assertAnonymousDenied(200, null, "Authentication Required"),
  );
  assert.throws(() =>
    assertAnonymousDenied(503, null, "Authentication Required"),
  );
  assert.throws(() => assertAnonymousDenied(403, null, "Generic forbidden"));
  assert.throws(() =>
    assertAnonymousDenied(302, "https://other.example/login", ""),
  );
});
