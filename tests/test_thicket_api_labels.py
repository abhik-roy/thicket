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
    conn.execute("INSERT INTO codebooks VALUES ('cb','Test','',1,'x')")
    conn.execute("INSERT INTO codes VALUES ('inc','cb',NULL,'include','',"
                "'#0f0',NULL,'1',0)")
    conn.commit()

    # NOTE: TestClient runs sync path operations/dependencies on an anyio
    # threadpool worker thread, distinct from this fixture's thread. sqlite3
    # connections are thread-affined by default (check_same_thread=True,
    # never overridden in db.py), so handing out the SAME already-open `conn`
    # object via `yield conn` raises "SQLite objects created in a thread can
    # only be used in that same thread." Open a fresh connection to the same
    # on-disk file per call instead -- mirrors the pattern already proven in
    # tests/test_thicket_api_items.py's override_conn.
    def override_conn():
        c = db.connect_labels(db_path)
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_conn] = override_conn
    yield TestClient(app)
    app.dependency_overrides.clear()
    conn.close()


def test_list_codebooks(client):
    resp = client.get("/codebooks")
    assert resp.status_code == 200
    assert [c["id"] for c in resp.json()] == ["cb"]


def test_list_codes_in_codebook(client):
    resp = client.get("/codebooks/cb/codes")
    assert resp.status_code == 200
    codes = resp.json()
    assert codes[0]["name"] == "include"
    assert codes[0]["hotkey"] == "1"


def test_user_can_create_update_and_delete_custom_code(client):
    book = client.post("/codebooks", json={
        "name": "Interview themes", "description": "Project codes",
    })
    assert book.status_code == 201
    book_id = book.json()["id"]

    created = client.post(f"/codebooks/{book_id}/codes", json={
        "name": "Trust", "description": "", "color": "#123456",
        "hotkey": "2",
    })
    assert created.status_code == 201
    code_id = created.json()["id"]

    updated = client.put(f"/codes/{code_id}", json={
        "name": "Calibrated trust", "description": "Revised",
        "color": "#654321", "hotkey": "3",
    })
    assert updated.status_code == 200
    assert updated.json()["name"] == "Calibrated trust"

    assert client.delete(f"/codes/{code_id}").status_code == 204
    assert client.delete(f"/codebooks/{book_id}").status_code == 204


def test_code_with_labels_cannot_be_deleted(client):
    client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1,
    })
    resp = client.delete("/codes/inc")
    assert resp.status_code == 409


def test_codebook_rejects_duplicate_hotkeys(client):
    book_id = client.post("/codebooks", json={
        "name": "Themes", "description": "",
    }).json()["id"]
    payload = {
        "name": "First", "description": "", "color": "#123456",
        "hotkey": "1",
    }
    assert client.post(
        f"/codebooks/{book_id}/codes", json=payload).status_code == 201
    payload["name"] = "Second"
    resp = client.post(f"/codebooks/{book_id}/codes", json=payload)
    assert resp.status_code == 409


def test_blank_code_names_are_rejected(client):
    resp = client.post("/codebooks/cb/codes", json={
        "name": "   ", "description": "", "color": "#123456",
        "hotkey": None,
    })
    assert resp.status_code == 422


def test_default_codebook_cannot_be_deleted(client):
    resp = client.delete("/codebooks/default")
    assert resp.status_code == 400



def test_create_label(client):
    resp = client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1})
    assert resp.status_code == 201
    body = resp.json()
    assert body["item_id"] == "t1"
    assert body["code_id"] == "inc"


def test_create_label_is_idempotent(client):
    payload = {"item_type": "thread", "item_id": "t1", "code_id": "inc",
              "coder_id": "a", "pass_no": 1}
    r1 = client.post("/labels", json=payload)
    r2 = client.post("/labels", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 200  # already existed, not an error


def test_create_label_with_unknown_code_id_returns_400_not_500(client):
    resp = client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "nope",
        "coder_id": "a", "pass_no": 1})
    assert resp.status_code == 400
    assert "code_id" in resp.json()["detail"]


def test_create_label_with_unknown_coder_id_returns_400_not_500(client):
    resp = client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "nope", "pass_no": 1})
    assert resp.status_code == 400
    assert "coder_id" in resp.json()["detail"]


def test_delete_label(client):
    resp = client.post("/labels", json={
        "item_type": "thread", "item_id": "t1", "code_id": "inc",
        "coder_id": "a", "pass_no": 1})
    label_id = resp.json()["id"]
    del_resp = client.delete(f"/labels/{label_id}")
    assert del_resp.status_code == 204
    get_resp = client.get("/items/thread/t1/labels?coder_id=a&pass_no=1")
    assert get_resp.json() == []
