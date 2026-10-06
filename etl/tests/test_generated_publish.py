"""Real Git integration checks for simultaneous generated-data writers."""
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "generated_publish", Path(__file__).resolve().parents[2] / "scripts/commit-generated.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.fixture
def repository(tmp_path):
    origin, local, writer = (tmp_path / n for n in ("origin.git", "local", "writer"))
    module.git(tmp_path, "init", "--bare", str(origin))
    module.git(tmp_path, "init", "-b", "main", str(local))
    module.git(local, "config", "user.name", "Test")
    module.git(local, "config", "user.email", "test@example.com")
    module.git(local, "remote", "add", "origin", str(origin))
    meta = local / "web/public/data/meta.json"
    meta.parent.mkdir(parents=True)
    meta.write_text(json.dumps({"oppdatert": "2026-10-06T10:00:00+00:00", "budsjett_aar": [2026]}))
    module.git(local, "add", ".")
    module.git(local, "commit", "-m", "initial")
    module.git(local, "push", "-u", "origin", "main")
    module.git(tmp_path, "clone", "-b", "main", str(origin), str(writer))
    for key, value in (("user.name", "Other writer"), ("user.email", "other@example.com")):
        module.git(writer, "config", key, value)
    return local, writer


def stage(root, name, value):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))
    module.git(root, "add", "-f", name)


def push_writer(writer):
    module.git(writer, "commit", "-m", "concurrent update")
    module.git(writer, "push", "origin", "main")


def test_publish_preserves_remote_budget_metadata_and_latest_timestamp(repository):
    local, writer = repository
    name = "web/public/data/meta.json"
    stage(local, name, {"oppdatert": "2026-10-06T11:00:00+00:00", "budsjett_aar": [2026]})
    stage(writer, name, {"oppdatert": "2026-10-06T12:00:00+00:00", "budsjett_aar": [2026],
                         "budsjettforslag": [{"year": 2027}]})
    stage(writer, "editorial/note.json", {"keep": True})
    push_writer(writer)
    head = module.git(local, "rev-parse", "HEAD").stdout
    staged = module.git(local, "diff", "--cached").stdout
    assert module.publish(local, "ETL", ["web/public/data"])
    remote = json.loads(module.blob(local, "origin/main", name))
    assert remote["oppdatert"] == "2026-10-06T12:00:00+00:00"
    assert remote["budsjettforslag"] == [{"year": 2027}]
    assert json.loads(module.blob(local, "origin/main", "editorial/note.json")) == {"keep": True}
    assert module.git(local, "rev-parse", "HEAD").stdout == head
    assert module.git(local, "diff", "--cached").stdout == staged


def test_conflicting_amounts_stop_without_partial_publication(repository):
    local, writer = repository
    stage(local, "web/public/data/meta.json", {"budsjett_aar": [2027]})
    stage(writer, "web/public/data/meta.json", {"budsjett_aar": [2028]})
    push_writer(writer)
    with pytest.raises(ValueError, match="conflict"):
        module.publish(local, "ETL", ["web/public/data"])
    assert json.loads(module.blob(local, "origin/main", "web/public/data/meta.json")) == {"budsjett_aar": [2028]}
    assert len(module.git(local, "worktree", "list", "--porcelain").stdout.split(b"worktree ")) == 2


def test_independent_new_archive_and_duplicate_delivery(repository):
    local, writer = repository
    name = "web/public/data/party-research/documents/source.json"
    stage(local, name, {"text": "Verified original"})
    stage(writer, "web/public/data/other.json", {"data": 1})
    push_writer(writer)
    assert module.publish(local, "Archive", ["web/public/data"])
    assert not module.publish(local, "Archive again", ["web/public/data"])
    assert json.loads(module.blob(local, "origin/main", "web/public/data/other.json")) == {"data": 1}
    with pytest.raises(ValueError, match="regenerate"):
        module.merge_file(name, b'original', b'local', b'remote')


def test_publication_retries_if_main_moves_before_push(repository, monkeypatch):
    local, writer = repository
    stage(local, "web/public/data/local.json", {"data": 1})
    original = module.git
    pushes = []
    def racing_git(root, *args, **kwargs):
        if args[:3] == ("push", "origin", "HEAD:main"):
            pushes.append(True)
            if len(pushes) == 1:
                stage(writer, "web/public/data/remote.json", {"data": 2})
                push_writer(writer)
        return original(root, *args, **kwargs)
    monkeypatch.setattr(module, "git", racing_git)
    assert module.publish(local, "Local data", ["web/public/data"])
    assert len(pushes) == 2
    assert json.loads(module.blob(local, "origin/main", "web/public/data/remote.json")) == {"data": 2}


def test_unexpected_staged_code_cannot_be_published(repository):
    local, _ = repository
    stage(local, "etl/unsafe.json", {"code": True})
    with pytest.raises(ValueError, match="Unexpected staged file"):
        module.publish(local, "Unexpected", ["web/public/data"])
