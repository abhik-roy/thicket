import sqlite3

import pytest

from thicket import db


def test_connect_labels_creates_schema(tmp_path):
    conn = db.connect_labels(str(tmp_path / "labels.db"))
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"coders", "codebooks", "codes", "labels", "assignments",
            "adjudications"} <= tables


def test_connect_labels_creates_missing_parent_directories(tmp_path):
    path = tmp_path / "new" / "nested" / "labels.db"
    db.connect_labels(str(path)).close()
    assert path.exists()


def test_connect_labels_is_idempotent(tmp_path):
    path = str(tmp_path / "labels.db")
    db.connect_labels(path).close()
    conn = db.connect_labels(path)  # must not raise on second open
    assert conn.execute("SELECT COUNT(*) FROM coders").fetchone()[0] == 0


def _make_fixture_corpus(path: str) -> None:
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT NOT NULL)")
    c.execute("INSERT INTO threads VALUES ('t1', 'hello')")
    c.commit()
    c.close()


def test_attach_corpus_allows_reads(tmp_path):
    corpus_path = str(tmp_path / "corpus.db")
    _make_fixture_corpus(corpus_path)
    conn = db.connect_labels(str(tmp_path / "labels.db"))
    db.attach_corpus(conn, corpus_path)
    rows = conn.execute("SELECT id, title FROM corpus.threads").fetchall()
    assert rows == [("t1", "hello")]


def test_attach_corpus_handles_apostrophe_in_path(tmp_path):
    corpus_path = str(tmp_path / "researcher's corpus.db")
    _make_fixture_corpus(corpus_path)
    conn = db.connect_labels(str(tmp_path / "labels.db"))
    db.attach_corpus(conn, corpus_path)
    assert conn.execute(
        "SELECT title FROM corpus.threads").fetchone() == ("hello",)



def test_attach_corpus_blocks_writes(tmp_path):
    corpus_path = str(tmp_path / "corpus.db")
    _make_fixture_corpus(corpus_path)
    conn = db.connect_labels(str(tmp_path / "labels.db"))
    db.attach_corpus(conn, corpus_path)
    with pytest.raises(sqlite3.OperationalError, match="readonly"):
        conn.execute("INSERT INTO corpus.threads VALUES ('t2', 'nope')")
        conn.commit()
