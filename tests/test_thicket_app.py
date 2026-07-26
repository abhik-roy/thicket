from fastapi.testclient import TestClient

from thicket.config import Settings
from thicket.main import app


def test_settings_read_env_vars(monkeypatch):
    monkeypatch.setenv("THICKET_CORPUS_DB", "/tmp/c.db")
    monkeypatch.setenv("THICKET_LABELS_DB", "/tmp/l.db")
    s = Settings()
    assert s.corpus_db == "/tmp/c.db"
    assert s.labels_db == "/tmp/l.db"


def test_settings_have_sane_defaults(monkeypatch):
    monkeypatch.delenv("THICKET_CORPUS_DB", raising=False)
    monkeypatch.delenv("THICKET_LABELS_DB", raising=False)
    s = Settings()
    assert s.corpus_db == "data/corpus.db"
    assert s.labels_db == "data/labels.db"


def test_health_endpoint():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_deps_module_imports_standalone_with_no_ordering_requirement():
    """get_conn/Settings live in thicket.deps, which has no dependency on
    thicket.main or any router -- importing it first, before thicket.main
    is ever touched, must work with no import-order requirement."""
    import importlib
    import sys

    for mod in list(sys.modules):
        if mod == "thicket" or mod.startswith("thicket."):
            del sys.modules[mod]

    deps = importlib.import_module("thicket.deps")
    assert hasattr(deps, "get_conn")
    assert hasattr(deps, "Settings")


def test_cors_headers_present_for_cross_origin_request():
    client = TestClient(app)
    resp = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
