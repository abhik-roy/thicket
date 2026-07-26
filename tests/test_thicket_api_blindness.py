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
                "'#0f0',NULL,'1',0)")
    conn.execute("INSERT INTO codes VALUES ('exc','cb',NULL,'exclude','',"
                "'#f00',NULL,'2',1)")
    now = "2026-07-18T00:00:00Z"
    # coder a, pass 1: labels t1 'include'
    conn.execute("INSERT INTO labels VALUES ('l1','thread','t1','inc','a',"
                "1,NULL,?)", (now,))
    # coder b, pass 1: labels t1 'exclude' -- a's blind partner
    conn.execute("INSERT INTO labels VALUES ('l2','thread','t1','exc','b',"
                "1,NULL,?)", (now,))
    # coder a, pass 2 (a LATER, different pass): labels t1 'exclude'
    conn.execute("INSERT INTO labels VALUES ('l3','thread','t1','exc','a',"
                "2,NULL,?)", (now,))
    conn.commit()
    conn.close()

    # See tests/test_thicket_api_labels.py for why: TestClient dispatches
    # sync dependencies on a different OS thread than this fixture, and
    # sqlite3 connections are thread-affined by default -- open a fresh
    # connection to the same on-disk file per call instead of reusing one.
    def override_conn():
        c = db.connect_labels(db_path)
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_conn] = override_conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_coder_sees_only_own_labels_for_the_requested_pass(client):
    resp = client.get("/items/thread/t1/labels?coder_id=a&pass_no=1")
    body = resp.json()
    assert len(body) == 1
    assert body[0]["id"] == "l1"


def test_coder_a_pass1_response_contains_no_coder_b_labels(client):
    resp = client.get("/items/thread/t1/labels?coder_id=a&pass_no=1")
    ids = {l["id"] for l in resp.json()}
    assert "l2" not in ids  # coder b's label


def test_coder_a_pass1_response_contains_no_pass2_labels_even_own(client):
    resp = client.get("/items/thread/t1/labels?coder_id=a&pass_no=1")
    ids = {l["id"] for l in resp.json()}
    assert "l3" not in ids  # a's OWN pass-2 label, still excluded
