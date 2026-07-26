import json

from fastapi.testclient import TestClient

from thicket import corpus, db
from thicket.main import app


def _client(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    corpus_path = tmp_path / "initial" / "corpus.db"
    labels_path = tmp_path / "initial" / "labels.db"
    corpus.connect(str(corpus_path)).close()
    db.connect_labels(str(labels_path)).close()
    settings_file.write_text(json.dumps({
        "corpus_db": str(corpus_path),
        "labels_db": str(labels_path),
    }))
    monkeypatch.setenv("THICKET_SETTINGS_FILE", str(settings_file))
    return TestClient(app), settings_file


def test_workspace_reports_current_paths_and_counts(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    response = client.get("/workspace")
    assert response.status_code == 200
    body = response.json()
    assert body["corpus_db"].endswith("initial/corpus.db")
    assert body["labels_db"].endswith("initial/labels.db")
    assert body["counts"] == {
        "threads": 0, "comments": 0, "coders": 0,
        "codebooks": 0, "labels": 0,
    }


def test_workspace_can_create_and_persist_new_pair(monkeypatch, tmp_path):
    client, settings_file = _client(monkeypatch, tmp_path)
    corpus_path = tmp_path / "project-two" / "corpus.db"
    labels_path = tmp_path / "project-two" / "labels.db"
    response = client.put("/workspace", json={
        "corpus_db": str(corpus_path),
        "labels_db": str(labels_path),
        "create_missing": True,
    })
    assert response.status_code == 200
    assert corpus_path.exists()
    assert labels_path.exists()
    stored = json.loads(settings_file.read_text())
    assert stored["corpus_db"] == str(corpus_path)
    assert response.json()["counts"]["codebooks"] == 1


def test_workspace_refuses_missing_paths_without_create(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    response = client.put("/workspace", json={
        "corpus_db": str(tmp_path / "missing-corpus.db"),
        "labels_db": str(tmp_path / "missing-labels.db"),
        "create_missing": False,
    })
    assert response.status_code == 404


def test_workspace_rejects_non_thicket_database(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    wrong = tmp_path / "wrong.db"
    wrong.write_text("not sqlite")
    response = client.put("/workspace", json={
        "corpus_db": str(wrong),
        "labels_db": str(tmp_path / "initial" / "labels.db"),
        "create_missing": False,
    })
    assert response.status_code == 400


def test_workspace_rejects_same_file_for_corpus_and_labels(
        monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    path = str(tmp_path / "initial" / "corpus.db")
    response = client.put("/workspace", json={
        "corpus_db": path,
        "labels_db": path,
        "create_missing": False,
    })
    assert response.status_code == 400


def test_workspace_browser_lists_only_folders_and_databases(
        monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    folder = tmp_path / "browse"
    folder.mkdir()
    (folder / "nested").mkdir()
    (folder / "corpus.db").touch()
    (folder / "notes.txt").touch()

    response = client.get("/workspace/browse", params={"path": str(folder)})

    assert response.status_code == 200
    body = response.json()
    assert body["directory"] == str(folder)
    assert [(entry["name"], entry["kind"]) for entry in body["entries"]] == [
        ("nested", "directory"),
        ("corpus.db", "database"),
    ]
    assert body["parent"] == str(tmp_path)


def test_workspace_browser_rejects_missing_folder(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    response = client.get(
        "/workspace/browse", params={"path": str(tmp_path / "absent")})
    assert response.status_code == 404
