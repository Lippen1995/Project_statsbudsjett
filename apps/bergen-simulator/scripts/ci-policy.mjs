import assert from "node:assert/strict";

export const REPOSITORY = "Lippen1995/Project_statsbudsjett";
export const BRANCH = "feature/bergen-simulator";
export const TEAM = "team_zBf9uUPGwDQKfB9fElKD876W";
export const PROJECT = "prj_s9Bugj93zirfeEvLLwJvygz9syny";
export const PROJECT_NAME = "bergen-reimagined";
export const STABLE_HOST = "bergen-reimagined.vercel.app";
export const ENVIRONMENT = "bergen-simulator";

export function cliFailureSummary(result) {
  // Return only authored categories, never captured CLI text, URLs or credentials.
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const categories = [
    [
      /scope-not-accessible|do not have access to the specified account|not able to load user/i,
      "account identity lookup denied",
    ],
    [
      /scope-not-existent|specified scope does not exist/i,
      "scope lookup failed",
    ],
    [
      /invalid.token|token.*not valid|authentication.required|auth_required/i,
      "CLI authentication rejected",
    ],
    [/project.not.found|project_not_found/i, "CLI project lookup failed"],
    [/\b403\b|forbidden/i, "CLI request forbidden"],
    [/\b401\b|unauthorized/i, "CLI request unauthorized"],
    [
      /ERR_MODULE_NOT_FOUND|cannot find module|cannot find package/i,
      "CLI dependency unavailable",
    ],
    [
      /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i,
      "CLI network request failed",
    ],
  ];
  return (
    categories.find(([pattern]) => pattern.test(text))?.[1] ??
    "unclassified CLI failure"
  );
}

export function parseStageOutput(output) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    assert.fail("Pinned Vercel CLI did not return deployment JSON");
  }
  assert.equal(result.status, "ok", "Vercel CLI did not report success");
  assert.equal(
    result.deployment?.readyState,
    "READY",
    "Staged CLI deployment is not READY",
  );
  assert.equal(
    result.deployment?.target,
    "production",
    "Staged CLI deployment is not production",
  );
  assert.equal(
    typeof result.deployment.url,
    "string",
    "Missing deployment URL",
  );
  const url = new URL(result.deployment.url);
  assert.equal(url.origin, result.deployment.url, "Invalid deployment URL");
  assert.equal(url.protocol, "https:");
  assert.match(
    url.hostname,
    /^bergen-reimagined-[a-z0-9-]+\.vercel\.app$/,
    "Unexpected deployment hostname",
  );
  return url.origin;
}

export function assertContext(env, head) {
  assert.equal(
    env.GITHUB_ACTIONS,
    "true",
    "Deployment requires GitHub Actions",
  );
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY, "Wrong repository");
  assert.equal(
    env.GITHUB_REF,
    `refs/heads/${BRANCH}`,
    "Wrong deployment branch",
  );
  assert(
    ["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME),
    "Unsupported event",
  );
  assert.match(
    env.GITHUB_SHA ?? "",
    /^[a-f0-9]{40}$/,
    "Invalid triggering commit",
  );
  assert.equal(
    head,
    env.GITHUB_SHA,
    "Checkout is not the exact triggering commit",
  );
}

export function assertTarget(env) {
  assert.equal(env.VERCEL_ORG_ID, TEAM, "Refusing a different Vercel team");
  assert.equal(
    env.VERCEL_PROJECT_ID,
    PROJECT,
    "Refusing a different Vercel project",
  );
}

export function assertProject(project) {
  assert.equal(project.id, PROJECT, "Project API returned a different project");
  assert.equal(
    project.accountId ?? project.teamId,
    TEAM,
    "Project belongs to another team",
  );
  assert.equal(project.name, PROJECT_NAME, "Unexpected project name");
  assert.equal(
    project.ssoProtection?.deploymentType,
    "all",
    "Vercel Authentication must cover All Deployments",
  );
  assert.notEqual(
    project.ssoProtection?.enabled,
    false,
    "Vercel Authentication is disabled",
  );
}

export function assertDeployment(deployment, sha) {
  assert.equal(
    deployment.projectId ?? deployment.project?.id,
    PROJECT,
    "Deployment belongs to another project",
  );
  if (deployment.ownerId)
    assert.equal(
      deployment.ownerId,
      TEAM,
      "Deployment belongs to another team",
    );
  assert.equal(
    deployment.target,
    "production",
    "Expected a staged production deployment",
  );
  assert.equal(
    deployment.readyState ?? deployment.state,
    "READY",
    "Deployment is not READY",
  );
  assert.equal(
    deployment.meta?.githubCommitSha,
    sha,
    "Deployment commit mismatch",
  );
  assert.equal(
    deployment.meta?.githubCommitRef,
    BRANCH,
    "Deployment branch mismatch",
  );
  assert.equal(
    deployment.meta?.githubCommitOrg,
    "Lippen1995",
    "Deployment repository owner mismatch",
  );
  assert.equal(
    deployment.meta?.githubCommitRepo,
    "Project_statsbudsjett",
    "Deployment repository mismatch",
  );
  assert.match(deployment.id, /^dpl_[A-Za-z0-9]+$/);
}

export function assertDomains(domains, before) {
  const names = domains.map((d) => (typeof d === "string" ? d : d.name)).sort();
  const allowed = new Set([
    STABLE_HOST,
    "bergen-reimagined-fjord-insight.vercel.app",
    "bergen-reimagined-git-feature-bergen-simulator-fjord-insight.vercel.app",
  ]);
  assert(
    names.includes(STABLE_HOST),
    "The stable Bergen domain is not assigned to this project",
  );
  assert(
    names.every((name) => allowed.has(name)),
    "Unexpected domain attached to the Bergen project; refusing automatic promotion",
  );
  if (before)
    assert.deepEqual(
      names,
      before,
      "Project domain assignments changed during deployment",
    );
  return names;
}

export function assertEnvironment(environment, policies) {
  assert.equal(environment.name, ENVIRONMENT, "Wrong GitHub Environment");
  assert.equal(
    environment.deployment_branch_policy?.custom_branch_policies,
    true,
    "Environment must use selected deployment branches",
  );
  assert.equal(
    environment.deployment_branch_policy?.protected_branches,
    false,
    "Environment must select the simulator branch explicitly",
  );
  assert.deepEqual(
    policies.map((p) => ({ name: p.name, type: p.type })),
    [{ name: BRANCH, type: "branch" }],
    "Environment must allow only the exact simulator branch, with no tag or wildcard rules",
  );
}

export function assertAnonymousDenied(status, location, body) {
  if ([301, 302, 303, 307, 308].includes(status)) {
    const target = new URL(location);
    assert.equal(target.protocol, "https:");
    assert.equal(target.hostname, "vercel.com");
    assert.match(
      target.pathname,
      /\/(sso(?:-api)?|login)(\/|$)/,
      "Redirect does not lead to Vercel Authentication",
    );
  } else {
    assert([401, 403].includes(status), "Anonymous access was not denied");
    assert.match(
      body,
      /Authentication Required|Vercel Authentication|vercel\.com\/(sso|login)/i,
      "Response does not identify Vercel Authentication",
    );
  }
}
