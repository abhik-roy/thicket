from thicket import corpus
from thicket.hydrate import pending_thread_ids, pending_threads, run_hydration

CONFIG = {"settings": {"min_comments": 20, "comment_page_size": 100,
                       "max_comment_pages": 30}}


class FakeClient:
    def __init__(self, by_thread):
        self.by_thread = by_thread
        self.requested = []

    def get_comments_paginated(self, post_id, page_size=100, max_pages=30):
        self.requested.append(post_id)
        return self.by_thread.get(post_id, [])


def _t(conn, tid, n, cand=1):
    corpus.upsert_thread(conn, {
        "id": tid, "subreddit": "s", "tier": "tier1", "title": "t",
        "selftext": "", "author": "a", "score": 0, "num_comments": n,
        "created_utc": 1.0, "permalink": "", "url": "", "matched_keywords": [],
        "matched_groups": [], "is_candidate": cand, "retrieved_at": "x",
        "raw_json": "{}"})


def _c(cid, parent, sub=0):
    return {"id": cid, "parent_id": parent, "author": "u", "body": "b",
            "score": 1, "ups": 1, "downs": 0, "controversiality": 0,
            "is_submitter": sub, "distinguished": None, "stickied": False,
            "collapsed": False, "created_utc": 2.0, "permalink": "/c"}


def test_floor_excludes_small_threads(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "big", 50)
    _t(conn, "small", 5)
    assert [r[0] for r in pending_threads(conn, 20)] == ["big"]


def test_noncandidates_are_never_pending(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "nope", 500, cand=0)
    assert pending_threads(conn, 20) == []


def test_biggest_trees_first(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "mid", 60)
    _t(conn, "huge", 900)
    _t(conn, "edge", 20)
    assert [r[0] for r in pending_threads(conn, 20)] == ["huge", "mid", "edge"]


def test_small_threads_cost_zero_comment_requests(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "small", 5)
    client = FakeClient({})
    run_hydration(conn, client, CONFIG)
    assert client.requested == []


def test_explicit_ids_bypass_floor_and_candidate_gate(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "small", 5)
    _t(conn, "noncandidate", 500, cand=0)
    _t(conn, "not-selected", 50)
    assert [r[0] for r in pending_thread_ids(
        conn, ["small", "noncandidate"]
    )] == ["noncandidate", "small"]

    client = FakeClient({
        "small": [_c("a", "t3_small")],
        "noncandidate": [_c("b", "t3_noncandidate")],
    })
    stats = run_hydration(
        conn, client, CONFIG, thread_ids=["small", "noncandidate"]
    )
    assert client.requested == ["noncandidate", "small"]
    assert stats == {"threads": 2, "comments": 2}
    assert conn.execute(
        "SELECT hydrated FROM threads WHERE id='not-selected'"
    ).fetchone()[0] == 0


def test_explicit_ids_are_deduplicated_and_skip_already_hydrated(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "small", 5)
    client = FakeClient({"small": [_c("a", "t3_small")]})
    run_hydration(conn, client, CONFIG, thread_ids=["small", "small"])
    client2 = FakeClient({"small": [_c("a", "t3_small")]})
    run_hydration(conn, client2, CONFIG, thread_ids=["small"])
    assert client.requested == ["small"]
    assert client2.requested == []


def test_hydration_persists_parent_id_and_derived_depth(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "big", 50)
    client = FakeClient({"big": [_c("a", "t3_big", sub=1), _c("b", "t1_a")]})
    stats = run_hydration(conn, client, CONFIG)
    rows = dict(conn.execute(
        "SELECT id, depth FROM comments").fetchall())
    assert rows == {"a": 0, "b": 1}
    assert conn.execute(
        "SELECT parent_id FROM comments WHERE id='b'").fetchone()[0] == "t1_a"
    assert conn.execute(
        "SELECT is_submitter FROM comments WHERE id='a'").fetchone()[0] == 1
    assert stats == {"threads": 1, "comments": 2}


def test_hydrated_threads_are_not_refetched(tmp_path):
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "big", 50)
    client = FakeClient({"big": [_c("a", "t3_big")]})
    run_hydration(conn, client, CONFIG)
    client2 = FakeClient({"big": [_c("a", "t3_big")]})
    run_hydration(conn, client2, CONFIG)
    assert client2.requested == []


def test_comment_missing_id_is_dropped_before_compute_depths(tmp_path):
    # This is the scenario that actually motivated the fix: a comment
    # missing "id" entirely. compute_depths (Task 3) does
    # `by_id = {c["id"]: c for c in comments}` with no .get() — it runs
    # BEFORE the per-comment persist loop, so this must be filtered out
    # earlier, not caught by the try/except around corpus.upsert_comment.
    # (A duplicate id would NOT exercise this at all: corpus.upsert_comment's
    # ON CONFLICT DO UPDATE handles duplicates silently, no exception ever
    # raised — that was the original, non-reproducing version of this test.)
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "big", 50)
    good = _c("a", "t3_big")
    malformed = {"parent_id": "t3_big", "author": "u", "body": "b", "score": 1,
                 "ups": 1, "downs": 0, "controversiality": 0, "is_submitter": 0,
                 "distinguished": None, "stickied": False, "collapsed": False,
                 "created_utc": 3.0, "permalink": "/c"}
    client = FakeClient({"big": [good, malformed]})
    # must not raise; good comment stored, thread still marked hydrated
    stats = run_hydration(conn, client, CONFIG)
    row = conn.execute("SELECT id FROM comments WHERE id='a'").fetchone()
    assert row is not None
    assert conn.execute(
        "SELECT hydrated FROM threads WHERE id='big'").fetchone()[0] == 1
    # only the good comment persists; the id-less one was dropped pre-filter
    assert conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 1
    assert stats == {"threads": 1, "comments": 1}


def test_upsert_failure_for_one_comment_does_not_abort_the_thread(tmp_path):
    # Exercises the try/except around corpus.upsert_comment itself: a comment
    # with an id but some other field shaped in a way that breaks the insert.
    # created_utc is REAL NOT NULL in the schema; passing None for it violates
    # that constraint at the SQL layer, independent of the id-presence filter.
    conn = corpus.connect(str(tmp_path / "c.db"))
    _t(conn, "big", 50)
    good = _c("a", "t3_big")
    bad_write = _c("b", "t3_big")
    bad_write["created_utc"] = None
    client = FakeClient({"big": [good, bad_write]})
    run_hydration(conn, client, CONFIG)
    assert conn.execute(
        "SELECT id FROM comments WHERE id='a'").fetchone() is not None
    assert conn.execute(
        "SELECT id FROM comments WHERE id='b'").fetchone() is None
    assert conn.execute(
        "SELECT hydrated FROM threads WHERE id='big'").fetchone()[0] == 1
