import pytest
from fastapi.testclient import TestClient

from thicket.deps import get_conn
from thicket.main import app
from thicket import db


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "l.db")
    conn = db.connect_labels(db_path)
    conn.execute("INSERT INTO coders VALUES ('a','Alice','x')")
    conn.execute("INSERT INTO codebooks VALUES ('cb','Test','',1,'x')")
    conn.execute("INSERT INTO codes VALUES ('inc','cb',NULL,'include','',"
                "'#0f0',NULL,NULL,0)")
    conn.execute("INSERT INTO labels VALUES ('l1','thread','t1','inc','a',"
                "1,'a note','2026-07-18T00:00:00Z')")
    conn.commit()
    conn.close()

    # TestClient dispatches sync dependencies on a different OS thread than
    # this fixture; sqlite3 connections are thread-affined by default, so
    # open a fresh connection to the same on-disk file per call instead of
    # reusing one already-open `conn` (see tests/test_thicket_api_labels.py).
    def override_conn():
        c = db.connect_labels(db_path)
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_conn] = override_conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_export_jsonl(client):
    resp = client.get("/export?codebook_id=cb&format=jsonl")
    assert resp.status_code == 200
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) == 1
    import json
    row = json.loads(lines[0])
    assert row["item_id"] == "t1"
    assert row["code_name"] == "include"
    assert row["coder_name"] == "Alice"


def test_export_csv(client):
    resp = client.get("/export?codebook_id=cb&format=csv")
    assert resp.status_code == 200
    assert "item_id" in resp.text.splitlines()[0]
    assert "t1" in resp.text


def test_export_rejects_unknown_format(client):
    resp = client.get("/export?codebook_id=cb&format=xml")
    assert resp.status_code == 400
