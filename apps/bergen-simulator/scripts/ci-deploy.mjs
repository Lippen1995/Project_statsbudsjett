import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
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
} from "./ci-policy.mjs";

const app = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(app, "../..");
const local = (name) => resolve(app, ".vercel", name);
const read = (name) => JSON.parse(readFileSync(local(name), "utf8"));
const save = (name, value) =>
  writeFileSync(local(name), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = () => process.env.GITHUB_SHA;
const summary = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
};
const context = () => {
  assertContext(process.env, git("rev-parse", "HEAD"));
  assert.equal(
    git("status", "--porcelain=v1", "--untracked-files=no"),
    "",
    "Tracked source files changed after checkout",
  );
};
const target = () => {
  context();
  assertTarget(process.env);
  assert(
    process.env.VERCEL_TOKEN,
    "Missing environment-scoped VERCEL_TOKEN in bergen-simulator. No deployment attempted.",
  );
};

async function api(path, method = "GET") {
  assertTarget(process.env);
  assert(process.env.VERCEL_TOKEN, "Missing Bergen Vercel token");
  assert(path.startsWith("/") && !path.includes("?"), "Invalid API path");
  const response = await fetch(`https://api.vercel.com${path}?teamId=${TEAM}`, {
    method,
    redirect: "error",
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  // Never include raw API responses or request headers in errors.
  assert(
    response.ok,
    `Bergen Vercel API ${method} failed with HTTP ${response.status}`,
  );
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function protectedProject(before) {
  const project = await api(`/v9/projects/${PROJECT}`);
  assertProject(project);
  const result = await api(`/v9/projects/${PROJECT}/domains`);
  assert(
    Array.isArray(result.domains) && !result.pagination?.next,
    "Cannot verify the complete project domain list",
  );
  const domains = assertDomains(result.domains, before);
  return { project, domains };
}

function assertLink() {
  const link = read("project.json");
  assert.equal(
    link.projectId,
    PROJECT,
    "Local Vercel link points at another project",
  );
  assert.equal(link.orgId, TEAM, "Local Vercel link points at another team");
  return link;
}

function cli(args, authenticated = true) {
  assertTarget(process.env);
  assertLink();
  const env = { ...process.env, VERCEL_TELEMETRY_DISABLED: "1", NO_COLOR: "1" };
  if (!authenticated) {
    delete env.VERCEL_TOKEN;
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
  }
  const result = spawnSync("vercel", args, {
    cwd: app,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
  // CLI output may include pulled credentials or error payloads. Never echo it.
  assert.equal(
    result.status,
    0,
    `Vercel ${args[0]} failed (exit ${result.status ?? "unavailable"}): ${cliFailureSummary(result)}. Raw CLI output withheld to protect credentials.`,
  );
  return result.stdout.trim();
}

function deploymentUrl(value) {
  const url = new URL(value);
  assert.equal(url.origin, value, "Invalid deployment URL");
  assert.equal(url.protocol, "https:");
  assert.match(
    url.hostname,
    /^bergen-reimagined-[a-z0-9-]+\.vercel\.app$/,
    "Unexpected deployment hostname",
  );
  return url;
}

async function inspectDeployment(url) {
  const deployment = await api(
    `/v13/deployments/${deploymentUrl(url).hostname}`,
  );
  assertDeployment(deployment, sha());
  return deployment;
}

async function anonymousCheck(origin) {
  for (const path of ["/", "/data/bergen.json"]) {
    const response = await fetch(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    assertAnonymousDenied(
      response.status,
      response.headers.get("location"),
      await response.text(),
    );
  }
}

async function authenticatedCheck(origin) {
  // The pinned CLI's `vercel curl` can create a permanent protection-bypass secret.
  // Use only an existing, short-lived project OIDC token. Never generate a bypass.
  const path = local(".env.production.local");
  const match =
    existsSync(path) &&
    readFileSync(path, "utf8").match(/^VERCEL_OIDC_TOKEN=(.*)$/m);
  if (!match) return "not available: no short-lived project OIDC token";
  let token = match[1].trim();
  if (token.startsWith('"')) token = JSON.parse(token);
  else if (token.startsWith("'")) token = token.slice(1, -1);
  const parts = token.split(".");
  if (parts.length !== 3) return "not available: no usable project OIDC token";
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  assert.equal(
    claims.project_id,
    PROJECT,
    "OIDC token belongs to a different project",
  );
  if (claims.owner_id)
    assert.equal(
      claims.owner_id,
      TEAM,
      "OIDC token belongs to a different team",
    );
  if (claims.exp * 1000 <= Date.now())
    return "not available: project OIDC token expired";
  for (const [request, file] of [
    ["/", "index.html"],
    ["/data/bergen.json", "data/bergen.json"],
  ]) {
    const response = await fetch(origin + request, {
      redirect: "error",
      headers: { "x-vercel-trusted-oidc-idp-token": token },
      signal: AbortSignal.timeout(30000),
    });
    if ([401, 403].includes(response.status))
      return "not available: existing Trusted Sources rules do not authorize this token";
    assert.equal(
      response.status,
      200,
      "Authenticated application request failed",
    );
    const expected = readFileSync(local(`output/static/${file}`));
    const actual = Buffer.from(await response.arrayBuffer());
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    assert.equal(
      hash(actual),
      hash(expected),
      "Authenticated response differs from the validated build",
    );
  }
  return "passed: HTML and geographic snapshot match the prebuilt output";
}

async function gate() {
  context();
  let enabled = false;
  if (process.env.BERGEN_SIMULATOR_DEPLOY_ENABLED === "true") {
    const base = `https://api.github.com/repos/${REPOSITORY}/environments/${ENVIRONMENT}`;
    async function get(url) {
      // Environment metadata for this public repository is publicly readable.
      // No secret-read permission or production credentials are requested.
      const response = await fetch(url, {
        headers: { Accept: "application/vnd.github+json" },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      assert(
        response.ok,
        `Cannot verify bergen-simulator environment policy (HTTP ${response.status}); no deployment attempted`,
      );
      return response.json();
    }
    const environment = await get(base);
    const policies = await get(
      base + "/deployment-branch-policies?per_page=100",
    );
    assert(
      Array.isArray(policies.branch_policies) &&
        policies.total_count === policies.branch_policies.length,
      "Cannot verify all deployment branch policies",
    );
    assertEnvironment(environment, policies.branch_policies);
    enabled = true;
  }
  assert(process.env.GITHUB_OUTPUT, "Missing GitHub output file");
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${enabled}\n`);
  summary(
    enabled
      ? "Validation passed; the dedicated Bergen environment is armed."
      : "Validation passed. Deployment skipped: create the branch-restricted bergen-simulator environment, add its VERCEL_TOKEN, then set repository variable BERGEN_SIMULATOR_DEPLOY_ENABLED=true.",
  );
}

async function preflight() {
  target();
  const { project, domains } = await protectedProject();
  assert(
    [null, undefined, "", "apps/bergen-simulator"].includes(
      project.rootDirectory,
    ),
    "Unexpected project Root Directory",
  );
  const variables = await api(`/v10/projects/${PROJECT}/env`);
  assert(
    Array.isArray(variables.envs),
    "Cannot verify simulator environment-variable metadata",
  );
  assert.equal(
    variables.envs.length,
    0,
    "Simulator requires no custom project environment variables; remove them before deployment",
  );
  mkdirSync(local(""), { recursive: true });
  if (existsSync(local("project.json"))) assertLink();
  save("project.json", {
    orgId: TEAM,
    projectId: PROJECT,
    projectName: PROJECT_NAME,
  });
  save("bergen-release.json", { sha: sha(), domains });
  summary(
    "Verified exact Bergen project/team, All Deployments authentication, allowed domains and isolated environment. Local app link created.",
  );
}

async function pull() {
  target();
  assertLink();
  cli([
    "pull",
    "--yes",
    "--environment=production",
    "--git-branch",
    BRANCH,
    "--non-interactive",
  ]);
  const link = assertLink();
  assert(link.settings, "Vercel project settings were not pulled");
  for (const [key, allowed] of Object.entries({
    rootDirectory: [null, undefined, "", "apps/bergen-simulator"],
    buildCommand: [null, undefined, "npm run build"],
    outputDirectory: [null, undefined, "dist"],
    installCommand: [null, undefined, "npm ci"],
    framework: [null, undefined, "vite"],
  })) {
    assert(
      allowed.includes(link.settings[key]),
      `Unexpected Bergen project build setting: ${key}`,
    );
  }
  save("bergen-original-link.json", link);
  // Commands run inside the app, so the repository-relative root must not be
  // appended a second time. Only this runner-local copy is normalized.
  save("project.json", {
    ...link,
    settings: {
      ...link.settings,
      rootDirectory: null,
      buildCommand: "npm run build",
      installCommand: "npm ci",
      outputDirectory: "dist",
      framework: "vite",
    },
  });
  summary(
    "Pulled Bergen production configuration. Runner-local build root normalized to the app directory; remote settings unchanged.",
  );
}

function build() {
  context();
  assertTarget(process.env);
  assert(
    !process.env.VERCEL_TOKEN,
    "The build step must not receive the deployment token",
  );
  cli(["build", "--prod", "--non-interactive"], false);
  save("project.json", read("bergen-original-link.json"));
  assertLink();
  assert.equal(
    read("output/config.json").version,
    3,
    "Missing Vercel Build Output API configuration",
  );
  for (const name of ["index.html", "data/bergen.json"])
    assert(
      existsSync(local(`output/static/${name}`)),
      "Prebuilt app output is incomplete",
    );
  summary(
    "Vercel production build passed without the deployment token. Ready to stage prebuilt output.",
  );
}

async function stage() {
  target();
  assertLink();
  await protectedProject(read("bergen-release.json").domains);
  const url = parseStageOutput(
    cli([
      "deploy",
      "--prebuilt",
      "--prod",
      "--skip-domain",
      "--yes",
      "--non-interactive",
      "--format",
      "json",
      "--meta",
      `githubCommitSha=${sha()}`,
      "--meta",
      `githubCommitRef=${BRANCH}`,
      "--meta",
      "githubCommitOrg=Lippen1995",
      "--meta",
      "githubCommitRepo=Project_statsbudsjett",
    ]),
  );
  deploymentUrl(url);
  const deployment = await inspectDeployment(url);
  await anonymousCheck(url);
  const authenticated = await authenticatedCheck(url);
  save("bergen-staged.json", { url, id: deployment.id });
  summary(
    `Staged READY deployment ${deployment.id} for ${sha()}; stable domain unchanged. Authentication: All Deployments. Anonymous access denied. Authenticated check: ${authenticated}.`,
  );
}

async function promote() {
  target();
  assertLink();
  const release = read("bergen-release.json"),
    staged = read("bergen-staged.json");
  assert.equal(release.sha, sha());
  await protectedProject(release.domains);
  const deployment = await inspectDeployment(staged.url);
  assert.equal(deployment.id, staged.id);
  await anonymousCheck(staged.url);
  assert(
    process.env.GITHUB_TOKEN,
    "Missing read-only GitHub token for stale-commit check",
  );
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    },
  );
  assert(
    response.ok,
    "Cannot verify latest simulator commit; refusing promotion",
  );
  assert.equal(
    (await response.json()).object.sha,
    sha(),
    "Branch advanced; refusing to promote an obsolete build",
  );
  // Same project-scoped promotion endpoint as the established mirror pattern.
  // No user/team lookup, alias command, DNS mutation or protection mutation.
  await api(`/v10/projects/${PROJECT}/promote/${deployment.id}`, "POST");
  let assigned = false;
  for (let i = 0; i < 18; i++) {
    const alias = await api(`/v4/aliases/${STABLE_HOST}`);
    if (alias.projectId)
      assert.equal(
        alias.projectId,
        PROJECT,
        "Stable alias belongs to another project",
      );
    if ((alias.deploymentId ?? alias.deployment?.id) === deployment.id) {
      assigned = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  assert(
    assigned,
    "Stable alias did not reach the expected deployment; inspect the Bergen project",
  );
  await inspectDeployment(staged.url);
  await protectedProject(release.domains);
  await anonymousCheck(`https://${STABLE_HOST}`);
  const authenticated = await authenticatedCheck(`https://${STABLE_HOST}`);
  summary(
    `READY: https://${STABLE_HOST}\n\nCommit: ${sha()}\n\nDeployment: ${deployment.id}\n\nStable alias verified. Vercel Authentication: All Deployments. Anonymous access denied. Authenticated check: ${authenticated}. Project domain set unchanged.`,
  );
}

const commands = {
  guard: context,
  gate,
  preflight,
  pull,
  build,
  stage,
  promote,
  cleanup: () => rmSync(local(""), { recursive: true, force: true }),
};
try {
  assert(commands[process.argv[2]], "Unknown Bergen CI command");
  await commands[process.argv[2]]();
} catch (error) {
  // Assertion messages are authored here; raw network/CLI errors are withheld.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Bergen CI operation failed; raw response withheld to protect credentials.",
  );
  process.exitCode = 1;
}
