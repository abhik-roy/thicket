import sqlite3

import pytest
from fastapi.testclient import TestClient

from thicket.deps import get_conn
from thicket.main import app
from thicket import db


def _fixture_corpus(path: str, n_threads: int = 5) -> None:
    c = sqlite3.connect(path)
    c.execute("""CREATE TABLE threads (
        id TEXT PRIMARY KEY, subreddit TEXT NOT NULL, title TEXT NOT NULL,
        num_comments INTEGER, created_utc REAL NOT NULL,
        is_candidate INTEGER NOT NULL DEFAULT 1,
        hydrated INTEGER NOT NULL DEFAULT 0,
        n_comments_fetched INTEGER NOT NULL DEFAULT 0)""")
    c.execute("""CREATE TABLE comments (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, body TEXT,
        parent_id TEXT, depth INTEGER, is_submitter INTEGER,
        created_utc REAL NOT NULL)""")
    for i in range(n_threads):
        c.execute("INSERT INTO threads VALUES (?,?,?,?,?,1,?,?)",
                  (f"t{i:02d}", "sub" if i % 2 == 0 else "other",
                   f"Title {i}", 3, 1700000000.0 + i, int(i == 0),
                   3 if i == 0 else 0))
    for i in range(3):
        c.execute("INSERT INTO comments VALUES (?,?,?,?,?,?,?)",
                  (f"c{i}", "t00", f"body {i}",
                   "t3_t00" if i == 0 else f"t1_c{i-1}", i, 0,
                   1700000001.0 + i))
    c.commit()
    c.close()


@pytest.fixture
def client(tmp_path):
    corpus_path = str(tmp_path / "corpus.db")
    _fixture_corpus(corpus_path)
    labels_path = str(tmp_path / "labels.db")

    def override_conn():
        conn = db.connect_labels(labels_path)
        db.attach_corpus(conn, corpus_path)
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_conn] = override_conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_threads_paginates_by_cursor_not_offset(client):
    resp = client.get("/threads?limit=2")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["items"][0]["id"] == "t00"
    assert body["next_cursor"] == "t01"

    resp2 = client.get(f"/threads?limit=2&cursor={body['next_cursor']}")
    body2 = resp2.json()
    assert body2["items"][0]["id"] == "t02"


def test_list_threads_last_page_has_no_next_cursor(client):
    resp = client.get("/threads?limit=100")
    body = resp.json()
    assert len(body["items"]) == 5
    assert body["next_cursor"] is None


def test_list_threads_filters_by_subreddit(client):
    resp = client.get("/threads?subreddit=sub&limit=100")
    body = resp.json()
    assert all(t["subreddit"] == "sub" for t in body["items"])
    assert len(body["items"]) == 3


def test_list_threads_normalizes_common_subreddit_forms(client):
    for value in ("SUB", "r/sub", "r/sub/"):
        body = client.get(
            "/threads", params={"subreddit": value, "limit": 100}).json()
        assert len(body["items"]) == 3
        assert all(t["subreddit"] == "sub" for t in body["items"])


def test_list_communities_returns_corpus_options_and_counts(client):
    response = client.get("/communities")
    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {"name": "other", "thread_count": 2},
            {"name": "sub", "thread_count": 3},
        ],
    }


def test_list_threads_can_filter_to_hydrated_work_queue(client):
    resp = client.get("/threads?hydrated_only=true&limit=100")
    body = resp.json()
    assert [thread["id"] for thread in body["items"]] == ["t00"]


def test_get_single_thread(client):
    resp = client.get("/threads/t00")
    assert resp.status_code == 200
    assert resp.json()["id"] == "t00"


def test_get_missing_thread_404s(client):
    resp = client.get("/threads/doesnotexist")
    assert resp.status_code == 404


def test_list_comments_paginates_and_orders_by_id(client):
    resp = client.get("/threads/t00/comments?limit=2")
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["items"][0]["id"] == "c0"
    assert body["next_cursor"] == "c1"


def test_list_comments_rejects_unhydrated_thread(client):
    resp = client.get("/threads/t01/comments")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "thread comments have not been hydrated"


def test_list_comments_missing_thread_is_404(client):
    resp = client.get("/threads/missing/comments")
    assert resp.status_code == 404


def test_list_threads_limit_zero_returns_one_item_not_500(client):
    resp = client.get("/threads?limit=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1


def test_list_threads_negative_limit_does_not_bypass_cap(client):
    resp = client.get("/threads?limit=-5")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1


def test_list_comments_limit_zero_returns_one_item_not_500(client):
    resp = client.get("/threads/t00/comments?limit=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1


def test_list_comments_negative_limit_does_not_bypass_cap(client):
    resp = client.get("/threads/t00/comments?limit=-5")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
