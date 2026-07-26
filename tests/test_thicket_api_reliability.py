import pytest
from fastapi.testclient import TestClient

from thicket.deps import get_conn
from thicket.main import app
from thicket import db


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "l.db")
    conn = db.connect_labels(db_path)
    conn.execute("INSERT INTO coders VALUES ('a','A','x')")
    conn.execute("INSERT INTO coders VALUES ('b','B','x')")
    conn.execute("INSERT INTO codebooks VALUES ('cb','Test','',1,'x')")
    conn.execute("INSERT INTO codes VALUES ('inc','cb',NULL,'include','',"
                "'#0f0',NULL,NULL,0)")
    now = "2026-07-18T00:00:00Z"
    # t1: both include (agree). t2: a=include, b=absent (disagree).
    conn.execute("INSERT INTO labels VALUES ('l1','thread','t1','inc','a',"
                "1,NULL,?)", (now,))
    conn.execute("INSERT INTO labels VALUES ('l2','thread','t1','inc','b',"
                "1,NULL,?)", (now,))
    conn.execute("INSERT INTO labels VALUES ('l3','thread','t2','inc','a',"
                "1,NULL,?)", (now,))
    # t2 needs a "touched by b" marker with a DIFFERENT code so it's in
    # the population but disagrees on 'inc' presence
    conn.execute("INSERT INTO codes VALUES ('exc','cb',NULL,'exclude','',"
                "'#f00',NULL,NULL,1)")
    conn.execute("INSERT INTO labels VALUES ('l4','thread','t2','exc','b',"
                "1,NULL,?)", (now,))
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


def test_kappa_endpoint(client):
    resp = client.get("/codebooks/cb/kappa?item_type=thread&code_id=inc"
                      "&coder_a=a&pass_a=1&coder_b=b&pass_b=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["n"] == 2
    assert body["agree"] == 1


def test_pending_adjudications_lists_the_disagreement(client):
    resp = client.get(
        "/codebooks/cb/adjudications/pending?item_type=thread&code_id=inc"
        "&coder_a=a&pass_a=1&coder_b=b&pass_b=1")
    assert resp.status_code == 200
    items = resp.json()
    assert [i["item_id"] for i in items] == ["t2"]


def test_resolving_an_adjudication_removes_it_from_pending(client):
    client.post("/adjudications", json={
        "item_type": "thread", "item_id": "t2", "code_id": "inc",
        "decision": 1, "resolved_by": "a", "rationale": "manual call"})
    resp = client.get(
        "/codebooks/cb/adjudications/pending?item_type=thread&code_id=inc"
        "&coder_a=a&pass_a=1&coder_b=b&pass_b=1")
    assert resp.json() == []
