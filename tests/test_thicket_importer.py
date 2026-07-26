from thicket import importer
from thicket import corpus


class FakeArcticClient:
    def __init__(self, **_kwargs):
        pass

    def search_subreddit(self, **_kwargs):
        return [{
            "id": "t1",
            "subreddit": "AskAcademia",
            "title": "A research discussion",
            "selftext": "Experiences with review",
            "author": "researcher",
            "score": 12,
            "num_comments": 1,
            "created_utc": 1.0,
            "permalink": "/r/AskAcademia/comments/t1",
            "url": "https://reddit.example/t1",
        }]

    def get_comments_paginated(self, *_args, **_kwargs):
        return [{
            "id": "c1",
            "parent_id": "t3_t1",
            "author": "participant",
            "body": "A reply",
            "score": 2,
            "created_utc": 2.0,
        }]


def test_import_threads_stores_and_hydrates_matches(tmp_path, monkeypatch):
    monkeypatch.setattr(importer, "ArcticShiftClient", FakeArcticClient)
    corpus_path = str(tmp_path / "corpus.db")

    result = importer.import_threads(
        corpus_path, "r/AskAcademia", "peer review", limit=5)

    assert result == {
        "matched": 1,
        "stored": 1,
        "hydrated": 1,
        "comments": 1,
        "thread_ids": ["t1"],
    }
    conn = corpus.connect(corpus_path)
    assert conn.execute(
        "SELECT subreddit, tier, hydrated FROM threads").fetchone() == (
            "AskAcademia", "imported", 1)
    assert conn.execute(
        "SELECT thread_id, parent_id, body FROM comments").fetchone() == (
            "t1", "t3_t1", "A reply")


def test_import_threads_requires_subreddit_and_query(tmp_path):
    for subreddit, query in [("", "topic"), ("AskAcademia", "")]:
        try:
            importer.import_threads(str(tmp_path / "c.db"), subreddit, query)
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError")
