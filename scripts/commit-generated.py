"""Publish staged generated files on fresh main without overwriting other writers.

Only independent JSON object changes and the latest meta timestamp can merge.
Conflicting values, arrays and immutable originals stop the publication.
The caller's checkout and staging area remain untouched.
"""
import argparse
import json
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path


MISSING = object()


def merge_json(base, local, remote, path=()):
    if local == base or local == remote:
        return remote
    if remote == base:
        return local
    if path == ("oppdatert",) and all(isinstance(v, str) for v in (local, remote)):
        return max((local, remote), key=datetime.fromisoformat)
    if all(isinstance(v, dict) for v in (base, local, remote)):
        result = {}
        for key in sorted(base.keys() | local.keys() | remote.keys()):
            value = merge_json(base.get(key, MISSING), local.get(key, MISSING),
                               remote.get(key, MISSING), (*path, key))
            if value is not MISSING:
                result[key] = value
        return result
    raise ValueError("Concurrent generated-data conflict at " + ".".join(path))


def merge_file(path, base, local, remote):
    if local == base or local == remote:
        return remote
    if remote == base:
        return local
    # Originals and archived versions are immutable. Never reconstruct them.
    if path != "web/public/data/meta.json" or None in (base, local, remote):
        raise ValueError(f"Concurrent change to {path}; regenerate from fresh main")
    value = merge_json(*(json.loads(v) for v in (base, local, remote)))
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def blob(root, ref, path):
    # A missing path differs from an empty file.
    result = git(root, "cat-file", "-e", f"{ref}:{path}", check=False)
    return None if result.returncode else git(root, "show", f"{ref}:{path}").stdout


def publish(root, message, allowed_roots):
    base = git(root, "rev-parse", "HEAD").stdout.decode().strip()
    names = git(root, "diff", "--cached", "--name-only", "-z").stdout.decode().split("\0")
    names = [n for n in names if n]
    for name in names:
        if not any(name == r or name.startswith(r.rstrip("/") + "/") for r in allowed_roots):
            raise ValueError(f"Unexpected staged file: {name}")
    changes = {name: (blob(root, base, name), blob(root, "", name)) for name in names}
    if not changes:
        return False
    with tempfile.TemporaryDirectory(prefix="generated-publish-") as tmp:
        checkout = Path(tmp) / "main"
        git(root, "fetch", "origin", "main")
        git(root, "worktree", "add", "--detach", str(checkout), "origin/main")
        try:
            for attempt in range(3):
                if attempt:
                    git(root, "fetch", "origin", "main")
                    git(checkout, "reset", "--hard", "origin/main")
                for name, (old, new) in changes.items():
                    merged = merge_file(name, old, new, blob(checkout, "HEAD", name))
                    target = checkout / name
                    if merged is None:
                        target.unlink(missing_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(merged)
                    git(checkout, "add", "-f", "--", name)
                if git(checkout, "diff", "--cached", "--quiet", check=False).returncode == 0:
                    return False
                git(checkout, "commit", "-m", message)
                result = git(checkout, "push", "origin", "HEAD:main", check=False)
                if result.returncode == 0:
                    return True
            raise RuntimeError("Main changed during all three publication attempts; retry on fresh main")
        finally:
            git(root, "worktree", "remove", "--force", str(checkout))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--message", required=True)
    parser.add_argument("--allowed-root", action="append", default=["web/public/data"])
    args = parser.parse_args()
    changed = publish(Path.cwd(), args.message, args.allowed_root)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"changed={str(changed).lower()}\n")
    print("Generated data published" if changed else "No new generated data")
