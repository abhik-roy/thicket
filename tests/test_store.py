import sqlite3
from thicket import corpus


def test_connect_creates_schema(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"threads", "comments", "search_hits", "fetch_log"} <= tables


def test_connect_creates_missing_parent_directories(tmp_path):
    path = tmp_path / "new" / "nested" / "corpus.db"
    corpus.connect(str(path)).close()
    assert path.exists()


def test_upsert_thread_is_idempotent(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    t = {"id": "abc123", "subreddit": "ExperiencedDevs", "tier": "tier1",
         "title": "t", "selftext": "s", "author": "a", "score": 1,
         "num_comments": 50, "created_utc": 1700000000.0, "permalink": "/p",
         "url": "http://u", "matched_keywords": ["AI"], "matched_groups": ["A_ai_context"],
         "is_candidate": 1, "retrieved_at": "2026-07-17T00:00:00Z",
         "raw_json": '{"id":"abc123"}'}
    corpus.upsert_thread(conn, t)
    t["score"] = 99
    corpus.upsert_thread(conn, t)
    rows = conn.execute("SELECT id, score FROM threads").fetchall()
    assert rows == [("abc123", 99)]


def test_upsert_comment_persists_parent_id_and_raw(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    corpus.upsert_thread(conn, _thread())
    c = {"id": "c1", "thread_id": "abc123", "parent_id": "t3_abc123",
         "author": "u", "body": "b", "score": 5, "ups": 5, "downs": 0,
         "controversiality": 0, "is_submitter": 1, "distinguished": None,
         "stickied": 0, "collapsed": 0, "created_utc": 1700000001.0,
         "depth": None, "permalink": "/c", "raw_json": '{"id":"c1"}'}
    corpus.upsert_comment(conn, c)
    row = conn.execute(
        "SELECT parent_id, is_submitter, raw_json FROM comments").fetchone()
    assert row == ("t3_abc123", 1, '{"id":"c1"}')


def test_window_log_roundtrip(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    assert corpus.window_done(conn, "r", "q", "2022-01-01", "2022-04-01") is False
    corpus.log_window(conn, "r", "q", "2022-01-01", "2022-04-01", "done", 7)
    assert corpus.window_done(conn, "r", "q", "2022-01-01", "2022-04-01") is True


def _thread():
    return {"id": "abc123", "subreddit": "s", "tier": "tier1", "title": "t",
            "selftext": "", "author": "a", "score": 0, "num_comments": 0,
            "created_utc": 1.0, "permalink": "", "url": "",
            "matched_keywords": [], "matched_groups": [], "is_candidate": 0,
            "retrieved_at": "x", "raw_json": "{}"}
