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


def test_coded_status_batch(client):
    client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1})
    resp = client.get(
        "/coders/a/coded-status?pass_no=1&item_type=thread"
        "&item_ids=t1,t2,t3")
    assert resp.status_code == 200
    assert resp.json() == {"t1": True, "t2": False, "t3": False}


def test_coded_status_is_blind_to_other_coders(client):
    client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "b", "pass_no": 1})
    resp = client.get(
        "/coders/a/coded-status?pass_no=1&item_type=thread&item_ids=t1")
    assert resp.json() == {"t1": False}


def test_coded_status_is_blind_to_other_passes(client):
    client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "a", "pass_no": 2})
    resp = client.get(
        "/coders/a/coded-status?pass_no=1&item_type=thread&item_ids=t1")
    assert resp.json() == {"t1": False}


def test_coded_status_empty_item_ids_returns_empty_dict(client):
    resp = client.get(
        "/coders/a/coded-status?pass_no=1&item_type=thread&item_ids=")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_coded_status_rejects_more_than_200_ids(client):
    ids = ",".join(f"t{i}" for i in range(201))
    resp = client.get(
        f"/coders/a/coded-status?pass_no=1&item_type=thread&item_ids={ids}")
    assert resp.status_code == 400


def test_list_coders(client):
    resp = client.get("/coders")
    assert resp.status_code == 200
    assert {c["id"] for c in resp.json()} == {"a", "b"}


def test_create_coder(client):
    resp = client.post("/coders", json={"id": "c", "name": "C"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == "c"
    assert body["name"] == "C"


def test_create_coder_is_idempotent(client):
    payload = {"id": "d", "name": "D"}
    r1 = client.post("/coders", json=payload)
    r2 = client.post("/coders", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 200  # already existed, not an error


def test_create_coder_then_list_includes_it(client):
    client.post("/coders", json={"id": "e", "name": "E"})
    resp = client.get("/coders")
    assert "e" in {c["id"] for c in resp.json()}


def test_label_details_batch(client):
    resp1 = client.post("/labels", json={
        "item_type": "comment", "item_id": "c1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1})
    label_id = resp1.json()["id"]
    resp = client.get(
        "/coders/a/label-details?pass_no=1&item_type=comment"
        "&item_ids=c1,c2")
    assert resp.status_code == 200
    assert resp.json() == {
        "c1": [{"label_id": label_id, "code_id": "inc"}], "c2": [],
    }


def test_label_details_multiple_codes_on_one_item(client):
    client.post("/labels", json={
        "item_type": "comment", "item_id": "c1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1})
    client.post("/labels", json={
        "item_type": "comment", "item_id": "c1", "code_id": "exc",
        "coder_id": "a", "pass_no": 1})
    resp = client.get(
        "/coders/a/label-details?pass_no=1&item_type=comment&item_ids=c1")
    codes = {entry["code_id"] for entry in resp.json()["c1"]}
    assert codes == {"inc", "exc"}


def test_label_details_is_blind_to_other_coders(client):
    client.post("/labels", json={
        "item_type": "comment", "item_id": "c1", "code_id": "inc",
        "coder_id": "b", "pass_no": 1})
    resp = client.get(
        "/coders/a/label-details?pass_no=1&item_type=comment&item_ids=c1")
    assert resp.json() == {"c1": []}


def test_label_details_is_blind_to_other_passes(client):
    client.post("/labels", json={
        "item_type": "comment", "item_id": "c1", "code_id": "inc",
        "coder_id": "a", "pass_no": 2})
    resp = client.get(
        "/coders/a/label-details?pass_no=1&item_type=comment&item_ids=c1")
    assert resp.json() == {"c1": []}


def test_label_details_empty_item_ids_returns_empty_dict(client):
    resp = client.get(
        "/coders/a/label-details?pass_no=1&item_type=comment&item_ids=")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_label_details_rejects_more_than_200_ids(client):
    ids = ",".join(f"c{i}" for i in range(201))
    resp = client.get(
        f"/coders/a/label-details?pass_no=1&item_type=comment&item_ids={ids}")
    assert resp.status_code == 400


def test_assignment_status_batch(client):
    client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "done"})
    resp = client.get(
        "/coders/a/assignment-status?pass_no=1&item_type=thread"
        "&item_ids=t1,t2")
    assert resp.status_code == 200
    assert resp.json() == {"t1": True, "t2": False}


def test_assignment_status_is_blind_to_other_coders(client):
    client.post("/assignments", json={
        "coder_id": "b", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "done"})
    resp = client.get(
        "/coders/a/assignment-status?pass_no=1&item_type=thread&item_ids=t1")
    assert resp.json() == {"t1": False}


def test_assignment_status_is_blind_to_other_passes(client):
    client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 2, "status": "done"})
    resp = client.get(
        "/coders/a/assignment-status?pass_no=1&item_type=thread&item_ids=t1")
    assert resp.json() == {"t1": False}


def test_assignment_status_ignores_non_done_status(client):
    client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "in_progress"})
    resp = client.get(
        "/coders/a/assignment-status?pass_no=1&item_type=thread&item_ids=t1")
    assert resp.json() == {"t1": False}


def test_assignment_status_empty_item_ids_returns_empty_dict(client):
    resp = client.get(
        "/coders/a/assignment-status?pass_no=1&item_type=thread&item_ids=")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_assignment_status_rejects_more_than_200_ids(client):
    ids = ",".join(f"t{i}" for i in range(201))
    resp = client.get(
        f"/coders/a/assignment-status?pass_no=1&item_type=thread&item_ids={ids}")
    assert resp.status_code == 400


def test_create_assignment(client):
    resp = client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "done"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "done"


def test_create_assignment_is_idempotent(client):
    payload = {"coder_id": "a", "item_type": "thread", "item_id": "t1",
              "pass_no": 1, "status": "done"}
    r1 = client.post("/assignments", json=payload)
    r2 = client.post("/assignments", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 200


def test_create_assignment_updates_status_on_repost(client):
    client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "pending"})
    resp = client.post("/assignments", json={
        "coder_id": "a", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "done"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_create_assignment_with_unknown_coder_returns_400(client):
    resp = client.post("/assignments", json={
        "coder_id": "nope", "item_type": "thread", "item_id": "t1",
        "pass_no": 1, "status": "done"})
    assert resp.status_code == 400
