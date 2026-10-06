"""Run the real GitHub readiness job once in the source-accessible workspace.

Uses existing gh authorization, an ephemeral registration and a private workdir.
No service, permanent runner, copied credential or source proxy is installed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import uuid

import requests

REPO = "Lippen1995/Project_statsbudsjett"


def gh(*args):
    return subprocess.check_output(["gh", *args], stderr=subprocess.PIPE)


def runner_archive(cache):
    release = json.loads(gh("api", "repos/actions/runner/releases/latest"))
    asset = next(a for a in release["assets"] if a["name"].startswith("actions-runner-linux-x64-"))
    digest = asset.get("digest", "")
    if not digest.startswith("sha256:") or len(digest) != 71:
        raise ValueError("Official runner release has no SHA-256 digest")
    expected = digest.split(":", 1)[1]
    archive = cache / asset["name"]
    cache.mkdir(parents=True, exist_ok=True)
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        print("Downloading the official GitHub runner", flush=True)
        partial = archive.with_suffix(".partial")
        try:
            with requests.get(asset["browser_download_url"], stream=True, timeout=(30, 60)) as response:
                response.raise_for_status()
                with partial.open("wb") as output:
                    for chunk in response.iter_content(1024 * 1024):
                        output.write(chunk)
            if hashlib.sha256(partial.read_bytes()).hexdigest() != expected:
                raise ValueError("Runner release SHA-256 mismatch")
            partial.replace(archive)
        finally:
            partial.unlink(missing_ok=True)
    return archive


def run(ref, cache):
    archive = runner_archive(cache)
    with tempfile.TemporaryDirectory(prefix="budget-native-runner-") as root:
        root = Path(root)
        root.chmod(0o700)
        with tarfile.open(archive) as files:
            files.extractall(root, filter="data")
        registration = json.loads(gh("api", "--method", "POST", f"repos/{REPO}/actions/runners/registration-token"))
        token = registration["token"]
        with (root / "configuration.log").open("w") as log:
            configured = subprocess.run([
                str(root / "config.sh"), "--unattended", "--ephemeral", "--disableupdate",
                "--url", f"https://github.com/{REPO}", "--token", token,
                "--name", "budget-native-" + uuid.uuid4().hex[:12],
                "--labels", "budget-native-readiness", "--work", "_work",
            ], cwd=root, stdout=log, stderr=subprocess.STDOUT)
        if configured.returncode:
            # Never print registration arguments or unfiltered credential logs.
            detail = (root / "configuration.log").read_text().replace(token, "[redacted]")
            raise RuntimeError("Ephemeral runner registration failed: " + detail[-1500:])
        agent_id = json.loads((root / ".runner").read_text())["agentId"]
        try:
            # A main push may already have queued this exact readiness job.
            runs = json.loads(gh("run", "list", "--repo", REPO, "--workflow", "budget-readiness.yml",
                                "--branch", ref, "--limit", "5", "--json", "databaseId,status"))
            queued = [r for r in runs if r["status"] in ("queued", "pending", "waiting")]
            if not queued:
                gh("workflow", "run", "budget-readiness.yml", "--repo", REPO, "--ref", ref)
            print("Ephemeral readiness runner registered; running one real GitHub job", flush=True)
            completed = subprocess.run([str(root / "run.sh"), "--once"], cwd=root)
            if completed.returncode:
                raise RuntimeError("Native readiness runner exited unsuccessfully")
        finally:
            # Ephemeral runners normally remove themselves; also clean up on failure.
            subprocess.run(["gh", "api", "--method", "DELETE", f"repos/{REPO}/actions/runners/{agent_id}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Ephemeral runner and its local credentials removed", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default="main")
    parser.add_argument("--cache", type=Path, default=Path("/workspace/caches/budget-actions-runner"))
    args = parser.parse_args()
    run(args.ref, args.cache)
