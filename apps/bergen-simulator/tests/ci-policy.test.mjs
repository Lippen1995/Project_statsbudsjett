import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAnonymousDenied,
  assertContext,
  assertDeployment,
  assertDomains,
  assertEnvironment,
  assertProject,
  assertTarget,
  BRANCH,
  ENVIRONMENT,
  PROJECT,
  PROJECT_NAME,
  REPOSITORY,
  STABLE_HOST,
  TEAM,
} from "../scripts/ci-policy.mjs";

const sha = "a".repeat(40);
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
